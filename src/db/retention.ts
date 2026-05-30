import { tzDayString, tzOffsetSeconds, tzStartOfDay } from '../tz';

const DAY_SECONDS = 86400;
/** How many days of daily_stats to keep (drives the status page uptime bar). */
const DAILY_STATS_KEEP_DAYS = 90;

/**
 * Roll up recent checks into daily_stats and prune old rows, as one ordered
 * batch (rollup before delete, so aggregates are committed before their source
 * rows are removed).
 *
 * Days are bucketed by the configured `tz` so the status page uptime bar lines
 * up with the displayed time zone. The current and previous local day are
 * re-aggregated every run: the current day is still accumulating, and the
 * previous day is finalized once local midnight passes. `checks` older than
 * `retentionDays` and daily_stats older than 90 days are deleted. `daily_stats`
 * already exists in the initial migration, so no schema change is needed.
 */
export async function rollupAndPrune(
  db: D1Database,
  now: number,
  retentionDays: number,
  tz: string,
): Promise<void> {
  // checked_atにこのオフセットを足してから日付を切ることで、tzローカルの日境界に揃える
  const offset = tzOffsetSeconds(tz, new Date(now * 1000));
  // 当日と前日(ローカル基準)のchecksを再集計対象にする
  const rollupSince = tzStartOfDay(tz, now) - DAY_SECONDS;
  const checksCutoff = now - retentionDays * DAY_SECONDS;
  // 'YYYY-MM-DD'は辞書順=時系列順なので文字列比較で枝刈りできる
  const dayCutoff = tzDayString(tz, now - DAILY_STATS_KEEP_DAYS * DAY_SECONDS);

  await db.batch([
    db
      .prepare(
        `INSERT INTO daily_stats (monitor_id, day, total, ok_count, avg_rt_ms)
         SELECT monitor_id,
                strftime('%Y-%m-%d', checked_at + ?, 'unixepoch') AS day,
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
      .bind(offset, rollupSince),
    db.prepare('DELETE FROM checks WHERE checked_at < ?').bind(checksCutoff),
    db.prepare('DELETE FROM daily_stats WHERE day < ?').bind(dayCutoff),
  ]);
}
