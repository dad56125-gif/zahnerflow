import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  ExecutionSnapshot,
  LoopIterationEvent,
  LoopProgress,
  NodeStatus,
  NodeStatusUpdate,
  NodesResetEvent,
  WorkflowNode,
} from '@zahnerflow/types';
import { runtimeClient, runtimeSocket } from '../runtimeClient';
import {
  RUNTIME_CONNECTED,
  WORKFLOW_LOOP_START,
  WORKFLOW_NODE_STATUS,
  WORKFLOW_NODES_RESET,
  WORKFLOW_SNAPSHOT,
} from '../eventContracts';
import type { FilePathConfig } from '../components/shared/userContextState';
import type { NodeParameters } from '../types/NodeConfiguration';
import {
  describeExecution,
  nodeStatusesFromSnapshot,
  readExecutionPhase,
} from './executionStateModel';
import type { ExecutionCommandState } from './executionStateModel';
import {
  createExecutionCommandCoordinator,
  idleExecutionCommand,
} from './executionCommandCoordinator';

export interface StartExecutionOptions {
  nodes: WorkflowNode[];
  ownerName?: string;
  workflowName?: string;
  workstationType?: string | null;
  autoStartupConfig?: NodeParameters;
  pathConfig?: FilePathConfig;
  startFromUnrolledIndex?: number;
  forceStartWithMissingRunMetadata?: boolean;
}

interface ExecutionIdentityState {
  executionId: string | null;
  workflowId: string | null;
}

interface ExecutionNodeState {
  statuses: NodeStatus[];
  results: unknown[];
  currentIndex: number | null;
}

interface ExecutionProgressState {
  percentage: number;
  loops: Record<number, LoopProgress>;
}

export interface ExecutionState {
  identity: ExecutionIdentityState;
  nodes: ExecutionNodeState;
  progress: ExecutionProgressState;
  snapshot: ExecutionSnapshot | null;
  command: ExecutionCommandState;
  startExecution: (options: StartExecutionOptions) => Promise<{ executionId: string; workflowId: string }>;
  cancelExecution: () => Promise<void>;
  pauseExecution: () => Promise<void>;
  resumeExecution: () => Promise<void>;
  resetExecution: () => Promise<boolean>;
}

const emptyIdentity = (): ExecutionIdentityState => ({
  executionId: null,
  workflowId: null,
});

const emptyNodes = (): ExecutionNodeState => ({
  statuses: [],
  results: [],
  currentIndex: null,
});

const emptyProgress = (): ExecutionProgressState => ({
  percentage: 0,
  loops: {},
});

const snapshotPercentage = (snapshot: ExecutionSnapshot): number => {
  const elapsedSeconds = snapshot.eta?.elapsedSeconds ?? 0;
  const remainingSeconds = snapshot.eta?.estimatedRemainingSeconds ?? 0;
  const totalSeconds = elapsedSeconds + remainingSeconds;
  return totalSeconds > 0 ? Math.round((elapsedSeconds / totalSeconds) * 100) : 0;
};

export const useExecutionStore = create<ExecutionState>()(
  devtools(
    (set, get) => {
      let connectedRuntimeId: string | null = null;
      let lastSnapshotSequence = -1;
      // 工作区代次：运行时切换、nodes reset、教学进出都会推进，用于丢弃过期的 HTTP 结果。
      let workspaceGeneration = 0;
      let snapshotRequest: Promise<void> | null = null;

      // 命令收口统一交给共用机制；Socket 与 HTTP 只把公共事实喂给它。
      const coordinator = createExecutionCommandCoordinator({
        readCommand: () => get().command,
        writeCommand: (next) => set({ command: next }),
        readPhase: () => readExecutionPhase(get().snapshot?.status),
        readRuntimeId: () => connectedRuntimeId,
        readExecutionId: () => get().identity.executionId,
        refreshSnapshot: () => refreshSnapshot(),
      });

      function receiveSnapshot(snapshot: ExecutionSnapshot) {
        const state = get();
        if (snapshot.runtimeId !== connectedRuntimeId || snapshot.snapshotSequence <= lastSnapshotSequence) return;
        lastSnapshotSequence = snapshot.snapshotSequence;

        const phase = readExecutionPhase(snapshot.status);
        const sameExecution = Boolean(
          snapshot.executionId
          && snapshot.executionId === state.identity.executionId,
        );
        const nodeCount = snapshot.nodes?.length ?? state.nodes.statuses.length;
        const snapshotResults = Array.isArray(snapshot.results) ? snapshot.results : null;
        const snapshotLoops = snapshot.loopProgress
          ? Object.fromEntries(snapshot.loopProgress.map(loop => [loop.loopStartIndex, loop]))
          : sameExecution ? state.progress.loops : {};

        set({
          identity: phase === 'idle'
            ? emptyIdentity()
            : {
              executionId: snapshot.executionId ?? null,
              workflowId: snapshot.workflowId ?? null,
            },
          nodes: phase === 'idle'
            ? emptyNodes()
            : {
              statuses: nodeStatusesFromSnapshot(snapshot, nodeCount),
              results: snapshotResults ?? (sameExecution ? state.nodes.results : []),
              currentIndex: describeExecution(snapshot).is.active
                ? snapshot.currentStep?.index ?? null
                : null,
            },
          progress: phase === 'idle'
            ? emptyProgress()
            : {
              percentage: snapshotPercentage(snapshot),
              loops: snapshotLoops,
            },
          snapshot,
          command: coordinator.reconcileCommand(phase, snapshot.executionId ?? null),
        });
        coordinator.noteSnapshot(phase, snapshot.executionId ?? null);
      }

      // 真正 single-flight：同一时刻只有一个快照请求，且按工作区代次保护 HTTP 结果。
      async function refreshSnapshot() {
        if (snapshotRequest) return snapshotRequest;
        const generation = workspaceGeneration;
        const requestedRuntimeId = connectedRuntimeId;
        const request = (async () => {
          const snapshot = await runtimeClient.runtime.snapshot();
          if (generation !== workspaceGeneration) return;
          if (connectedRuntimeId !== requestedRuntimeId) return;
          if (connectedRuntimeId === null) connectedRuntimeId = snapshot.runtimeId;
          receiveSnapshot(snapshot);
        })();
        snapshotRequest = request;
        try {
          await request;
        } finally {
          snapshotRequest = null;
        }
      }

      if (typeof window !== 'undefined') {
        runtimeSocket.on<{ runtimeId: string }>(RUNTIME_CONNECTED, ({ runtimeId }) => {
          if (connectedRuntimeId !== runtimeId) {
            lastSnapshotSequence = -1;
            workspaceGeneration += 1;
          }
          if (connectedRuntimeId !== null && connectedRuntimeId !== runtimeId) {
            coordinator.invalidateScope();
          }
          connectedRuntimeId = runtimeId;
        });
        runtimeSocket.connectSocket();

        runtimeSocket.on<NodeStatusUpdate>(WORKFLOW_NODE_STATUS, (update) => {
          const state = get();
          if (!update.executionId || update.executionId !== state.identity.executionId) return;
          if (update.originalIndex < 0) return;

          const statuses = [...state.nodes.statuses];
          statuses[update.originalIndex] = readExecutionPhase(update.status);
          const results = [...state.nodes.results];
          if (update.result !== undefined) results[update.originalIndex] = update.result;

          set({
            nodes: {
              statuses,
              results,
              currentIndex: update.status === 'running'
                ? update.originalIndex
                : state.nodes.currentIndex,
            },
          });
        });

        runtimeSocket.on<NodesResetEvent>(WORKFLOW_NODES_RESET, () => {
          workspaceGeneration += 1;
          coordinator.invalidateScope();
          set({
            identity: emptyIdentity(),
            nodes: emptyNodes(),
            progress: emptyProgress(),
            snapshot: null,
            command: idleExecutionCommand(),
          });
        });

        runtimeSocket.on<LoopIterationEvent>(WORKFLOW_LOOP_START, (event) => {
          const state = get();
          if (!event.executionId || event.executionId !== state.identity.executionId) return;

          const statuses = [...state.nodes.statuses];
          for (const nodeIndex of event.nodeIndices) {
            if (nodeIndex >= 0 && nodeIndex < statuses.length) statuses[nodeIndex] = 'idle';
          }

          set({
            nodes: { ...state.nodes, statuses },
            progress: {
              ...state.progress,
              loops: {
                ...state.progress.loops,
                [event.loopStartIndex]: {
                  loopStartIndex: event.loopStartIndex,
                  current: event.iteration,
                  total: event.totalIterations,
                  nodeIndices: event.nodeIndices,
                },
              },
            },
          });
        });

        runtimeSocket.on<ExecutionSnapshot>(WORKFLOW_SNAPSHOT, receiveSnapshot);
      }

      return {
        identity: emptyIdentity(),
        nodes: emptyNodes(),
        progress: emptyProgress(),
        snapshot: null,
        command: idleExecutionCommand(),

        startExecution: async ({
          nodes,
          ownerName,
          workflowName,
          workstationType,
          autoStartupConfig,
          pathConfig,
          startFromUnrolledIndex = 0,
          forceStartWithMissingRunMetadata = false,
        }) => {
          const execution = describeExecution(get().snapshot, get().command);
          if (!execution.can.start || execution.command.pending) {
            throw new Error(`Cannot start execution while phase is ${execution.phase}`);
          }
          // 发起前已有的执行身份：用于挡掉旧执行的终态快照，避免提前解锁 start。
          const previousExecutionId = get().identity.executionId;

          set({
            identity: emptyIdentity(),
            nodes: {
              statuses: new Array<NodeStatus>(nodes.length).fill('idle'),
              results: new Array(nodes.length).fill(null),
              currentIndex: null,
            },
            progress: emptyProgress(),
            snapshot: null,
          });

          const outcome = await coordinator.execute({
            kind: 'start',
            send: () => runtimeClient.executions.start<{
              executionId: string;
              workflowId: string;
              status: string;
            }>({
              nodes,
              ownerName,
              workflowName,
              workstationType,
              autoStartupConfig,
              pathConfig,
              startFromUnrolledIndex,
              forceStartWithMissingRunMetadata,
            }),
            onAccepted: (accepted) => {
              set({
                identity: {
                  executionId: accepted.executionId,
                  workflowId: accepted.workflowId,
                },
              });
            },
            failureMessage: (error) => {
              const details = error && typeof error === 'object' && 'details' in error
                ? (error as { details?: { code?: string } }).details
                : undefined;
              if (details?.code === 'MISSING_RUN_METADATA' || details?.code === 'INVALID_RUN_METADATA' || details?.code === 'WORKFLOW_VALIDATION_FAILED') return null;
              return error instanceof Error ? error.message : '启动执行失败';
            },
            previousExecutionId,
          });

          if (!outcome.accepted) throw outcome.error;
          const accepted = outcome.acceptedValue;
          if (!accepted) throw new Error('启动执行失败');
          return { executionId: accepted.executionId, workflowId: accepted.workflowId };
        },

        cancelExecution: async () => {
          const state = get();
          const execution = describeExecution(state.snapshot, state.command);
          const executionId = state.identity.executionId;
          if (!executionId || !execution.can.cancel || execution.command.pending) return;

          await coordinator.execute({
            kind: 'cancel',
            send: async () => { await runtimeClient.executions.cancel(executionId); },
            failureMessage: (error) => (error instanceof Error ? error.message : '停止失败'),
          });
        },

        pauseExecution: async () => {
          const state = get();
          const execution = describeExecution(state.snapshot, state.command);
          const executionId = state.identity.executionId;
          if (!executionId || !execution.can.pause || execution.command.pending) return;

          await coordinator.execute({
            kind: 'pause',
            send: async () => { await runtimeClient.executions.pause(executionId); },
            failureMessage: (error) => (error instanceof Error ? error.message : '暂停失败'),
          });
        },

        resumeExecution: async () => {
          const state = get();
          const execution = describeExecution(state.snapshot, state.command);
          const executionId = state.identity.executionId;
          if (!executionId || !execution.can.resume || execution.command.pending) return;

          await coordinator.execute({
            kind: 'resume',
            send: async () => { await runtimeClient.executions.resume(executionId); },
            failureMessage: (error) => (error instanceof Error ? error.message : '恢复失败'),
          });
        },

        resetExecution: async () => {
          const state = get();
          const execution = describeExecution(state.snapshot, state.command);
          if (!execution.can.reset || execution.command.pending) return false;

          const outcome = await coordinator.execute({
            kind: 'reset',
            send: async () => {
              const result = await runtimeClient.executions.reset<{
                success: boolean;
                message: string;
                timestamp: string;
              }>();
              if (!result?.success) throw new Error(result?.message || '重置失败');
            },
            failureMessage: (error) => (error instanceof Error ? error.message : '重置失败'),
          });
          if (!outcome.accepted) return false;
          return describeExecution(get().snapshot).phase === 'idle';
        },
      };
    },
    { name: 'execution-store' },
  ),
);

export const useExecutionSnapshot = () => useExecutionStore(state => state.snapshot);

export const useLoopProgress = (loopStartIndex: number) =>
  useExecutionStore(state => state.progress.loops[loopStartIndex]);

/** 运行中的画布展示后端计划，只有空闲或终态才能编辑草稿。 */
export function selectCanvasEditable(state: ExecutionState): boolean {
  return !describeExecution(state.snapshot, state.command).is.active && state.command.pending === null;
}
