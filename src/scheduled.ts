import { monitors as monitorConfigs } from '../monitors.config';
import { checkHttp } from './checks/http';
import { getColo } from './checks/trace';
import { buildRecordStatements, getDueMonitors, syncMonitors } from './db/repo';
import { rollupAndPrune } from './db/retention';
import { notify } from './notify';
import { computeTransition } from './state';
import type { Env, Monitor } from './types';

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
  ctx.waitUntil(rollupAndPrune(env.DB, now, retentionDays));
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

  await env.DB.batch(buildRecordStatements(env.DB, monitor, result, transition, now, colo));

  if (transition.event) {
    // 通知の完了をレスポンス後も待たせる
    ctx.waitUntil(notify(env, transition.event));
  }
}
