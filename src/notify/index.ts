import type { Env, NotifyEvent } from '../types';
import { sendDiscord } from './discord';
import { sendSlack } from './slack';
import { sendGenericWebhook } from './webhook';

/**
 * Fan out an event to every configured destination. Failures are logged but
 * never propagated, so a broken webhook cannot disrupt monitoring.
 */
export async function notify(env: Env, event: NotifyEvent): Promise<void> {
  const tasks: Promise<void>[] = [];
  if (env.DISCORD_WEBHOOK_URL)
    tasks.push(sendDiscord(env.DISCORD_WEBHOOK_URL, event, env.STATUS_PAGE_URL));
  if (env.SLACK_WEBHOOK_URL) tasks.push(sendSlack(env.SLACK_WEBHOOK_URL, event));
  if (env.GENERIC_WEBHOOK_URL) tasks.push(sendGenericWebhook(env.GENERIC_WEBHOOK_URL, event));

  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === 'rejected') {
      console.error(`notify failed for ${event.type} ${event.monitor.name}:`, r.reason);
    }
  }
}
