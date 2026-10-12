import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  ExecutionPhase,
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
  executionPhases,
  nodeStatusesFromSnapshot,
  readExecutionPhase,
} from './executionStateModel';
import type { ExecutionCommandState } from './executionStateModel';

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

const idleCommand = (): ExecutionCommandState => ({
  pending: null,
  error: null,
});

const commandReachedPhase = (
  command: ExecutionCommandState['pending'],
  phase: ExecutionPhase,
): boolean => {
  if (command && command !== 'reset' && executionPhases[phase].is.terminal) return true;
  if (command === 'start') return phase !== 'idle';
  if (command === 'pause') return phase === 'paused';
  if (command === 'resume') return phase === 'running';
  if (command === 'cancel') return phase === 'cancelling' || phase === 'cancelled';
  if (command === 'reset') return phase === 'idle';
  return false;
};

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
      let cancellationRefreshTimer: ReturnType<typeof setTimeout> | null = null;
      const receiveSnapshot = (snapshot: ExecutionSnapshot) => {
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
        const command = commandReachedPhase(state.command.pending, phase)
          ? idleCommand()
          : state.command;

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
          command,
        });
        if (cancellationRefreshTimer !== null) {
          clearTimeout(cancellationRefreshTimer);
          cancellationRefreshTimer = null;
        }
        if (phase === 'cancelling') {
          cancellationRefreshTimer = setTimeout(() => {
            cancellationRefreshTimer = null;
            if (get().snapshot !== snapshot) return;
            void refreshSnapshot().catch((error: unknown) => {
              if (get().snapshot !== snapshot) return;
              set({ command: {
                pending: null,
                error: error instanceof Error ? error.message : '停止状态同步失败',
              } });
            });
          }, 500);
        }
      };
      const refreshSnapshot = async () => {
        const requestedRuntimeId = connectedRuntimeId;
        const snapshot = await runtimeClient.runtime.snapshot();
        if (connectedRuntimeId !== requestedRuntimeId) return;
        if (connectedRuntimeId === null) connectedRuntimeId = snapshot.runtimeId;
        receiveSnapshot(snapshot);
      };

      if (typeof window !== 'undefined') {
        runtimeSocket.on<{ runtimeId: string }>(RUNTIME_CONNECTED, ({ runtimeId }) => {
          if (connectedRuntimeId !== runtimeId) lastSnapshotSequence = -1;
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
          set({
            identity: emptyIdentity(),
            nodes: emptyNodes(),
            progress: emptyProgress(),
            snapshot: null,
            command: idleCommand(),
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
        command: idleCommand(),

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

          const command: ExecutionCommandState = { pending: 'start', error: null };
          set({
            identity: emptyIdentity(),
            nodes: {
              statuses: new Array<NodeStatus>(nodes.length).fill('idle'),
              results: new Array(nodes.length).fill(null),
              currentIndex: null,
            },
            progress: emptyProgress(),
            snapshot: null,
            command,
          });

          try {
            const result = await runtimeClient.executions.start<{
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
            });

            if (get().command === command) {
              set({
                identity: {
                  executionId: result.executionId,
                  workflowId: result.workflowId,
                },
              });
            }
            await refreshSnapshot();

            return {
              executionId: result.executionId,
              workflowId: result.workflowId,
            };
          } catch (error) {
            const details = error && typeof error === 'object' && 'details' in error
              ? (error as { details?: { code?: string } }).details
              : undefined;
            const message = details?.code === 'MISSING_RUN_METADATA'
              ? null
              : error instanceof Error ? error.message : '启动执行失败';
            if (get().command === command) set({ command: { pending: null, error: message } });
            throw error;
          }
        },

        cancelExecution: async () => {
          const state = get();
          const execution = describeExecution(state.snapshot, state.command);
          const executionId = state.identity.executionId;
          if (!executionId || !execution.can.cancel || execution.command.pending) return;

          const command: ExecutionCommandState = { pending: 'cancel', error: null };
          set({ command });
          try {
            await runtimeClient.executions.cancel(executionId);
            await refreshSnapshot();
            if (get().command === command) set({ command: idleCommand() });
          } catch (error) {
            if (get().command === command) {
              set({ command: { pending: null, error: error instanceof Error ? error.message : '停止失败' } });
            }
          }
        },

        pauseExecution: async () => {
          const state = get();
          const execution = describeExecution(state.snapshot, state.command);
          const executionId = state.identity.executionId;
          if (!executionId || !execution.can.pause || execution.command.pending) return;

          const command: ExecutionCommandState = { pending: 'pause', error: null };
          set({ command });
          try {
            await runtimeClient.executions.pause(executionId);
            await refreshSnapshot();
            if (get().command === command) set({ command: idleCommand() });
          } catch (error) {
            if (get().command === command) set({
              command: {
                pending: null,
                error: error instanceof Error ? error.message : '暂停失败',
              },
            });
          }
        },

        resumeExecution: async () => {
          const state = get();
          const execution = describeExecution(state.snapshot, state.command);
          const executionId = state.identity.executionId;
          if (!executionId || !execution.can.resume || execution.command.pending) return;

          const command: ExecutionCommandState = { pending: 'resume', error: null };
          set({ command });
          try {
            await runtimeClient.executions.resume(executionId);
            await refreshSnapshot();
            if (get().command === command) set({ command: idleCommand() });
          } catch (error) {
            if (get().command === command) set({
              command: {
                pending: null,
                error: error instanceof Error ? error.message : '恢复失败',
              },
            });
          }
        },

        resetExecution: async () => {
          const state = get();
          const execution = describeExecution(state.snapshot, state.command);
          if (!execution.can.reset || execution.command.pending) return false;

          const command: ExecutionCommandState = { pending: 'reset', error: null };
          set({ command });
          try {
            const result = await runtimeClient.executions.reset();
            if (!result?.success) {
              if (get().command === command) set({ command: { pending: null, error: result?.message || '重置失败' } });
              return false;
            }
            await refreshSnapshot();
            if (get().command === command) set({ command: idleCommand() });
            return describeExecution(get().snapshot).phase === 'idle';
          } catch (error) {
            if (get().command === command) set({
              command: {
                pending: null,
                error: error instanceof Error ? error.message : '重置失败',
              },
            });
            return false;
          }
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
