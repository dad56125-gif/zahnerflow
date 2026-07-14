import type { RuntimeDeviceState } from '@zahnerflow/types';

/**
 * 仅用于刷新界面的派生值。
 * 业务运行时间必须来自后端快照中的累计基线和当前运行起点。
 */
export const calculateDisplayedRuntimeSeconds = (
  runtimeState: RuntimeDeviceState | null,
  nowMs = Date.now(),
): number => {
  if (!runtimeState) return 0;
  const accumulated = Math.max(0, Number(runtimeState.accumulatedRunSeconds ?? 0));
  if (runtimeState.executionStatus !== 'running' || !runtimeState.currentRunStartedAt) {
    return accumulated;
  }
  const startedAtMs = Date.parse(runtimeState.currentRunStartedAt);
  if (!Number.isFinite(startedAtMs)) return accumulated;
  return accumulated + Math.max(0, (nowMs - startedAtMs) / 1000);
};
