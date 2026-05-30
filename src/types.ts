/** Worker bindings and environment variables. */
export interface Env {
  DB: D1Database;
  /** Consecutive failures required to confirm a DOWN state. Default 3. */
  FAIL_THRESHOLD?: string;
  /** Consecutive successes required to confirm recovery (UP). Default 2. */
  OK_THRESHOLD?: string;
  DISCORD_WEBHOOK_URL?: string;
  SLACK_WEBHOOK_URL?: string;
  GENERIC_WEBHOOK_URL?: string;
}

export type MonitorStatus = 'up' | 'down' | 'unknown';

/** Declarative monitor definition (Configuration as Code). */
export interface MonitorConfig {
  name: string;
  url: string;
  method?: string;
  expectedStatus?: number;
  /** Substring that must be present in the response body, if set. */
  bodyMatch?: string;
  intervalSeconds?: number;
  timeoutMs?: number;
  sslCheck?: boolean;
  sslWarnDays?: number;
  enabled?: boolean;
}

/** Fully-resolved monitor as stored in D1. */
export interface Monitor {
  id: number;
  name: string;
  url: string;
  method: string;
  expectedStatus: number;
  bodyMatch: string | null;
  intervalSeconds: number;
  timeoutMs: number;
  sslCheck: boolean;
  sslWarnDays: number;
  enabled: boolean;
  currentStatus: MonitorStatus;
  consecutiveFail: number;
  consecutiveOk: number;
  downSince: number | null;
  lastCheckedAt: number | null;
}

export interface CheckResult {
  ok: boolean;
  statusCode: number | null;
  responseTimeMs: number;
  /** Days until certificate expiry, when obtainable. Best-effort (see design.md 6.2). */
  sslDaysLeft: number | null;
  error: string | null;
}

export type NotifyEvent =
  | { type: 'down'; monitor: Monitor; cause: string; at: number }
  | { type: 'up'; monitor: Monitor; downtimeSec: number; at: number }
  | { type: 'ssl_warning'; monitor: Monitor; daysLeft: number; at: number };
