import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import type { Env, MonitorStatus } from '../types';
import { resolveTimeZone, tzDayString, tzStartOfDay } from '../tz';

interface DayBar {
  day: string;
  /** Uptime percentage for the day, or null when no data was recorded. */
  uptime: number | null;
  total: number;
  okCount: number;
  avgRt: number | null;
}

interface MonitorView {
  id: number;
  name: string;
  url: string;
  status: MonitorStatus;
  lastCheckedAt: number | null;
  uptime24h: number | null;
  avgRtMs: number | null;
  /** Data center that ran the most recent check. */
  lastColo: string | null;
  /** Distinct data centers seen in the last 24h, for context on RT variance. */
  colos24h: string[];
  /** Last 90 days of daily uptime, oldest first. */
  bars: DayBar[];
}

interface IncidentView {
  name: string;
  startedAt: number;
  resolvedAt: number | null;
  cause: string | null;
}

interface StatusData {
  monitors: MonitorView[];
  incidents: IncidentView[];
  allOperational: boolean;
  generatedAt: number;
}

interface MonRow {
  id: number;
  name: string;
  url: string;
  current_status: string;
  last_checked_at: number | null;
  last_colo: string | null;
}
interface StatRow {
  monitor_id: number;
  total: number;
  ok_count: number;
  avg_rt: number | null;
  colos: string | null;
}
interface IncRow {
  name: string;
  started_at: number;
  resolved_at: number | null;
  cause: string | null;
}
interface DailyRow {
  monitor_id: number;
  day: string;
  total: number;
  ok_count: number;
  avg_rt_ms: number | null;
}

const DAY_SECONDS = 86400;
const UPTIME_BAR_DAYS = 90;

/** Load everything the status page needs in a single D1 batch round-trip. */
export async function getStatusData(env: Env): Promise<StatusData> {
  const now = Math.floor(Date.now() / 1000);
  const since = now - DAY_SECONDS;
  const tz = resolveTimeZone(env.TIMEZONE);
  // 日境界を表示タイムゾーンに合わせる(集計側のrollupAndPruneと同一基準)
  const startOfToday = tzStartOfDay(tz, now);
  // 90日バーの起点(89日前のローカル0:00)をday文字列で求める
  const barSince = tzDayString(tz, startOfToday - (UPTIME_BAR_DAYS - 1) * DAY_SECONDS);

  const batch = await env.DB.batch([
    env.DB.prepare(
      `SELECT m.id AS id, m.name AS name, m.url AS url, m.current_status AS current_status,
              m.last_checked_at AS last_checked_at,
              (SELECT c.colo FROM checks c WHERE c.monitor_id = m.id
                 ORDER BY c.checked_at DESC LIMIT 1) AS last_colo
       FROM monitors m WHERE m.enabled = 1 ORDER BY m.name`,
    ),
    env.DB.prepare(
      `SELECT monitor_id, COUNT(*) AS total, SUM(ok) AS ok_count, AVG(response_time_ms) AS avg_rt,
              GROUP_CONCAT(DISTINCT colo) AS colos
       FROM checks WHERE checked_at >= ? GROUP BY monitor_id`,
    ).bind(since),
    env.DB.prepare(
      `SELECT m.name AS name, i.started_at AS started_at, i.resolved_at AS resolved_at, i.cause AS cause
       FROM incidents i JOIN monitors m ON m.id = i.monitor_id
       ORDER BY i.started_at DESC LIMIT 20`,
    ),
    env.DB.prepare(
      `SELECT monitor_id, day, total, ok_count, avg_rt_ms FROM daily_stats
       WHERE day >= ? ORDER BY day`,
    ).bind(barSince),
  ]);

  const monRows = (batch[0]?.results ?? []) as unknown as MonRow[];
  const statRows = (batch[1]?.results ?? []) as unknown as StatRow[];
  const incRows = (batch[2]?.results ?? []) as unknown as IncRow[];
  const dailyRows = (batch[3]?.results ?? []) as unknown as DailyRow[];

  const statByMonitor = new Map<number, StatRow>();
  for (const s of statRows) statByMonitor.set(s.monitor_id, s);

  // monitor_id -> (day -> DailyRow) の二段マップ
  const dailyByMonitor = new Map<number, Map<string, DailyRow>>();
  for (const d of dailyRows) {
    let m = dailyByMonitor.get(d.monitor_id);
    if (!m) {
      m = new Map<string, DailyRow>();
      dailyByMonitor.set(d.monitor_id, m);
    }
    m.set(d.day, d);
  }

  // 表示する90日分のday列(古い順)。集計と同じtz基準で生成する
  const barDays: string[] = [];
  for (let i = UPTIME_BAR_DAYS - 1; i >= 0; i--) {
    barDays.push(tzDayString(tz, startOfToday - i * DAY_SECONDS));
  }

  const monitors: MonitorView[] = monRows.map((m) => {
    const s = statByMonitor.get(m.id);
    const colos24h = s?.colos ? s.colos.split(',').filter(Boolean).sort() : [];
    const dayMap = dailyByMonitor.get(m.id);
    const bars: DayBar[] = barDays.map((day) => {
      const d = dayMap?.get(day);
      if (!d || d.total === 0) {
        return { day, uptime: null, total: 0, okCount: 0, avgRt: null };
      }
      return {
        day,
        uptime: (d.ok_count / d.total) * 100,
        total: d.total,
        okCount: d.ok_count,
        avgRt: d.avg_rt_ms,
      };
    });
    return {
      id: m.id,
      name: m.name,
      url: m.url,
      status: m.current_status as MonitorStatus,
      lastCheckedAt: m.last_checked_at,
      uptime24h: s && s.total > 0 ? (s.ok_count / s.total) * 100 : null,
      avgRtMs: s?.avg_rt != null ? Math.round(s.avg_rt) : null,
      lastColo: m.last_colo,
      colos24h,
      bars,
    };
  });

  const incidents: IncidentView[] = incRows.map((i) => ({
    name: i.name,
    startedAt: i.started_at,
    resolvedAt: i.resolved_at,
    cause: i.cause,
  }));

  const allOperational = monitors.length > 0 && monitors.every((m) => m.status === 'up');

  return { monitors, incidents, allOperational, generatedAt: now };
}

const STYLE = `
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; max-width: 820px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
  h1 { font-size: 1.5rem; }
  .summary { padding: 0.75rem 1rem; border-radius: 8px; font-weight: 600; margin-bottom: 1.5rem; }
  .summary.ok { background: #e6f4ea; color: #1e4620; }
  .summary.bad { background: #fce8e6; color: #5f1411; }
  .card { padding: 0.75rem 1rem; border: 1px solid #8883; border-radius: 8px; margin-bottom: 0.5rem; }
  .card-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .card .meta { color: #8889; font-size: 0.85rem; }
  .bars { display: flex; gap: 2px; margin-top: 0.6rem; height: 26px; }
  .bar-wrap { flex: 1 1 0; min-width: 2px; position: relative; display: flex; }
  .bar { flex: 1; border-radius: 2px; background: #8883; }
  .bar.ok { background: #43a047; }
  .bar.warn { background: #fb8c00; }
  .bar.bad { background: #e53935; }
  .tip { position: absolute; bottom: 135%; left: 50%; transform: translateX(-50%);
         background: #1e1e1eee; color: #fff; padding: 6px 9px; border-radius: 6px;
         font-size: 0.75rem; line-height: 1.4; white-space: nowrap; text-align: left;
         box-shadow: 0 2px 8px #0006; opacity: 0; visibility: hidden;
         transition: opacity 0.12s; z-index: 10; pointer-events: none; }
  .tip::after { content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
                border: 5px solid transparent; border-top-color: #1e1e1eee; }
  .bar-wrap:hover .tip { opacity: 1; visibility: visible; }
  .tip .k { color: #aaa; }
  .badge { padding: 0.15rem 0.6rem; border-radius: 999px; font-size: 0.8rem; font-weight: 600; white-space: nowrap; }
  .badge.up { background: #43a047; color: #fff; }
  .badge.down { background: #e53935; color: #fff; }
  .badge.unknown { background: #9e9e9e; color: #fff; }
  .name { font-weight: 600; }
  .url { color: #8889; font-size: 0.85rem; word-break: break-all; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-top: 0.5rem; }
  td, th { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid #8883; }
  footer { margin-top: 2rem; color: #8889; font-size: 0.8rem; }
`;

/** Format a unix timestamp (seconds) in the given IANA time zone. */
function fmtTime(unix: number | null, tz: string): string {
  if (unix == null) return '-';
  // sv-SEロケールは "YYYY-MM-DD HH:mm:ss" 形式を返すため整形に都合がよい
  const formatted = new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(unix * 1000));
  return `${formatted} (${tz})`;
}

/** Map a daily uptime percentage to a bar color class (empty = no-data grey). */
function barClass(uptime: number | null): string {
  if (uptime == null) return '';
  if (uptime >= 99.9) return 'ok';
  if (uptime >= 95) return 'warn';
  return 'bad';
}

/** Render the public status page as an HTML string. */
export function renderStatusPage(
  data: StatusData,
  timeZone: string,
): HtmlEscapedString | Promise<HtmlEscapedString> {
  const tz = resolveTimeZone(timeZone);
  const summaryClass = data.allOperational ? 'ok' : 'bad';
  const summaryText =
    data.monitors.length === 0
      ? 'No monitors configured'
      : data.allOperational
        ? 'All Systems Operational'
        : 'Some Systems Are Down';

  const cards = data.monitors.map(
    (m) => html`
      <div class="card">
        <div class="card-head">
          <div>
            <div class="name">${m.name}</div>
            <div class="url">${m.url}</div>
            <div class="meta">
              24h uptime: ${m.uptime24h == null ? '-' : `${m.uptime24h.toFixed(2)}%`}
              ${m.avgRtMs == null ? '' : raw(` &middot; avg ${m.avgRtMs}ms`)}
              &middot; last check: ${fmtTime(m.lastCheckedAt, tz)}
            </div>
            <div class="meta">
              measured from: ${m.lastColo ?? '-'}
              ${m.colos24h.length > 1 ? raw(` &middot; 24h colos: ${m.colos24h.join(', ')}`) : ''}
            </div>
          </div>
          <span class="badge ${m.status}">${m.status.toUpperCase()}</span>
        </div>
        <div class="bars">
          ${m.bars.map(
            (b) => html`<div class="bar-wrap">
              <span class="bar ${barClass(b.uptime)}"></span>
              <span class="tip">
                <b>${b.day}</b><br />
                ${
                  b.uptime == null
                    ? raw('<span class="k">No data</span>')
                    : html`<span class="k">Uptime</span> ${b.uptime.toFixed(2)}%<br />
                        <span class="k">Checks</span> ${b.okCount}/${b.total} ok<br />
                        <span class="k">Avg RT</span> ${b.avgRt == null ? '-' : `${b.avgRt}ms`}`
                }
              </span>
            </div>`,
          )}
        </div>
      </div>
    `,
  );

  const incidentRows = data.incidents.map(
    (i) => html`
      <tr>
        <td>${i.name}</td>
        <td>${fmtTime(i.startedAt, tz)}</td>
        <td>${i.resolvedAt == null ? raw('<b>ongoing</b>') : fmtTime(i.resolvedAt, tz)}</td>
        <td>${i.cause ?? '-'}</td>
      </tr>
    `,
  );

  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta http-equiv="refresh" content="60" />
        <title>Service Status</title>
        <style>
          ${raw(STYLE)}
        </style>
      </head>
      <body>
        <h1>Service Status</h1>
        <div class="summary ${summaryClass}">${summaryText}</div>
        ${cards}
        <h2>Recent Incidents</h2>
        ${
          data.incidents.length === 0
            ? html`<p>No incidents recorded.</p>`
            : html`<table>
                <thead>
                  <tr><th>Monitor</th><th>Started</th><th>Resolved</th><th>Cause</th></tr>
                </thead>
                <tbody>
                  ${incidentRows}
                </tbody>
              </table>`
        }
        <footer>
          Generated at ${fmtTime(data.generatedAt, tz)}. Times shown in ${tz}.
          Auto-refresh every 60s.
        </footer>
      </body>
    </html>`;
}
