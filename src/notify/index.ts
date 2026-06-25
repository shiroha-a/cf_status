import type { Env, NotifyEvent } from '../types';
import { editDiscordToResolved, safeStatusPageUrl, sendDiscord } from './discord';
import { sendSlack } from './slack';
import { sendGenericWebhook } from './webhook';

/**
 * Per-event context to enable in-place edits.
 *
 * For `up` events, if `resolvingIncident` carries a `discordMessageId`, the
 * existing DOWN message is edited (strikethrough + RECOVERED) instead of a
 * new message being posted to Discord. Other destinations always post fresh
 * because they don't share the same edit semantics.
 */
export interface NotifyContext {
  resolvingIncident?: { cause: string | null; discordMessageId: string | null } | null;
}

export interface NotifyResult {
  /** New Discord message ID (when a fresh message was posted), so the caller can persist it. */
  discordMessageId?: string | null;
}

/**
 * Fan out an event to every configured destination. Failures are logged but
 * never propagated, so a broken webhook cannot disrupt monitoring.
 */
export async function notify(
  env: Env,
  event: NotifyEvent,
  ctx: NotifyContext = {},
): Promise<NotifyResult> {
  const result: NotifyResult = {};

  const discord = handleDiscord(env, event, ctx, result);
  const tasks: Promise<void>[] = [];
  if (discord) tasks.push(discord);
  if (env.SLACK_WEBHOOK_URL) tasks.push(sendSlack(env.SLACK_WEBHOOK_URL, event));
  if (env.GENERIC_WEBHOOK_URL) tasks.push(sendGenericWebhook(env.GENERIC_WEBHOOK_URL, event));

  const settled = await Promise.allSettled(tasks);
  for (const r of settled) {
    if (r.status === 'rejected') {
      console.error(`notify failed for ${event.type} ${event.monitor.name}:`, r.reason);
    }
  }
  return result;
}

function handleDiscord(
  env: Env,
  event: NotifyEvent,
  ctx: NotifyContext,
  result: NotifyResult,
): Promise<void> | null {
  if (!env.DISCORD_WEBHOOK_URL) return null;
  const webhook = env.DISCORD_WEBHOOK_URL;
  // 不正なURLはDiscordがembedごと400で弾き全通知が落ちるため、ここで検証して除外する
  const statusPageUrl = safeStatusPageUrl(env.STATUS_PAGE_URL);

  // Edit the existing DOWN message instead of posting a new one on recovery.
  if (event.type === 'up' && ctx.resolvingIncident?.discordMessageId) {
    const msgId = ctx.resolvingIncident.discordMessageId;
    const cause = ctx.resolvingIncident.cause ?? '(unknown)';
    return editDiscordToResolved(
      webhook,
      msgId,
      event.monitor,
      cause,
      event.at,
      event.downtimeSec,
      statusPageUrl,
    ).catch(async (err) => {
      // Original message likely gone (404, etc.) — fall back to a fresh post.
      console.error(`discord edit failed for ${event.monitor.name}, falling back to send:`, err);
      result.discordMessageId = await sendDiscord(webhook, event, statusPageUrl);
    });
  }

  return sendDiscord(webhook, event, statusPageUrl).then((id) => {
    result.discordMessageId = id;
  });
}
