/**
 * Resolve the Cloudflare data center (colo) the Worker is currently running in.
 *
 * The scheduled handler has no `request.cf`, so we read it from the
 * `/cdn-cgi/trace` endpoint. The subrequest is served by the same edge that runs
 * the Worker, so its `colo=` line reflects our execution location. Best-effort:
 * returns null on any failure so monitoring is never blocked by it.
 */
export async function getColo(): Promise<string | null> {
  try {
    const res = await fetch('https://cloudflare.com/cdn-cgi/trace', {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    const match = text.match(/^colo=(.+)$/m);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
