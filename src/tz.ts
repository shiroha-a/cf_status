/**
 * Time zone helpers built on Intl. Used to align daily aggregation boundaries
 * and the status page uptime bar to a configured IANA time zone.
 *
 * Offsets are treated as fixed within a given day. For zones without DST
 * (e.g. Asia/Tokyo) this is exact; for DST zones a transition day can be off by
 * one hour at the boundary, which is acceptable for daily uptime buckets.
 */

const DAY_SECONDS = 86400;

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

/** Offset (seconds) to add to a UTC timestamp to get wall-clock time in `tz`. */
export function tzOffsetSeconds(tz: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - date.getTime()) / 1000);
}

/** Format a unix timestamp (seconds) as 'YYYY-MM-DD' in `tz`. */
export function tzDayString(tz: string, unixSec: number): string {
  // en-CAロケールはYYYY-MM-DD形式を返す
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(unixSec * 1000));
}

/** UTC unix timestamp (seconds) of the start of the local day containing `unixSec`. */
export function tzStartOfDay(tz: string, unixSec: number): number {
  const offset = tzOffsetSeconds(tz, new Date(unixSec * 1000));
  const local = unixSec + offset;
  const localDayStart = Math.floor(local / DAY_SECONDS) * DAY_SECONDS;
  return localDayStart - offset;
}
