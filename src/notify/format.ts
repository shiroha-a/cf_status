import type { NotifyEvent } from '../types';

/** Normalized payload posted to the generic webhook destination. */
export interface NormalizedPayload {
  event: NotifyEvent['type'];
  monitor: { id: number; name: string; url: string };
  cause?: string;
  downtimeSec?: number;
  daysLeft?: number;
  timestamp: string;
}

/** Human-readable severity color (RGB int) shared by Discord embeds. */
export const EVENT_COLOR: Record<NotifyEvent['type'], number> = {
  down: 0xe53935,
  up: 0x43a047,
  ssl_warning: 0xfb8c00,
};

export function eventTitle(event: NotifyEvent): string {
  switch (event.type) {
    case 'down':
      return `[DOWN] ${event.monitor.name}`;
    case 'up':
      return `[RECOVERED] ${event.monitor.name}`;
    case 'ssl_warning':
      return `[SSL] ${event.monitor.name}`;
  }
}

export function eventDescription(event: NotifyEvent): string {
  switch (event.type) {
    case 'down':
      return `${event.monitor.url}\nCause: ${event.cause}`;
    case 'up':
      return `${event.monitor.url}\nDowntime: ${formatDuration(event.downtimeSec)}`;
    case 'ssl_warning':
      return `${event.monitor.url}\nCertificate expires in ${event.daysLeft} day(s)`;
  }
}

export function toNormalized(event: NotifyEvent): NormalizedPayload {
  const base = {
    event: event.type,
    monitor: { id: event.monitor.id, name: event.monitor.name, url: event.monitor.url },
    timestamp: new Date(event.at * 1000).toISOString(),
  };
  switch (event.type) {
    case 'down':
      return { ...base, cause: event.cause };
    case 'up':
      return { ...base, downtimeSec: event.downtimeSec };
    case 'ssl_warning':
      return { ...base, daysLeft: event.daysLeft };
  }
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** POST JSON and throw on a non-2xx response so the caller can log it. */
export async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`webhook responded ${res.status}`);
  }
  await res.body?.cancel();
}
