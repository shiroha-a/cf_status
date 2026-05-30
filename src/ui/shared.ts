import type { MonitorStatus } from '../types';

export const DAY_SECONDS = 86400;
export const UPTIME_BAR_DAYS = 90;

export interface DayBar {
  day: string;
  /** Uptime percentage for the day, or null when no data was recorded. */
  uptime: number | null;
  total: number;
  okCount: number;
  avgRt: number | null;
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

/** Format a duration in seconds compactly (45s, 12m, 3h 4m, 2d 3h). */
export function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
