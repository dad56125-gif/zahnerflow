import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { executionService } from '../workflow/workflowService';
import { workflowWebSocketService } from '../workflow/websocket.service';
import { ExecutionSnapshot, LoopIterationEvent } from '../types/Interfaces';
// clearMeasurementCache 已解耦，现在由 useMeasurementStream 自己监听 nodesReset 事件

interface ExecutionState {
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
  startExecution: (workflowId: string | null, nodes: any[]) => Promise<void>;
  stopExecution: () => Promise<void>;
  pauseExecution: () => Promise<void>;
  resumeExecution: () => Promise<void>;
  clearError: () => void;
  resetExecutionState: () => void;
}

export const useExecutionStore = create<ExecutionState>()(
  devtools(
    (set, get) => {
      // 在 Store 创建时仅初始化一次 WebSocket 监听
      if (typeof window !== 'undefined') {
        // 确保 WebSocket 连接已建立
        workflowWebSocketService.connect();

        // 1. 监听节点细粒度更新 (用于UI实时反馈：节点变色、数据更新)
        // 注意：这里使用 any 类型，因为实际传输的是简写格式以优化带宽
        // 预期格式: { i: index, s: status, d?: data } 而非完整的 NodeStatusUpdate
        workflowWebSocketService.onNodeStatusUpdate((update: any) => {
          // update 格式是 { i: number, s: string, d?: any } (简化的索引更新)

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
        workflowWebSocketService.onNodesReset((event) => {
          console.log('[ExecutionStateBridge] 收到 nodesReset 事件:', event);
          // 重置节点状态
          set({
            nodeStatuses: [],
            nodeResults: [],
            currentNodeIndex: null,
            error: null,
            executionId: null,
            isRunning: false,
            isPaused: false,
            loopProgress: {}
          });
        });

        // ✅ 监听循环迭代开始事件（重置循环内节点状态为 idle）
        workflowWebSocketService.onLoopIterationStart((event: LoopIterationEvent) => {
          const state = get();
          console.log('[ExecutionStateBridge] 循环迭代开始:', event);

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
        workflowWebSocketService.onSystemStateSnapshot((snapshot: ExecutionSnapshot) => {
          const state = get();

          // ✅ 核心改动：直接把快照存入 Store
          const updates: any = { lastSnapshot: snapshot };

          const { status, executionId, error, currentStep, workflowId } = snapshot;

          // 如果当前没有运行，但收到了运行中的快照（例如页面刷新后重连），则同步状态
          // 或者如果当前正在运行，根据快照更新状态

          // 情况 A: 执行结束 (Completed / Failed / Cancelled)
          if (['completed', 'failed', 'cancelled'].includes(status)) {
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
          else if (status === 'running' || status === 'paused') {
            const isPaused = status === 'paused';


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

        startExecution: async (workflowId, nodes) => {
          // 【日志】前端传递的节点列表 - 记录完整信息
          console.log(`[前端执行] 前端传递节点列表 - 数量: ${nodes.length}`);
          nodes.forEach((node, index) => {
            console.log(`[前端节点] 索引: ${index}, 类型: ${node.type}, 参数: ${JSON.stringify(node.config || {})}`);
          });

          // 初始化状态
          set({
            isRunning: true,
            isPaused: false,
            workflowId,
            executionId: null, // 先置空，等待 API 返回
            error: null,
            progress: 0,
            nodeStatuses: new Array(nodes.length).fill('idle'),
            nodeResults: new Array(nodes.length).fill(null),
            currentNodeIndex: null,
            loopProgress: {} // 重置循环进度
          });

          try {
            // 调用 HTTP API 启动
            const result = await executionService.executeWorkflow(workflowId, nodes);

            // 更新返回的 executionId
            set({
              executionId: result.executionId,
              workflowId: result.workflowId || workflowId
            });

            // 注意：后续的状态更新将由 WebSocket 的 snapshot 事件接管
          } catch (error) {
            set({
              error: error instanceof Error ? error.message : '启动执行失败',
              isRunning: false
            });
            throw error;
          }
        },

        stopExecution: async () => {
          const { executionId } = get();
          if (!executionId) return;
          try {
            await executionService.stopExecution(executionId);
            // 这里不立即 set isRunning: false，而是等待 snapshot 确认状态变为 cancelled/idle
            // 但为了 UI 响应速度，可以先乐观更新，snapshot 会修正它
            set({ isRunning: false, isPaused: false, currentNodeIndex: null });
          } catch (error) {
            set({ error: '停止失败' });
          }
        },

        pauseExecution: async () => {
          const { executionId } = get();
          if (!executionId) return;
          try {
            await executionService.pauseExecution(executionId);
            set({ isPaused: true }); // 乐观更新
          } catch (e) { console.error(e); }
        },

        resumeExecution: async () => {
          const { executionId } = get();
          if (!executionId) return;
          try {
            await executionService.resumeExecution(executionId);
            set({ isPaused: false }); // 乐观更新
          } catch (e) { console.error(e); }
        },

        clearError: () => set({ error: null }),

        resetExecutionState: () => set({
          isRunning: false,
          isPaused: false,
          executionId: null,
          nodeStatuses: [],
          nodeResults: [],
          currentNodeIndex: null,
          error: null,
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