import type { ExecutionPhase, ExecutionSnapshot, NodeStatus } from '@zahnerflow/types';

export type ExecutionCommand = 'start' | 'pause' | 'resume' | 'cancel' | 'reset';

export interface ExecutionCommandState {
  pending: ExecutionCommand | null;
  error: string | null;
}

export interface ExecutionPhaseDefinition {
  is: {
    active: boolean;
    terminal: boolean;
    running: boolean;
    paused: boolean;
    cancelling: boolean;
    completed: boolean;
    failed: boolean;
    cancelled: boolean;
  };
  can: {
    start: boolean;
    pause: boolean;
    resume: boolean;
    cancel: boolean;
    reset: boolean;
  };
  keeps: {
    identity: boolean;
    currentStep: boolean;
    nodeTimings: boolean;
    measurements: boolean;
    error: boolean;
  };
  view: {
    label: string;
    message: string;
    color: string;
  };
}

const phaseDefinition = (
  phase: ExecutionPhase,
  group: 'idle' | 'active' | 'terminal',
  allowedCommands: readonly ExecutionCommand[],
  label: string,
  message: string,
  color: string,
): ExecutionPhaseDefinition => ({
  is: {
    active: group === 'active',
    terminal: group === 'terminal',
    running: phase === 'running',
    paused: phase === 'paused',
    cancelling: phase === 'cancelling',
    completed: phase === 'completed',
    failed: phase === 'failed',
    cancelled: phase === 'cancelled',
  },
  can: {
    start: allowedCommands.includes('start'),
    pause: allowedCommands.includes('pause'),
    resume: allowedCommands.includes('resume'),
    cancel: allowedCommands.includes('cancel'),
    reset: allowedCommands.includes('reset'),
  },
  keeps: {
    identity: group !== 'idle',
    currentStep: group !== 'idle',
    nodeTimings: group !== 'idle',
    measurements: group !== 'idle',
    error: phase === 'failed',
  },
  view: { label, message, color },
});

export const executionPhases = {
  idle: phaseDefinition('idle', 'idle', ['start'], '就绪', '等待执行', 'var(--color-neutral)'),
  running: phaseDefinition('running', 'active', ['pause', 'cancel'], '运行中', '流程运行中...', 'var(--color-primary)'),
  paused: phaseDefinition('paused', 'active', ['resume', 'cancel'], '已暂停', '流程已暂停', 'var(--color-primary)'),
  cancelling: phaseDefinition('cancelling', 'active', [], '停止中', '等待当前节点结束...', 'var(--color-warning)'),
  completed: phaseDefinition('completed', 'terminal', ['reset'], '已完成', '流程已完成', 'var(--color-success)'),
  failed: phaseDefinition('failed', 'terminal', ['reset'], '执行失败', '流程执行失败', 'var(--color-danger)'),
  cancelled: phaseDefinition('cancelled', 'terminal', ['reset'], '已取消', '流程已取消', 'var(--color-warning)'),
} satisfies Record<ExecutionPhase, ExecutionPhaseDefinition>;

export interface ExecutionStateDescription extends ExecutionPhaseDefinition {
  phase: ExecutionPhase;
  identity: {
    executionId: string | null;
    workflowId: string | null;
  };
  progress: {
    currentStep: ExecutionSnapshot['currentStep'];
    nodeTimings: NonNullable<ExecutionSnapshot['nodeTimings']>;
    percentage: number;
  };
  result: {
    error: string | null;
  };
  command: ExecutionCommandState;
}

export type NodeExecutionPhase = 'pending' | NodeStatus;

export const readExecutionPhase = (status: string | null | undefined): ExecutionPhase =>
  status && status in executionPhases ? status as ExecutionPhase : 'idle';

export const describeExecution = (
  snapshot: ExecutionSnapshot | null | undefined,
  command: ExecutionCommandState = { pending: null, error: null },
): ExecutionStateDescription => {
  const phase = readExecutionPhase(snapshot?.status);
  const definition = executionPhases[phase];
  const elapsedSeconds = snapshot?.eta?.elapsedSeconds ?? 0;
  const remainingSeconds = snapshot?.eta?.estimatedRemainingSeconds ?? 0;
  const totalSeconds = elapsedSeconds + remainingSeconds;

  return {
    phase,
    ...definition,
    identity: {
      executionId: snapshot?.executionId ?? null,
      workflowId: snapshot?.workflowId ?? null,
    },
    progress: {
      currentStep: snapshot?.currentStep ?? null,
      nodeTimings: snapshot?.nodeTimings ?? [],
      percentage: totalSeconds > 0 ? Math.round((elapsedSeconds / totalSeconds) * 100) : 0,
    },
    result: {
      error: phase === 'failed' ? snapshot?.error || '执行失败' : command.error,
    },
    command,
  };
};

export const nodeStatusesFromSnapshot = (
  snapshot: ExecutionSnapshot,
  nodeCount: number,
): NodeStatus[] => {
  const statuses = new Array<NodeStatus>(nodeCount).fill('idle');
  const loops = snapshot.loopProgress ?? [];

  for (const timing of snapshot.nodeTimings ?? []) {
    if (timing.index < 0 || timing.index >= nodeCount) continue;
    const containingLoops = loops.filter(loop => (loop.nodeIndices ?? []).includes(timing.index));
    const belongsToCurrentIterations = containingLoops.every(loop =>
      (timing.iterationPath ?? []).some(entry =>
        entry.loopStartIndex === loop.loopStartIndex && entry.iteration === loop.current,
      ),
    );
    if (belongsToCurrentIterations) statuses[timing.index] = readExecutionPhase(timing.status);
  }

  const currentIndex = snapshot.currentStep?.index;
  const phase = readExecutionPhase(snapshot.status);
  if (currentIndex !== undefined && currentIndex !== null && currentIndex >= 0 && currentIndex < nodeCount) {
    if (phase === 'running' || phase === 'paused' || phase === 'cancelling') {
      statuses[currentIndex] = phase;
    }
  }

  return statuses;
};

export const nodePhaseForDisplay = (
  nodeStatus: string | null | undefined,
  nodeIndex: number,
  snapshot: ExecutionSnapshot | null | undefined,
): NodeExecutionPhase => {
  const execution = describeExecution(snapshot);
  const currentIndex = snapshot?.currentStep?.index;

  if (nodeStatus === 'running') {
    if (currentIndex === nodeIndex && execution.is.paused) return 'paused';
    if (currentIndex === nodeIndex && execution.is.cancelling) return 'cancelling';
    return 'running';
  }
  if (nodeStatus === 'completed') return 'completed';
  if (nodeStatus === 'failed') return 'failed';
  if (nodeStatus === 'cancelled') return 'cancelled';
  if (nodeStatus === 'paused') return 'paused';
  if (nodeStatus === 'cancelling') return 'cancelling';

  if (currentIndex !== undefined && currentIndex !== null) {
    if (nodeIndex < currentIndex) return 'completed';
    if (nodeIndex > currentIndex) return 'pending';
    if (execution.is.active || execution.is.terminal) return execution.phase;
  }

  if (execution.is.completed) return 'completed';
  return 'pending';
};
