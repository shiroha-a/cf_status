import { Hono } from 'hono';
import { handleScheduled } from './scheduled';
import type { Env } from './types';
import { getStatusData, renderStatusPage } from './ui/status';

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  const data = await getStatusData(c.env);
  return c.html(renderStatusPage(data));
});

app.get('/api/status', async (c) => {
  const data = await getStatusData(c.env);
  return c.json(data);
});

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleScheduled(env, ctx));
  },
} satisfies ExportedHandler<Env>;
