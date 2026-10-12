import type { ExecutionEtaStep, ExecutionSnapshot, WorkflowEtaEstimate } from '@zahnerflow/types';

export interface WorkflowTimeState {
  snapshot: ExecutionSnapshot | null;
  plannedEstimate: WorkflowEtaEstimate | null;
  estimateFailed: boolean;
  now: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  currentStepOverdue: boolean;
}

export interface NodeTimeView {
  mode: 'planned' | 'running' | 'terminal' | 'pending' | 'skipped' | 'unavailable';
  startedAt: Date | null;
  endedAt: Date | null;
  estimatedFinishTime: Date | null;
  estimatedSeconds: number | null;
  elapsedSeconds: number;
  remainingSeconds: number | null;
}

const date = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const result = new Date(value);
  return Number.isFinite(result.getTime()) ? result : null;
};

function projectPreview(estimate: WorkflowEtaEstimate | null, now: number): WorkflowEtaEstimate | null {
  if (!estimate) return null;
  const plannedAt = date(estimate.eta.updatedAt);
  if (!plannedAt) return null;
  const anchor = Math.max(now, plannedAt.getTime());
  const timeline = estimate.eta.steps ?? [];
  if (!timeline.some(step => step.scheduledAt)) {
    return { ...estimate, eta: { ...estimate.eta, updatedAt: new Date(anchor).toISOString() } };
  }
  let correction = 0;
  const steps = timeline.map(step => {
    const offset = (step.startOffsetSeconds ?? 0) + correction;
    const scheduledAt = date(step.scheduledAt);
    const seconds = scheduledAt
      ? Math.max(0, (scheduledAt.getTime() - anchor) / 1000 - offset)
      : step.estimatedSeconds;
    const result = { ...step, startOffsetSeconds: offset, estimatedSeconds: seconds };
    correction += seconds - step.estimatedSeconds;
    return result;
  });
  // 已过的绝对定时不能作为新执行的起点；不会自行改为明天。
  if (steps.some(step => step.scheduledAt && (date(step.scheduledAt)?.getTime() ?? 0) <= anchor)) return null;
  return {
    ...estimate, steps,
    eta: {
      ...estimate.eta, steps, updatedAt: new Date(anchor).toISOString(),
      estimatedTotalSeconds: estimate.eta.estimatedTotalSeconds + correction,
      estimatedRemainingSeconds: estimate.eta.estimatedTotalSeconds + correction,
    },
  };
}

function currentStepElapsed(snapshot: ExecutionSnapshot, now: number): number {
  const updatedAt = date(snapshot.eta?.updatedAt);
  const delta = updatedAt ? Math.max(0, (now - updatedAt.getTime()) / 1000) : 0;
  return Math.max(0, snapshot.eta?.currentStepElapsedSeconds ?? 0) + delta;
}

function currentStepRemaining(snapshot: ExecutionSnapshot, now: number): number {
  const eta = snapshot.eta;
  const timing = snapshot.nodeTimings?.find(item => item.unrolledIndex === snapshot.currentStep?.unrolledIndex);
  if (!eta || timing?.status !== 'running') return 0;
  return Math.max(0, (eta.currentStepEstimatedSeconds ?? timing.estimatedSeconds ?? 0)
    - currentStepElapsed(snapshot, now));
}

export function workflowTimeState(
  snapshot: ExecutionSnapshot | null,
  plannedEstimate: WorkflowEtaEstimate | null,
  estimateFailed: boolean,
  now: number,
): WorkflowTimeState {
  const active = snapshot?.status === 'running' || snapshot?.status === 'paused' || snapshot?.status === 'cancelling';
  const eta = snapshot?.eta;
  const updatedAt = date(eta?.updatedAt);
  const delta = active && updatedAt ? Math.max(0, (now - updatedAt.getTime()) / 1000) : 0;
  // 超过当前步骤的预测时长后，不继续扣减后续尚未执行步骤。
  const currentRemainingAtUpdate = snapshot ? currentStepRemaining(snapshot, updatedAt?.getTime() ?? now) : 0;
  const currentTiming = snapshot?.nodeTimings?.find(item => item.unrolledIndex === snapshot.currentStep?.unrolledIndex);
  const currentEstimate = eta?.currentStepEstimatedSeconds ?? currentTiming?.estimatedSeconds ?? 0;
  const currentStepOverdue = Boolean(active && currentTiming?.status === 'running' && currentEstimate > 0
    && snapshot && currentStepElapsed(snapshot, now) > currentEstimate);
  const preview = projectPreview(plannedEstimate, now);
  return {
    snapshot,
    plannedEstimate: preview,
    estimateFailed: estimateFailed || Boolean(plannedEstimate && !preview),
    now,
    elapsedSeconds: Math.max(0, (eta?.elapsedSeconds ?? snapshot?.duration ?? 0) + delta),
    remainingSeconds: Math.max(0, (eta?.estimatedRemainingSeconds ?? 0) - Math.min(delta, currentRemainingAtUpdate)),
    currentStepOverdue,
  };
}

export function nodeTimeView(time: WorkflowTimeState, nodeId: string): NodeTimeView {
  const empty: NodeTimeView = {
    mode: 'unavailable', startedAt: null, endedAt: null, estimatedFinishTime: null,
    estimatedSeconds: null, elapsedSeconds: 0, remainingSeconds: null,
  };
  const snapshot = time.snapshot;
  const live = snapshot && snapshot.status !== 'idle';
  const steps = (live ? snapshot.eta : time.plannedEstimate?.eta)?.steps ?? [];
  const belongs = (step: ExecutionEtaStep) => !step.autoBoundary && (
    step.sourceNodeId === nodeId || step.iterationPath?.some(entry => entry.loopNodeId === nodeId)
  );
  const owned = steps.filter(belongs);
  if (!owned.length) return time.plannedEstimate || (live && snapshot.eta?.steps)
    ? { ...empty, mode: 'skipped', estimatedSeconds: 0, remainingSeconds: 0 } : empty;
  const executable = owned.filter(step => !step.skipped);
  if (!executable.length) return { ...empty, mode: 'skipped', estimatedSeconds: 0, remainingSeconds: 0 };
  const estimatedSeconds = executable.reduce((sum, step) => sum + step.estimatedSeconds, 0);

  if (!live) {
    const anchor = date(time.plannedEstimate?.eta.updatedAt);
    const first = executable[0];
    const last = executable[executable.length - 1];
    return {
      ...empty, mode: 'planned', estimatedSeconds,
      startedAt: anchor ? new Date(anchor.getTime() + (first.startOffsetSeconds ?? 0) * 1000) : null,
      estimatedFinishTime: anchor ? new Date(anchor.getTime() + ((last.startOffsetSeconds ?? 0) + last.estimatedSeconds) * 1000) : null,
    };
  }

  const timings = new Map(snapshot.nodeTimings?.map(item => [item.unrolledIndex, item]));
  const remainingFor = (step: ExecutionEtaStep): number => {
    if (step.skipped || step.completed) return 0;
    const timing = timings.get(step.unrolledIndex);
    if (timing && timing.status !== 'running') return 0;
    if (step.unrolledIndex === snapshot.currentStep?.unrolledIndex) return currentStepRemaining(snapshot, time.now);
    return step.estimatedSeconds;
  };
  const ownedTimings = executable.flatMap(step => {
    const timing = timings.get(step.unrolledIndex);
    return timing ? [timing] : [];
  });
  const firstStarted = ownedTimings.find(item => item.startedAt);
  const elapsedSeconds = ownedTimings.reduce((sum, timing) => sum + (
    timing.status === 'running'
      ? currentStepElapsed(snapshot, time.now)
      : timing.actualSeconds ?? 0
  ), 0);
  const active = snapshot.status === 'running' || snapshot.status === 'paused' || snapshot.status === 'cancelling';
  const allFinished = executable.every(step => step.completed || (
    timings.has(step.unrolledIndex) && timings.get(step.unrolledIndex)?.status !== 'running'
  ));
  if (allFinished || !active) {
    if (!ownedTimings.length) return { ...empty, mode: 'skipped', estimatedSeconds };
    return {
      ...empty, mode: 'terminal', estimatedSeconds, elapsedSeconds, remainingSeconds: 0,
      startedAt: date(firstStarted?.startedAt), endedAt: date(ownedTimings[ownedTimings.length - 1].endedAt),
    };
  }

  const firstPending = executable.find(step => !step.completed && !timings.has(step.unrolledIndex));
  const last = executable[executable.length - 1];
  const currentOwned = executable.some(step => timings.get(step.unrolledIndex)?.status === 'running');
  // 步骤边界暂停时，恢复时间未知，不给后续步骤编造一个开始时间。
  const priorOverdue = time.currentStepOverdue && snapshot.currentStep?.unrolledIndex !== undefined
    && snapshot.currentStep.unrolledIndex < last.unrolledIndex;
  const canProject = snapshot.status !== 'paused' && snapshot.status !== 'cancelling' && !priorOverdue;
  const until = (index: number) => steps.filter(step => step.unrolledIndex < index)
    .reduce((sum, step) => sum + remainingFor(step), 0);
  return {
    mode: firstStarted ? 'running' : 'pending', estimatedSeconds, elapsedSeconds,
    remainingSeconds: executable.reduce((sum, step) => sum + remainingFor(step), 0),
    startedAt: date(firstStarted?.startedAt) ?? (
      firstPending && canProject ? new Date(time.now + until(firstPending.unrolledIndex) * 1000) : null
    ),
    endedAt: null,
    estimatedFinishTime: !time.currentStepOverdue && (canProject || (currentOwned && !firstPending))
      ? new Date(time.now + (until(last.unrolledIndex) + remainingFor(last)) * 1000) : null,
  };
}
