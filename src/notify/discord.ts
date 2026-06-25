import type { Monitor, NotifyEvent } from '../types';
import { EVENT_COLOR, eventDescription, eventTitle, formatDuration } from './format';

const TIMEOUT_MS = 10000;

/**
 * Send a Discord embed via an Incoming Webhook URL.
 *
 * Uses `?wait=true` so the response includes the message ID, which the caller
 * can store and later pass to `editDiscord` to update the message in place
 * (e.g. mark a DOWN as recovered without sending a second message).
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
 * through the original url + cause, append a recovery line, and flip the color
 * from red to green. Throws on non-2xx so the caller can fall back to a fresh
 * notification (e.g. the original message was deleted).
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
  return {
    title: eventTitle(event),
    ...(statusPageUrl ? { url: statusPageUrl } : {}),
    description: eventDescription(event),
    color: EVENT_COLOR[event.type],
    timestamp: new Date(event.at * 1000).toISOString(),
    footer: { text: 'hc monitor' },
  };
}

function buildResolvedEmbed(
  monitor: Monitor,
  originalCause: string,
  recoveredAt: number,
  downtimeSec: number,
  statusPageUrl?: string,
): Record<string, unknown> {
  return {
    title: `[RECOVERED] ${monitor.name}`,
    ...(statusPageUrl ? { url: statusPageUrl } : {}),
    description:
      `~~${monitor.url}~~\n` +
      `~~Cause: ${originalCause}~~\n\n` +
      `✅ Recovered after ${formatDuration(downtimeSec)}`,
    color: EVENT_COLOR.up,
    timestamp: new Date(recoveredAt * 1000).toISOString(),
    footer: { text: 'hc monitor (resolved)' },
  };
}
