import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import type { Env, MonitorStatus } from '../types';

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

/** Load everything the status page needs in a single D1 batch round-trip. */
export async function getStatusData(env: Env): Promise<StatusData> {
  const now = Math.floor(Date.now() / 1000);
  const since = now - 86400;

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
  ]);

  const monRows = (batch[0]?.results ?? []) as unknown as MonRow[];
  const statRows = (batch[1]?.results ?? []) as unknown as StatRow[];
  const incRows = (batch[2]?.results ?? []) as unknown as IncRow[];

  const statByMonitor = new Map<number, StatRow>();
  for (const s of statRows) statByMonitor.set(s.monitor_id, s);

  const monitors: MonitorView[] = monRows.map((m) => {
    const s = statByMonitor.get(m.id);
    const colos24h = s?.colos ? s.colos.split(',').filter(Boolean).sort() : [];
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
  .card { display: flex; align-items: center; justify-content: space-between; gap: 1rem;
          padding: 0.75rem 1rem; border: 1px solid #8883; border-radius: 8px; margin-bottom: 0.5rem; }
  .card .meta { color: #8889; font-size: 0.85rem; }
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

/** Validate an IANA time zone, falling back to UTC if unsupported/invalid. */
export function resolveTimeZone(tz: string | undefined): string {
  if (!tz) return 'UTC';
  try {
    // 不正なタイムゾーン名はRangeErrorを投げるため、ここで弾いてUTCにフォールバック
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

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
