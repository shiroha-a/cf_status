import type { MonitorStatus } from '../types';

export const DAY_SECONDS = 86400;
export const UPTIME_BAR_DAYS = 90;

/** One hour of a day's uptime, for the tooltip sparkline. */
export interface HourPoint {
  /** Hour of day, 0-23. */
  h: number;
  /** Uptime percentage for that hour, or null when no data was recorded. */
  up: number | null;
}

export interface DayBar {
  day: string;
  /** Uptime percentage for the day, or null when no data was recorded. */
  uptime: number | null;
  total: number;
  okCount: number;
  avgRt: number | null;
  /** 24 points (hours 0-23) of intra-day uptime for the sparkline. */
  hourly: HourPoint[];
}

export interface MonitorView {
  id: number;
  name: string;
  url: string;
  status: MonitorStatus;
  lastCheckedAt: number | null;
  uptime24h: number | null;
  /** Mean of the daily uptimes over the bar window, or null when no data. */
  uptime90d: number | null;
  avgRtMs: number | null;
  /** Data center that ran the most recent check. */
  lastColo: string | null;
  /** Distinct data centers seen in the last 24h, for context on RT variance. */
  colos24h: string[];
  /** Last 90 days of daily uptime, oldest first. */
  bars: DayBar[];
}

export interface IncidentView {
  name: string;
  startedAt: number;
  resolvedAt: number | null;
  cause: string | null;
}

export interface StatusData {
  monitors: MonitorView[];
  incidents: IncidentView[];
  allOperational: boolean;
  generatedAt: number;
}

/** Format a unix timestamp (seconds) as 'YYYY-MM-DD HH:mm:ss (Zone)' in `tz`. */
export function fmtTime(unix: number | null, tz: string): string {
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

/** Map a daily uptime percentage to a bar color class (empty = no-data). */
export function barClass(uptime: number | null): string {
  if (uptime == null) return '';
  if (uptime >= 99.9) return 'ok';
  if (uptime >= 95) return 'warn';
  return 'bad';
}

/**
 * Build an SVG uptime sparkline (0-23h x 0-100%) from hourly points. Returns ''
 * when there is no data. Gaps (null hours) split the line into segments; the
 * stroke uses `currentColor` so it inherits the tooltip's text color.
 */
export function sparklineSvg(hourly: HourPoint[]): string {
  const w = 132;
  const h = 34;
  const pad = 3;
  const hasData = hourly.some((p) => p.up != null);
  if (!hasData) return '';

  const x = (hour: number) => pad + (hour / 23) * (w - 2 * pad);
  const y = (up: number) => pad + (1 - up / 100) * (h - 2 * pad);

  // null時間で線を分割する(連続区間ごとにpolyline)
  const segments: string[] = [];
  let cur: string[] = [];
  for (const p of hourly) {
    if (p.up == null) {
      if (cur.length > 0) segments.push(cur.join(' '));
      cur = [];
    } else {
      cur.push(`${x(p.h).toFixed(1)},${y(p.up).toFixed(1)}`);
    }
  }
  if (cur.length > 0) segments.push(cur.join(' '));

  const lines = segments
    .map((pts) =>
      pts.includes(' ')
        ? `<polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />`
        : `<circle cx="${pts.split(',')[0]}" cy="${pts.split(',')[1]}" r="1.4" fill="currentColor" />`,
    )
    .join('');
  // 100%/0%の基準線を薄く引く
  const grid = `<line x1="${pad}" y1="${y(100).toFixed(1)}" x2="${w - pad}" y2="${y(100).toFixed(1)}" stroke="currentColor" stroke-opacity="0.18" stroke-width="0.5" /><line x1="${pad}" y1="${y(0).toFixed(1)}" x2="${w - pad}" y2="${y(0).toFixed(1)}" stroke="currentColor" stroke-opacity="0.18" stroke-width="0.5" />`;

  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="hourly uptime">${grid}${lines}</svg>`;
}

/** Format a duration in seconds compactly (45s, 12m, 3h 4m, 2d 3h). */
export function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
