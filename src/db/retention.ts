const DAY_SECONDS = 86400;
/** How many days of daily_stats to keep (drives the status page uptime bar). */
const DAILY_STATS_KEEP_DAYS = 90;

/**
 * Roll up recent checks into daily_stats and prune old rows, as one ordered
 * batch (rollup before delete, so aggregates are committed before their source
 * rows are removed).
 *
 * The current and previous UTC day are re-aggregated every run: the current day
 * is still accumulating, and the previous day is finalized once midnight passes.
 * `checks` older than `retentionDays` and daily_stats older than 90 days are
 * deleted. `daily_stats` already exists in the initial migration, so no schema
 * change is needed.
 */
export async function rollupAndPrune(
  db: D1Database,
  now: number,
  retentionDays: number,
): Promise<void> {
  const startOfToday = now - (now % DAY_SECONDS);
  // 当日と前日のchecksを再集計対象にする
  const rollupSince = startOfToday - DAY_SECONDS;
  const checksCutoff = now - retentionDays * DAY_SECONDS;
  // 'YYYY-MM-DD'は辞書順=時系列順なので文字列比較で枝刈りできる
  const dayCutoff = new Date((now - DAILY_STATS_KEEP_DAYS * DAY_SECONDS) * 1000)
    .toISOString()
    .slice(0, 10);

  await db.batch([
    db
      .prepare(
        `INSERT INTO daily_stats (monitor_id, day, total, ok_count, avg_rt_ms)
         SELECT monitor_id,
                strftime('%Y-%m-%d', checked_at, 'unixepoch') AS day,
                COUNT(*) AS total,
                SUM(ok) AS ok_count,
                CAST(AVG(response_time_ms) AS INTEGER) AS avg_rt_ms
         FROM checks
         WHERE checked_at >= ?
         GROUP BY monitor_id, day
         ON CONFLICT(monitor_id, day) DO UPDATE SET
           total = excluded.total,
           ok_count = excluded.ok_count,
           avg_rt_ms = excluded.avg_rt_ms`,
      )
      .bind(rollupSince),
    db.prepare('DELETE FROM checks WHERE checked_at < ?').bind(checksCutoff),
    db.prepare('DELETE FROM daily_stats WHERE day < ?').bind(dayCutoff),
  ]);
}
