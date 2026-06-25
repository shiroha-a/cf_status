import type { Monitor, NotifyEvent } from '../types';
import { EVENT_COLOR, formatDuration } from './format';

const TIMEOUT_MS = 10000;

/**
 * Send a Discord embed via an Incoming Webhook URL.
 *
 * Uses `?wait=true` so the response includes the message ID, which the caller
 * can store and later pass to `editDiscordToResolved` to update the message
 * in place (e.g. mark a DOWN as recovered without sending a second message).
 *
 * Returns the new message ID, or null if the endpoint did not return one.
 */
export async function sendDiscord(
  url: string,
  event: NotifyEvent,
  statusPageUrl?: string,
): Promise<string | null> {
  const res = await fetch(`${url}?wait=true`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ embeds: [buildEmbed(event, statusPageUrl)] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`discord webhook responded ${res.status}`);
  try {
    const body = (await res.json()) as { id?: string };
    return body.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Edit a previously-sent DOWN Discord message into a RECOVERED one: strike
 * through the original url + cause, switch the fields to recovery info, and
 * flip the color from red to green. Throws on non-2xx so the caller can fall
 * back to a fresh notification (e.g. the original message was deleted).
 */
export async function editDiscordToResolved(
  url: string,
  messageId: string,
  monitor: Monitor,
  originalCause: string,
  recoveredAt: number,
  downtimeSec: number,
  statusPageUrl?: string,
): Promise<void> {
  const res = await fetch(`${url}/messages/${messageId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      embeds: [buildResolvedEmbed(monitor, originalCause, recoveredAt, downtimeSec, statusPageUrl)],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`discord edit responded ${res.status}`);
  await res.body?.cancel();
}

function buildEmbed(event: NotifyEvent, statusPageUrl?: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ...(statusPageUrl ? { url: statusPageUrl } : {}),
    color: EVENT_COLOR[event.type],
    timestamp: new Date(event.at * 1000).toISOString(),
    footer: { text: 'hc monitor' },
  };
  switch (event.type) {
    case 'down':
      return {
        ...base,
        title: `🔴 [DOWN] ${event.monitor.name}`,
        description: event.monitor.url,
        fields: [
          { name: 'Cause', value: event.cause, inline: true },
          { name: 'Started', value: `<t:${event.at}:R>`, inline: true },
        ],
      };
    case 'up':
      return {
        ...base,
        title: `✅ [RECOVERED] ${event.monitor.name}`,
        description: event.monitor.url,
        fields: [
          { name: 'Down for', value: formatDuration(event.downtimeSec), inline: true },
          { name: 'Recovered', value: `<t:${event.at}:R>`, inline: true },
        ],
      };
    case 'ssl_warning':
      return {
        ...base,
        title: `🟡 [SSL] ${event.monitor.name}`,
        description: event.monitor.url,
        fields: [{ name: 'Expires in', value: `${event.daysLeft} day(s)`, inline: true }],
      };
  }
}

function buildResolvedEmbed(
  monitor: Monitor,
  originalCause: string,
  recoveredAt: number,
  downtimeSec: number,
  statusPageUrl?: string,
): Record<string, unknown> {
  return {
    title: `✅ [RECOVERED] ${monitor.name}`,
    ...(statusPageUrl ? { url: statusPageUrl } : {}),
    description: `~~${monitor.url}~~`,
    color: EVENT_COLOR.up,
    timestamp: new Date(recoveredAt * 1000).toISOString(),
    fields: [
      { name: 'Cause', value: `~~${originalCause}~~`, inline: true },
      { name: 'Down for', value: formatDuration(downtimeSec), inline: true },
      { name: 'Recovered', value: `<t:${recoveredAt}:R>`, inline: true },
    ],
    footer: { text: 'hc monitor (resolved)' },
  };
}
