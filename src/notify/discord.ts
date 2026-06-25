import type { NotifyEvent } from '../types';
import { EVENT_COLOR, eventDescription, eventTitle, postJson } from './format';

/**
 * Send a Discord embed via an Incoming Webhook URL.
 *
 * When `statusPageUrl` is provided, it is set as the embed's `url` so the
 * title becomes a hyperlink to the public status page.
 */
export async function sendDiscord(
  url: string,
  event: NotifyEvent,
  statusPageUrl?: string,
): Promise<void> {
  await postJson(url, {
    embeds: [
      {
        title: eventTitle(event),
        ...(statusPageUrl ? { url: statusPageUrl } : {}),
        description: eventDescription(event),
        color: EVENT_COLOR[event.type],
        timestamp: new Date(event.at * 1000).toISOString(),
        footer: { text: 'hc monitor' },
      },
    ],
  });
}
