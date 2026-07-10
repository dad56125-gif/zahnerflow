import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { runtimeClient, runtimeSocket } from '../runtimeClient';
import {
  WORKFLOW_LOOP_START,
  WORKFLOW_NODE_STATUS,
  WORKFLOW_NODES_RESET,
  WORKFLOW_SNAPSHOT,
} from '../eventContracts';
import type {
  ExecutionSnapshot,
  LoopIterationEvent,
  NodesResetEvent,
  NodeStatus,
  NodeStatusUpdate,
} from '@zahnerflow/types';
// clearMeasurementCache 已解耦，现在由 useMeasurementStream 自己监听 nodesReset 事件

export interface StartExecutionOptions {
  nodes: any[];
  ownerName?: string;
  workflowName?: string;
  workstationType?: string | null;
  autoStartupConfig?: Record<string, any>;
  pathConfig?: Record<string, any>;
  startFromUnrolledIndex?: number;
  forceStartWithMissingRunMetadata?: boolean;
}

export interface ExecutionState {
  isRunning: boolean;
  isPaused: boolean;
  executionId: string | null;
  workflowId: string | null;
  progress: number;
  error: string | null;

  // 核心状态：基于索引
  nodeStatuses: string[];
  nodeResults: any[];
  currentNodeIndex: number | null;

  // ✅ 新增：保存最新的完整快照，供组件读取详细信息
  lastSnapshot: ExecutionSnapshot | null;

  // ✅ 新增：循环进度跟踪
  loopProgress: {
    [loopStartIndex: number]: {
      current: number;
      total: number;
      nodeIndices: number[];
    }
  };

  // Actions
  startExecution: (options: StartExecutionOptions) => Promise<{ executionId: string; workflowId: string }>;
  stopExecution: () => Promise<void>;
  pauseExecution: () => Promise<void>;
  resumeExecution: () => Promise<void>;
  clearError: () => void;
  resetExecutionState: () => void;
}

const ACTIVE_EXECUTION_STATUSES = new Set<NodeStatus>(['running', 'paused', 'cancelling']);
const TERMINAL_EXECUTION_STATUSES = new Set<NodeStatus>(['completed', 'failed', 'cancelled']);

export interface ExecutionUiState {
  phase: NodeStatus;
  isActive: boolean;
  isTerminal: boolean;
  isRunning: boolean;
  isPaused: boolean;
  isCancelling: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  isCancelled: boolean;
  canReset: boolean;
  label: string;
  message: string;
  color: string;
}

export type NodeExecutionUiPhase =
  | 'pending'
  | 'running'
  | 'paused'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'cancelled';

export function isActiveExecutionStatus(status: string | null | undefined): boolean {
  return ACTIVE_EXECUTION_STATUSES.has(status as NodeStatus);
}

export function isTerminalExecutionStatus(status: string | null | undefined): boolean {
  return TERMINAL_EXECUTION_STATUSES.has(status as NodeStatus);
}

export function deriveExecutionUiState(
  snapshot: ExecutionSnapshot | null | undefined,
  fallback: { isRunning?: boolean; isPaused?: boolean; error?: string | null } = {},
): ExecutionUiState {
  let phase = String(snapshot?.status || '') as NodeStatus;
  if (!ACTIVE_EXECUTION_STATUSES.has(phase) && !TERMINAL_EXECUTION_STATUSES.has(phase) && phase !== 'idle') {
    phase = fallback.error ? 'failed' : fallback.isPaused ? 'paused' : fallback.isRunning ? 'running' : 'idle';
  }

  const isActive = isActiveExecutionStatus(phase);
  const isTerminal = isTerminalExecutionStatus(phase);
  const labels: Record<NodeStatus, string> = {
    idle: '就绪',
    running: '运行中',
    paused: '已暂停',
    cancelling: '停止中',
    completed: '已完成',
    failed: '执行失败',
    cancelled: '已取消',
  };
  const messages: Record<NodeStatus, string> = {
    idle: '就绪',
    running: '流程运行中...',
    paused: '流程已暂停',
    cancelling: '正在停止，等待当前节点结束...',
    completed: '流程已完成',
    failed: '流程执行失败',
    cancelled: '流程已取消',
  };
  const colors: Record<NodeStatus, string> = {
    idle: 'var(--color-neutral)',
    running: 'var(--color-primary)',
    paused: 'var(--color-primary)',
    cancelling: 'var(--color-warning)',
    completed: 'var(--color-success)',
    failed: 'var(--color-danger)',
    cancelled: 'var(--color-warning)',
  };

  return {
    phase,
    isActive,
    isTerminal,
    isRunning: phase === 'running',
    isPaused: phase === 'paused',
    isCancelling: phase === 'cancelling',
    isCompleted: phase === 'completed',
    isFailed: phase === 'failed',
    isCancelled: phase === 'cancelled',
    canReset: isTerminal,
    label: labels[phase],
    message: messages[phase],
    color: colors[phase],
  };
}

export function deriveNodeExecutionUiPhase(
  nodeStatus: string | null | undefined,
  nodeIndex: number,
  snapshot: ExecutionSnapshot | null | undefined,
): NodeExecutionUiPhase {
  const execution = deriveExecutionUiState(snapshot);
  const currentIndex = snapshot?.currentStep?.index;

  if (nodeStatus === 'run' || nodeStatus === 'running') {
    if (currentIndex === nodeIndex && execution.isPaused) return 'paused';
    if (currentIndex === nodeIndex && execution.isCancelling) return 'cancelling';
    return 'running';
  }
  if (nodeStatus === 'success' || nodeStatus === 'completed') return 'completed';
  if (nodeStatus === 'failed') return 'failed';
  if (nodeStatus === 'cancelled') return 'cancelled';
  if (nodeStatus === 'paused') return 'paused';
  if (nodeStatus === 'cancelling') return 'cancelling';

  if (currentIndex !== undefined && currentIndex !== null) {
    if (nodeIndex < currentIndex) return 'completed';
    if (nodeIndex > currentIndex) return 'pending';
    if (execution.isActive || execution.isTerminal) {
      return execution.phase === 'idle' ? 'pending' : execution.phase;
    }
  }

  if (execution.isCompleted) return 'completed';
  return 'pending';
}

export const useExecutionStore = create<ExecutionState>()(
  devtools(
    (set, get) => {
      // 在 Store 创建时仅初始化一次 WebSocket 监听
      if (typeof window !== 'undefined') {
        // 确保 WebSocket 连接已建立
        runtimeSocket.connectSocket();

        // 1. 监听节点细粒度索引更新（与共享 NodeStatusUpdate 契约一致）
        runtimeSocket.on<NodeStatusUpdate>(WORKFLOW_NODE_STATUS, (update) => {
          const state = get();
          // 仅当 update 包含索引且当前有执行ID时处理
          if (update && update.i !== undefined && state.executionId) {
            const newNodeStatuses = [...state.nodeStatuses];
            // 防止数组越界
            if (update.i >= 0) {
              newNodeStatuses[update.i] = update.s;

              const changes: any = { nodeStatuses: newNodeStatuses };

              if (update.d !== undefined) {
                const newNodeResults = [...state.nodeResults];
                newNodeResults[update.i] = update.d;
                changes.nodeResults = newNodeResults;
              }

              // 如果节点状态变为运行中，更新当前索引
              if (update.s === 'run' || update.s === 'running') {
                changes.currentNodeIndex = update.i;
              }

              set(changes);
            }
          }
        });

        // 🔥 SSOT: 监听后端 nodesReset 事件，统一处理状态重置
        // clearMeasurementCache 已解耦到 useMeasurementStream 自己监听
        runtimeSocket.on<NodesResetEvent>(WORKFLOW_NODES_RESET, () => {
          // 重置节点状态
          set({
            nodeStatuses: [],
            nodeResults: [],
            currentNodeIndex: null,
            error: null,
            executionId: null,
            isRunning: false,
            isPaused: false,
            lastSnapshot: null,
            loopProgress: {}
          });
        });

        // ✅ 监听循环迭代开始事件（重置循环内节点状态为 idle）
        runtimeSocket.on(WORKFLOW_LOOP_START, (event: LoopIterationEvent) => {
          const state = get();

          // 重置循环内节点状态为 idle
          const newNodeStatuses = [...state.nodeStatuses];
          event.nodeIndices.forEach(idx => {
            if (idx >= 0 && idx < newNodeStatuses.length) {
              newNodeStatuses[idx] = 'idle';
            }
          });

          set({
            nodeStatuses: newNodeStatuses,
            loopProgress: {
              ...state.loopProgress,
              [event.loopStartIndex]: {
                current: event.iteration,
                total: event.totalIterations,
                nodeIndices: event.nodeIndices
              }
            }
          });
        });

        // 2. 监听全量系统快照 (作为执行状态的单一真理源 SSOT)
        // 替代了原本不存在的 onExecutionComplete，统一处理开始、暂停、完成、失败
        runtimeSocket.on(WORKFLOW_SNAPSHOT, (snapshot: ExecutionSnapshot) => {
          const state = get();

          // ✅ 核心改动：直接把快照存入 Store
          const updates: any = { lastSnapshot: snapshot };

          const { status, executionId, error, currentStep, workflowId } = snapshot;
          const etaTotal = snapshot.eta
            ? snapshot.eta.elapsedSeconds + snapshot.eta.estimatedRemainingSeconds
            : 0;
          if (etaTotal > 0) {
            updates.progress = Math.round((snapshot.eta!.elapsedSeconds / etaTotal) * 100);
          }

          // 如果当前没有运行，但收到了运行中的快照（例如页面刷新后重连），则同步状态
          // 或者如果当前正在运行，根据快照更新状态

          // 情况 A: 执行结束 (Completed / Failed / Cancelled)
          if (isTerminalExecutionStatus(status)) {
            // 只有当快照的 executionId 匹配当前 store 的 ID，或者 store 认为正在运行时才处理
            // 防止处理旧的残留快照
            if (state.executionId === executionId || state.isRunning) {
              updates.isRunning = false;
              updates.isPaused = false;
              updates.currentNodeIndex = null;
              updates.error = status === 'failed' ? (error || '执行失败') : null;
            }
          }

          // 情况 B: 正在运行或暂停 (Running / Paused)
          else if (isActiveExecutionStatus(status)) {
            const isPaused = status === 'paused';
            updates.error = error || null;


            // 强制同步运行状态
            if (!state.isRunning) {
              updates.isRunning = true;
            }

            // 同步暂停状态
            if (state.isPaused !== isPaused) {
              updates.isPaused = isPaused;
            }

            // 同步 ID (如果是接管会话)
            if (state.executionId !== executionId) {
              updates.executionId = executionId;
              updates.workflowId = workflowId;
            }

            // 同步当前步骤 (如果有)
            if (currentStep && currentStep.index !== undefined && currentStep.index !== state.currentNodeIndex) {
              updates.currentNodeIndex = currentStep.index;
            }

            // 同步错误信息 (如果有)
            if (error && state.error !== error) {
              updates.error = error;
            }
          }

          // 情况 C: 空闲 (Idle)
          else if (status === 'idle') {
            if (state.isRunning) {
              updates.isRunning = false;
              updates.isPaused = false;
              updates.currentNodeIndex = null;
            }
          }

          // ✅ 统一更新所有状态
          set(updates);
        });
      }

      return {
        isRunning: false,
        isPaused: false,
        executionId: null,
        workflowId: null,
        progress: 0,
        error: null,
        nodeStatuses: [],
        nodeResults: [],
        currentNodeIndex: null,
        lastSnapshot: null, // ✅ 初始化为空
        loopProgress: {}, // ✅ 初始化循环进度

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
          // 初始化状态
          set({
            isRunning: true,
            isPaused: false,
            workflowId: null,
            executionId: null, // 先置空，等待 API 返回
            error: null,
            progress: 0,
            nodeStatuses: new Array(nodes.length).fill('idle'),
            nodeResults: new Array(nodes.length).fill(null),
            currentNodeIndex: null,
            loopProgress: {}, // 重置循环进度
            lastSnapshot: null
          });

          try {
            // 调用 HTTP API 启动，传递 ownerName 和 workflowName
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

            // 更新返回的 executionId
            set({
              executionId: result.executionId,
              workflowId: result.workflowId
            });

            return {
              executionId: result.executionId,
              workflowId: result.workflowId
            };

            // 注意：后续的状态更新将由 WebSocket 的 snapshot 事件接管
          } catch (error) {
            const details = error && typeof error === 'object' && 'details' in error
              ? (error as { details?: { code?: string } }).details
              : undefined;
            set({
              error: details?.code === 'MISSING_RUN_METADATA'
                ? null
                : error instanceof Error ? error.message : '启动执行失败',
              isRunning: false
            });
            throw error;
          }
        },

        stopExecution: async () => {
          const { executionId } = get();
          if (!executionId) return;
          try {
            await runtimeClient.executions.cancel(executionId);
            // 等待后端 snapshot 从 cancelling 过渡到 cancelled，避免前端误以为已经完全停止。
            set({ isRunning: true, isPaused: false, error: null });
          } catch (error) {
            set({ error: '停止失败' });
          }
        },

        pauseExecution: async () => {
          const { executionId } = get();
          if (!executionId) return;
          try {
            await runtimeClient.executions.pause(executionId);
            set({ isPaused: true }); // 乐观更新
          } catch (e) { console.error(e); }
        },

        resumeExecution: async () => {
          const { executionId } = get();
          if (!executionId) return;
          try {
            await runtimeClient.executions.resume(executionId);
            set({ isPaused: false }); // 乐观更新
          } catch (e) { console.error(e); }
        },

        clearError: () => set({ error: null }),

        resetExecutionState: () => set({
          isRunning: false,
          isPaused: false,
          executionId: null,
          workflowId: null,
          nodeStatuses: [],
          nodeResults: [],
          currentNodeIndex: null,
          error: null,
          lastSnapshot: null,
          progress: 0,
          loopProgress: {}
        })
      };
    },
    { name: 'execution-store' }
  )
);

// 导出 Hooks 方便组件使用
export const useIsRunning = () => useExecutionStore(state => state.isRunning);
export const useExecutionError = () => useExecutionStore(state => state.error);
export const useNodeStatus = (index: number) => useExecutionStore(state => state.nodeStatuses[index] || 'idle');
// ✅ 导出 Hook：直接获取最新的 SystemState
export const useSystemState = () => useExecutionStore(state => state.lastSnapshot);
// ✅ 新增：导出循环进度 Hook
export const useLoopProgress = (loopStartIndex: number) => useExecutionStore(state => state.loopProgress[loopStartIndex]);
