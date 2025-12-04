import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { workflowService } from '../workflowService';
import { workflowWebSocketService } from '../websocket.service';

// 基于索引的执行状态管理
interface ExecutionState {
  isRunning: boolean;
  isPaused: boolean;
  executionId: string | null;
  workflowId: string | null;
  progress: number;
  error: string | null;

  // 节点状态数组 - 索引即顺序
  nodeStatuses: string[];  // status: 'idle' | 'run' | 'ok' | 'err' | 'cancelled'
  nodeResults: any[];      // 节点执行结果
  currentNodeIndex: number | null;  // 当前执行的节点索引

  // 操作方法
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
      // 初始化WebSocket监听
      const initializeWebSocket = () => {
        // 监听节点执行状态更新
        workflowWebSocketService.onExecutionUpdate((update: { i: number; s: string; d?: any }) => {
          const state = get();
          if (state.executionId) {
            // 直接数组索引赋值 - O(1)访问
            const newNodeStatuses = [...state.nodeStatuses];
            const newNodeResults = [...state.nodeResults];

            newNodeStatuses[update.i] = update.s;
            if (update.d !== undefined) {
              newNodeResults[update.i] = update.d;
            }

            set({
              nodeStatuses: newNodeStatuses,
              nodeResults: newNodeResults,
              currentNodeIndex: update.s === 'run' ? update.i : null
            });
          }
        });

        // 监听执行完成
        workflowWebSocketService.onExecutionComplete((data: { executionId: string; workflowId: string }) => {
          const state = get();
          if (state.executionId === data.executionId) {
            set({
              isRunning: false,
              isPaused: false,
              currentNodeIndex: null
            });
          }
        });
      };

      // 如果在浏览器环境中，立即初始化
      if (typeof window !== 'undefined') {
        initializeWebSocket();
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

        startExecution: async (workflowId: string | null, nodes: any[]) => {
          set({
            isRunning: true,
            isPaused: false,
            workflowId,
            executionId: null,
            error: null,
            progress: 0,
            nodeStatuses: new Array(nodes.length).fill('idle'),
            nodeResults: new Array(nodes.length).fill(null),
            currentNodeIndex: null
          });

          try {
            const result = await workflowService.execution.executeWorkflow(workflowId, nodes);

            set({
              executionId: result.executionId,
              workflowId: result.workflowId || workflowId
            });

          } catch (error) {
            set({
              error: error instanceof Error ? error.message : '启动执行失败',
              isRunning: false,
              isPaused: false
            });
            throw error;
          }
        },

        stopExecution: async () => {
          const { executionId } = get();
          if (!executionId) {
            return;
          }

          try {
            await workflowService.execution.stopExecution(executionId);

            set({
              isRunning: false,
              isPaused: false,
              progress: 0,
              currentNodeIndex: null
            });

            setTimeout(() => {
              set({ executionId: null });
            }, 100);

          } catch (error) {
            set({
              error: error instanceof Error ? error.message : '停止执行失败'
            });
          }
        },

        pauseExecution: async () => {
          const { executionId } = get();
          if (!executionId) return;

          try {
            await workflowService.execution.pauseExecution(executionId);
            set({ isPaused: true });
          } catch (error) {
            set({ error: '暂停执行失败' });
          }
        },

        resumeExecution: async () => {
          const { executionId } = get();
          if (!executionId) return;

          try {
            await workflowService.execution.resumeExecution(executionId);
            set({ isPaused: false });
          } catch (error) {
            set({ error: '恢复执行失败' });
          }
        },

        clearError: () => {
          set({ error: null });
        },

        resetExecutionState: () => {
          set({
            isRunning: false,
            isPaused: false,
            executionId: null,
            workflowId: null,
            progress: 0,
            error: null,
            nodeStatuses: [],
            nodeResults: [],
            currentNodeIndex: null
          });
        }
      };
    },
    { name: 'execution-store' }
  )
);

// 导出必要的 hooks
export const useIsRunning = () => useExecutionStore(state => state.isRunning);
export const useExecutionError = () => useExecutionStore(state => state.error);
export const useNodeStatus = (index: number) =>
  useExecutionStore(state => state.nodeStatuses[index] || 'idle');
export const useNodeResult = (index: number) =>
  useExecutionStore(state => state.nodeResults[index] || null);
