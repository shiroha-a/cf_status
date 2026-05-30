import { Hono } from 'hono';
import { handleScheduled } from './scheduled';
import type { Env } from './types';
import { getStatusData, renderStatusPage } from './ui/status';

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  // ステータスページは短時間キャッシュし、D1読み取りとレンダリングコストを抑える
  const cache = caches.default;
  const cacheKey = new Request(new URL('/', c.req.url).toString());
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const data = await getStatusData(c.env);
  const res = await c.html(renderStatusPage(data, c.env.TIMEZONE ?? 'UTC'));
  res.headers.set('Cache-Control', 'public, max-age=30');
  c.executionCtx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
});

app.get('/api/status', async (c) => {
  const data = await getStatusData(c.env);
  return c.json(data);
});

app.get('/api/monitors/:id/history', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: 'invalid monitor id' }, 400);
  }
  const rawLimit = Number(c.req.query('limit') ?? '100');
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 100;

  const { results } = await c.env.DB.prepare(
    `SELECT checked_at, ok, status_code, response_time_ms, ssl_days_left, colo, error
     FROM checks WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT ?`,
  )
    .bind(id, limit)
    .all();
  return c.json({ monitorId: id, checks: results });
});

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleScheduled(env, ctx));
  },
} satisfies ExportedHandler<Env>;
