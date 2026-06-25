import { monitors as monitorConfigs } from '../monitors.config';
import { checkHttp } from './checks/http';
import { getColo } from './checks/trace';
import {
  buildRecordStatements,
  getDueMonitors,
  getOpenIncident,
  setIncidentDiscordMessageId,
  syncMonitors,
} from './db/repo';
import { rollupAndPrune } from './db/retention';
import { notify } from './notify';
import { computeTransition } from './state';
import type { Env, Monitor } from './types';
import { resolveTimeZone } from './tz';

/**
 * Cron entry point. Syncs the declarative config, then checks every monitor
 * that is due and persists the outcome. Checks run concurrently; each monitor
 * is isolated so one failure cannot abort the batch.
 */
export async function handleScheduled(env: Env, ctx: ExecutionContext): Promise<void> {
  const failThreshold = Number(env.FAIL_THRESHOLD ?? '3');
  const okThreshold = Number(env.OK_THRESHOLD ?? '2');

  await syncMonitors(env.DB, monitorConfigs);

  const now = Math.floor(Date.now() / 1000);
  // このCron実行を担当しているデータセンターを記録し、測定値の文脈とする
  const [colo, due] = await Promise.all([getColo(), getDueMonitors(env.DB, now)]);

  await Promise.allSettled(
    due.map((monitor) => checkOne(env, ctx, monitor, now, failThreshold, okThreshold, colo)),
  );

  // 日次集計と保持期間外データの削除。監視結果の記録後に実行する
  const retentionDays = Number(env.RETENTION_DAYS ?? '30');
  ctx.waitUntil(rollupAndPrune(env.DB, now, retentionDays, resolveTimeZone(env.TIMEZONE)));
}

async function checkOne(
  env: Env,
  ctx: ExecutionContext,
  monitor: Monitor,
  now: number,
  failThreshold: number,
  okThreshold: number,
  colo: string | null,
): Promise<void> {
  const result = await checkHttp(monitor);
  const transition = computeTransition(monitor, result, now, failThreshold, okThreshold);

  // 復旧遷移ならbatchがresolved_atをセットする前にDiscord編集用のコンテキストを取りに行く
  const resolvingIncident =
    transition.incident === 'resolve' ? await getOpenIncident(env.DB, monitor.id) : null;

  await env.DB.batch(buildRecordStatements(env.DB, monitor, result, transition, now, colo));

  if (transition.event) {
    // 通知の完了をレスポンス後も待たせる
    ctx.waitUntil(notifyAndPersist(env, monitor, transition.event, resolvingIncident));
  }
}

async function notifyAndPersist(
  env: Env,
  monitor: Monitor,
  event: NonNullable<ReturnType<typeof computeTransition>['event']>,
  resolvingIncident: { cause: string | null; discordMessageId: string | null } | null,
): Promise<void> {
  const result = await notify(env, event, { resolvingIncident });
  // DOWN通知のmessage idはincidentに保存する。復旧時にこれをPATCHで編集する
  if (event.type === 'down' && result.discordMessageId) {
    try {
      await setIncidentDiscordMessageId(env.DB, monitor.id, result.discordMessageId);
    } catch (e) {
      console.error(`failed to persist discord message id for ${monitor.name}:`, e);
    }
  }
}
