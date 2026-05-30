import type { CheckResult, Monitor, MonitorStatus, NotifyEvent } from './types';

/** Result of applying one check to a monitor's current state. Pure/deterministic. */
export interface Transition {
  newStatus: MonitorStatus;
  consecutiveFail: number;
  consecutiveOk: number;
  downSince: number | null;
  /** Notification to send, or null when the state did not confirm a transition. */
  event: NotifyEvent | null;
  /** Incident bookkeeping action, or null. */
  incident: 'open' | 'resolve' | null;
}

/**
 * Compute the next state from the current monitor and a check result.
 *
 * Flapping is suppressed with confirmation thresholds: a monitor only flips to
 * DOWN after `failThreshold` consecutive failures, and back to UP after
 * `okThreshold` consecutive successes. Notifications fire only on a confirmed
 * transition. The first-ever success (from `unknown`) settles to UP silently.
 */
export function computeTransition(
  monitor: Monitor,
  result: CheckResult,
  now: number,
  failThreshold: number,
  okThreshold: number,
): Transition {
  let consecutiveFail = monitor.consecutiveFail;
  let consecutiveOk = monitor.consecutiveOk;
  let newStatus: MonitorStatus = monitor.currentStatus;
  let downSince = monitor.downSince;
  let event: NotifyEvent | null = null;
  let incident: 'open' | 'resolve' | null = null;

  if (result.ok) {
    consecutiveOk += 1;
    consecutiveFail = 0;
    if (monitor.currentStatus === 'down' && consecutiveOk >= okThreshold) {
      const downtimeSec = downSince ? now - downSince : 0;
      event = { type: 'up', monitor, downtimeSec, at: now };
      incident = 'resolve';
      newStatus = 'up';
      downSince = null;
    } else if (monitor.currentStatus === 'unknown') {
      // 初回成功は正常稼働なので通知せずupに確定する
      newStatus = 'up';
    }
  } else {
    consecutiveFail += 1;
    consecutiveOk = 0;
    if (monitor.currentStatus !== 'down' && consecutiveFail >= failThreshold) {
      const cause = result.error ?? `unexpected status ${result.statusCode ?? 'n/a'}`;
      event = { type: 'down', monitor, cause, at: now };
      incident = 'open';
      newStatus = 'down';
      downSince = now;
    }
  }

  return { newStatus, consecutiveFail, consecutiveOk, downSince, event, incident };
}
