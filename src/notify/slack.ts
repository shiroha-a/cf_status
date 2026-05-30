import type { NotifyEvent } from '../types';
import { eventDescription, eventTitle, postJson } from './format';

/** Send a message via a Slack Incoming Webhook URL. */
export async function sendSlack(url: string, event: NotifyEvent): Promise<void> {
  await postJson(url, {
    text: `*${eventTitle(event)}*\n${eventDescription(event)}`,
  });
}
