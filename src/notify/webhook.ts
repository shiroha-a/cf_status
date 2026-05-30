import type { NotifyEvent } from '../types';
import { postJson, toNormalized } from './format';

/** POST a normalized JSON payload to a generic webhook for downstream systems. */
export async function sendGenericWebhook(url: string, event: NotifyEvent): Promise<void> {
  await postJson(url, toNormalized(event));
}
