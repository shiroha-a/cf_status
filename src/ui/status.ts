import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import type { Env, MonitorStatus } from '../types';
import { resolveTimeZone, tzDayString, tzStartOfDay } from '../tz';
import { renderRich } from './layouts/rich';
import {
  barClass,
  DAY_SECONDS,
  type DayBar,
  fmtTime,
  type HourPoint,
  type IncidentView,
  type MonitorView,
  type StatusData,
  sparklineSvg,
  UPTIME_BAR_DAYS,
} from './shared';
import { type Theme, themeToCss } from './theme';

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
interface HourlyRow {
  monitor_id: number;
  hour: string;
  total: number;
  ok_count: number;
}

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
    // 監視をやめたmonitorのincidentは閲覧者にとってノイズなので除外する。
    // 行自体は削除しないので、configに戻せば履歴も再び表示される
    env.DB.prepare(
      `SELECT m.name AS name, i.started_at AS started_at, i.resolved_at AS resolved_at, i.cause AS cause
       FROM incidents i JOIN monitors m ON m.id = i.monitor_id
       WHERE m.enabled = 1
       ORDER BY i.started_at DESC LIMIT 20`,
    ),
    env.DB.prepare(
      `SELECT monitor_id, day, total, ok_count, avg_rt_ms FROM daily_stats
       WHERE day >= ? ORDER BY day`,
    ).bind(barSince),
    env.DB.prepare(
      `SELECT monitor_id, hour, total, ok_count FROM hourly_stats
       WHERE hour >= ? ORDER BY hour`,
    ).bind(barSince),
  ]);

  const monRows = (batch[0]?.results ?? []) as unknown as MonRow[];
  const statRows = (batch[1]?.results ?? []) as unknown as StatRow[];
  const incRows = (batch[2]?.results ?? []) as unknown as IncRow[];
  const dailyRows = (batch[3]?.results ?? []) as unknown as DailyRow[];
  const hourlyRows = (batch[4]?.results ?? []) as unknown as HourlyRow[];

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

  // monitor_id -> (day -> (hour0-23 -> uptime%)) の三段マップ
  const hourlyByMonitor = new Map<number, Map<string, Map<number, number>>>();
  for (const r of hourlyRows) {
    if (r.total === 0) continue;
    const day = r.hour.slice(0, 10);
    const h = Number(r.hour.slice(11, 13));
    let dm = hourlyByMonitor.get(r.monitor_id);
    if (!dm) {
      dm = new Map<string, Map<number, number>>();
      hourlyByMonitor.set(r.monitor_id, dm);
    }
    let hm = dm.get(day);
    if (!hm) {
      hm = new Map<number, number>();
      dm.set(day, hm);
    }
    hm.set(h, (r.ok_count / r.total) * 100);
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
    const hourDayMap = hourlyByMonitor.get(m.id);
    const bars: DayBar[] = barDays.map((day) => {
      const hm = hourDayMap?.get(day);
      const hourly: HourPoint[] = Array.from({ length: 24 }, (_, h) => ({
        h,
        up: hm?.get(h) ?? null,
      }));
      const d = dayMap?.get(day);
      if (!d || d.total === 0) {
        return { day, uptime: null, total: 0, okCount: 0, avgRt: null, hourly };
      }
      return {
        day,
        uptime: (d.ok_count / d.total) * 100,
        total: d.total,
        okCount: d.ok_count,
        avgRt: d.avg_rt_ms,
        hourly,
      };
    });
    // 90日稼働率はデータのある日の平均
    const known = bars.filter((b) => b.uptime != null);
    const uptime90d =
      known.length > 0 ? known.reduce((a, b) => a + (b.uptime ?? 0), 0) / known.length : null;

    return {
      id: m.id,
      name: m.name,
      url: m.url,
      status: m.current_status as MonitorStatus,
      lastCheckedAt: m.last_checked_at,
      uptime24h: s && s.total > 0 ? (s.ok_count / s.total) * 100 : null,
      uptime90d,
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

/**
 * Render the status page. Dispatches on the theme's layout: 'rich' delegates to
 * the redesigned dashboard, otherwise the classic minimal page is rendered.
 */
export function renderStatusPage(
  data: StatusData,
  timeZone: string,
  theme: Theme,
): HtmlEscapedString | Promise<HtmlEscapedString> {
  const tz = resolveTimeZone(timeZone);
  const css = themeToCss(theme);
  if (theme.layout === 'rich') {
    return renderRich(data, tz, css);
  }
  return renderClassic(data, tz, css);
}

// 値はすべてテーマのCSS変数(src/ui/theme.ts)を参照する。:rootの定義は
// renderStatusPageでテーマ別に注入されるため、ここには含めない。
const CLASSIC_STYLE = `
  body { font-family: var(--font-sans); font-size: var(--fs-base); line-height: var(--lh-base);
         max-width: var(--page-max); margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: var(--fs-h1); }
  .summary { padding: var(--pad-card); border-radius: var(--radius-card); font-weight: var(--fw-bold); margin-bottom: 1.5rem; }
  .summary.ok { background: var(--summary-ok-bg); color: var(--summary-ok-fg); }
  .summary.bad { background: var(--summary-bad-bg); color: var(--summary-bad-fg); }
  .card { padding: var(--pad-card); border: 1px solid var(--border); border-radius: var(--radius-card); margin-bottom: 0.5rem; }
  .card-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .card .meta { color: var(--fg-muted); font-size: var(--fs-meta); }
  .bars { display: flex; gap: var(--gap-bars); margin-top: 0.6rem; height: var(--bar-height); }
  /* min-width:0 で90セルが必ず親幅に収まる(モバイルでのはみ出し防止) */
  .bar-wrap { flex: 1 1 0; min-width: 0; position: relative; display: flex; }
  .bar { flex: 1; border-radius: var(--radius-bar); background: var(--bar-empty); }
  .bar.ok { background: var(--status-up); }
  .bar.warn { background: var(--status-warn); }
  .bar.bad { background: var(--status-down); }
  .tip { position: absolute; bottom: 135%; left: 50%; transform: translateX(-50%);
         background: var(--tip-bg); color: var(--tip-fg); padding: 6px 9px; border-radius: var(--radius-tip);
         font-size: var(--fs-tip); line-height: var(--lh-tip); white-space: nowrap; text-align: left;
         box-shadow: var(--tip-shadow); opacity: 0; visibility: hidden;
         transition: opacity 0.12s; z-index: 10; pointer-events: none; }
  .tip::after { content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
                border: 5px solid transparent; border-top-color: var(--tip-bg); }
  .bar-wrap:hover .tip { opacity: 1; visibility: visible; }
  .tip .k { color: var(--tip-key); }
  .tip .spark { display: block; margin-top: 6px; color: var(--status-up); }
  .badge { padding: var(--pad-badge); border-radius: var(--radius-pill); font-size: var(--fs-badge); font-weight: var(--fw-bold); white-space: nowrap; }
  .badge.up { background: var(--status-up); color: var(--badge-fg); }
  .badge.down { background: var(--status-down); color: var(--badge-fg); }
  .badge.unknown { background: var(--status-unknown); color: var(--badge-fg); }
  .name { font-weight: var(--fw-bold); }
  .url { color: var(--fg-muted); font-size: var(--fs-meta); word-break: break-all; }
  table { width: 100%; border-collapse: collapse; font-size: var(--fs-card); margin-top: 0.5rem; }
  td, th { text-align: left; padding: var(--pad-cell); border-bottom: 1px solid var(--border); }
  footer { margin-top: 2rem; color: var(--fg-muted); font-size: var(--fs-foot); }
  @media (max-width: 640px) { .bars { gap: 1px; } }
`;

/** Render the classic minimal status page. */
function renderClassic(
  data: StatusData,
  tz: string,
  themeCss: string,
): HtmlEscapedString | Promise<HtmlEscapedString> {
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
                ${raw(sparklineSvg(b.hourly))}
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
          ${raw(themeCss)}
          ${raw(CLASSIC_STYLE)}
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
