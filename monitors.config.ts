import type { MonitorConfig } from './src/types';

/**
 * Monitored targets (Configuration as Code).
 *
 * Edit this list and redeploy to change what is monitored. On every scheduled
 * run the list is synced into D1: entries are upserted by `name`, and any
 * monitor whose `name` is absent here is disabled.
 */
export const monitors: MonitorConfig[] = [
  {
    name: 'Example',
    url: 'https://example.com',
    expectedStatus: 200,
    intervalSeconds: 60,
    sslCheck: true,
    sslWarnDays: 14,
  },
];
