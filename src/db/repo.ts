import type { Transition } from '../state';
import type { CheckResult, Monitor, MonitorConfig, MonitorStatus } from '../types';

/** Raw `monitors` row shape as returned by D1. */
interface MonitorRow {
  id: number;
  name: string;
  url: string;
  method: string;
  expected_status: number;
  body_match: string | null;
  interval_seconds: number;
  timeout_ms: number;
  ssl_check: number;
  ssl_warn_days: number;
  enabled: number;
  current_status: string;
  consecutive_fail: number;
  consecutive_ok: number;
  down_since: number | null;
  last_checked_at: number | null;
}

function rowToMonitor(r: MonitorRow): Monitor {
  return {
    id: r.id,
    name: r.name,
    url: r.url,
    method: r.method,
    expectedStatus: r.expected_status,
    bodyMatch: r.body_match,
    intervalSeconds: r.interval_seconds,
    timeoutMs: r.timeout_ms,
    sslCheck: r.ssl_check === 1,
    sslWarnDays: r.ssl_warn_days,
    enabled: r.enabled === 1,
    currentStatus: r.current_status as MonitorStatus,
    consecutiveFail: r.consecutive_fail,
    consecutiveOk: r.consecutive_ok,
    downSince: r.down_since,
    lastCheckedAt: r.last_checked_at,
  };
}

/**
 * Sync the declarative monitor list into D1. Entries are upserted by `name`;
 * monitors absent from the config are disabled (not deleted, to preserve history).
 */
export async function syncMonitors(db: D1Database, configs: MonitorConfig[]): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const stmts: D1PreparedStatement[] = configs.map((c) =>
    db
      .prepare(
        `INSERT INTO monitors
           (name, url, method, expected_status, body_match, interval_seconds,
            timeout_ms, ssl_check, ssl_warn_days, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           url = excluded.url,
           method = excluded.method,
           expected_status = excluded.expected_status,
           body_match = excluded.body_match,
           interval_seconds = excluded.interval_seconds,
           timeout_ms = excluded.timeout_ms,
           ssl_check = excluded.ssl_check,
           ssl_warn_days = excluded.ssl_warn_days,
           enabled = excluded.enabled`,
      )
      .bind(
        c.name,
        c.url,
        c.method ?? 'GET',
        c.expectedStatus ?? 200,
        c.bodyMatch ?? null,
        c.intervalSeconds ?? 60,
        c.timeoutMs ?? 10000,
        (c.sslCheck ?? true) ? 1 : 0,
        c.sslWarnDays ?? 14,
        (c.enabled ?? true) ? 1 : 0,
        now,
      ),
  );

  // configから外れたmonitorを無効化する
  const names = configs.map((c) => c.name);
  if (names.length > 0) {
    const placeholders = names.map(() => '?').join(', ');
    stmts.push(
      db
        .prepare(`UPDATE monitors SET enabled = 0 WHERE name NOT IN (${placeholders})`)
        .bind(...names),
    );
  } else {
    stmts.push(db.prepare('UPDATE monitors SET enabled = 0'));
  }

  await db.batch(stmts);
}

/** Monitors that are enabled and due for a check at `now` (unix seconds). */
export async function getDueMonitors(db: D1Database, now: number): Promise<Monitor[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM monitors
       WHERE enabled = 1
         AND (last_checked_at IS NULL OR last_checked_at + interval_seconds <= ?)`,
    )
    .bind(now)
    .all<MonitorRow>();
  return results.map(rowToMonitor);
}

/**
 * Look up the currently-open incident for a monitor, returning the fields
 * needed to construct a Discord recovery edit (original cause + stored
 * Discord message ID). Null if no incident is open.
 */
export async function getOpenIncident(
  db: D1Database,
  monitorId: number,
): Promise<{ id: number; cause: string | null; discordMessageId: string | null } | null> {
  const row = await db
    .prepare(
      `SELECT id, cause, discord_message_id
       FROM incidents
       WHERE monitor_id = ? AND resolved_at IS NULL
       ORDER BY started_at DESC LIMIT 1`,
    )
    .bind(monitorId)
    .first<{ id: number; cause: string | null; discord_message_id: string | null }>();
  if (!row) return null;
  return { id: row.id, cause: row.cause, discordMessageId: row.discord_message_id };
}

/** Persist a Discord message ID to the most recently opened incident for a monitor. */
export async function setIncidentDiscordMessageId(
  db: D1Database,
  monitorId: number,
  messageId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE incidents SET discord_message_id = ?
       WHERE id = (
         SELECT id FROM incidents
         WHERE monitor_id = ?
         ORDER BY started_at DESC LIMIT 1
       )`,
    )
    .bind(messageId, monitorId)
    .run();
}

/**
 * Build the statements that persist one check: append to `checks`, update the
 * monitor's denormalized state, and open/resolve an incident when applicable.
 * Returned as a batch so the writes commit atomically in a single round-trip.
 */
export function buildRecordStatements(
  db: D1Database,
  monitor: Monitor,
  result: CheckResult,
  transition: Transition,
  now: number,
  colo: string | null,
): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO checks
           (monitor_id, checked_at, ok, status_code, response_time_ms, ssl_days_left, error, colo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        monitor.id,
        now,
        result.ok ? 1 : 0,
        result.statusCode,
        result.responseTimeMs,
        result.sslDaysLeft,
        result.error,
        colo,
      ),
    db
      .prepare(
        `UPDATE monitors
         SET current_status = ?, consecutive_fail = ?, consecutive_ok = ?,
             down_since = ?, last_checked_at = ?
         WHERE id = ?`,
      )
      .bind(
        transition.newStatus,
        transition.consecutiveFail,
        transition.consecutiveOk,
        transition.downSince,
        now,
        monitor.id,
      ),
  ];

  if (transition.incident === 'open') {
    const cause = result.error ?? `unexpected status ${result.statusCode ?? 'n/a'}`;
    stmts.push(
      db
        .prepare('INSERT INTO incidents (monitor_id, started_at, cause) VALUES (?, ?, ?)')
        .bind(monitor.id, transition.downSince ?? now, cause),
    );
  } else if (transition.incident === 'resolve') {
    stmts.push(
      db
        .prepare(
          'UPDATE incidents SET resolved_at = ? WHERE monitor_id = ? AND resolved_at IS NULL',
        )
        .bind(now, monitor.id),
    );
  }

  return stmts;
}
