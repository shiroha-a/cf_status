import type { NotifyEvent } from '../types';
import { EVENT_COLOR, eventDescription, eventTitle, postJson } from './format';

/** Send a Discord embed via an Incoming Webhook URL. */
export async function sendDiscord(url: string, event: NotifyEvent): Promise<void> {
  await postJson(url, {
    embeds: [
      {
        title: eventTitle(event),
        description: eventDescription(event),
        color: EVENT_COLOR[event.type],
        timestamp: new Date(event.at * 1000).toISOString(),
        footer: { text: 'hc monitor' },
      },
    ],
  });
}
