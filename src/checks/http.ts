import type { CheckResult, Monitor } from '../types';

const USER_AGENT = 'hc-monitor/1.0 (+https://github.com/; cloudflare-workers)';

/**
 * Perform an HTTP(S) health check.
 *
 * Success requires the response status to equal `expectedStatus` and, when
 * `bodyMatch` is set, the response body to contain that substring. Network
 * errors and timeouts are reported as failures with the reason in `error`.
 */
export async function checkHttp(monitor: Monitor): Promise<CheckResult> {
  const start = Date.now();
  try {
    const res = await fetch(monitor.url, {
      method: monitor.method,
      redirect: 'follow',
      signal: AbortSignal.timeout(monitor.timeoutMs),
      headers: { 'user-agent': USER_AGENT },
    });
    const responseTimeMs = Date.now() - start;

    let ok = res.status === monitor.expectedStatus;
    let error: string | null = ok ? null : `unexpected status ${res.status}`;

    if (ok && monitor.bodyMatch) {
      const body = await res.text();
      if (!body.includes(monitor.bodyMatch)) {
        ok = false;
        error = `body did not contain "${monitor.bodyMatch}"`;
      }
    } else if (!ok) {
      // ボディを読まずに破棄し、コネクションリソースを解放する
      await res.body?.cancel();
    }

    return { ok, statusCode: res.status, responseTimeMs, sslDaysLeft: null, error };
  } catch (e) {
    const responseTimeMs = Date.now() - start;
    const message = e instanceof Error ? e.message : String(e);
    // AbortSignal.timeout はTimeoutErrorを投げる。区別して分かりやすくする
    const error = e instanceof Error && e.name === 'TimeoutError' ? 'request timed out' : message;
    return { ok: false, statusCode: null, responseTimeMs, sslDaysLeft: null, error };
  }
}
