import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { workflowExecutionService } from '../workflowExecutionService';
import { workflowWebSocketService } from '../websocket.service';

// 执行状态管理
interface ExecutionState {
  isRunning: boolean;
  isPaused: boolean;
  executionId: string | null;
  workflowId: string | null;
  progress: number;
  error: string | null;

  // 操作方法
  startExecution: (workflowId: string, params?: any) => Promise<void>;
  stopExecution: () => Promise<void>;
  pauseExecution: () => Promise<void>;
  resumeExecution: () => Promise<void>;
  clearError: () => void;
  updateServerState: (snapshot: any) => void;
}

export const useExecutionStore = create<ExecutionState>()(
  devtools(
    (set, get) => {
      // 初始化WebSocket监听
      const initializeWebSocket = () => {
        // 监听执行状态更新
        workflowWebSocketService.onExecutionUpdate((update) => {
          const state = get();
          if (state.executionId === update.executionId) {
            console.log('[ExecutionStore] 收到执行状态更新:', update);

            set({
              isRunning: update.status === 'running',
              isPaused: update.status === 'paused',
              progress: update.progress,
            });
          }
        });

        // 监听执行完成
        workflowWebSocketService.onNodeCompleted((completed) => {
          const state = get();
          if (state.workflowId === completed.workflowId) {
            console.log('[ExecutionStore] 收到执行完成:', completed);
            set({
              isRunning: false,
              isPaused: false,
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

        startExecution: async (workflowId: string, params?: any) => {
          console.log('[ExecutionStore] 开始执行工作流:', workflowId);

          set({
            isRunning: true,
            isPaused: false,
            workflowId,
            executionId: null,
            error: null,
            progress: 0
          });

          try {
            const result = await workflowExecutionService.executeWorkflow(workflowId, params);

            console.log('[ExecutionStore] 执行启动成功:', result);

            set({
              executionId: result.executionId,
              workflowId: result.workflowId || workflowId,
            });

          } catch (error) {
            console.error('[ExecutionStore] 执行启动失败:', error);
            set({
              error: error instanceof Error ? error.message : '启动执行失败',
              isRunning: false,
              isPaused: false,
            });
            throw error;
          }
        },

        stopExecution: async () => {
          const { executionId } = get();
          if (!executionId) {
            console.warn('[ExecutionStore] 没有正在执行的作业');
            return;
          }

          console.log('[ExecutionStore] 停止执行:', executionId);

          try {
            // 这里应该调用停止API，当前先更新本地状态
            // await workflowExecutionService.stopExecution(executionId);

            set({
              isRunning: false,
              isPaused: false,
              progress: 0,
            });

            // 清空执行ID
            setTimeout(() => {
              set({ executionId: null });
            }, 100);

          } catch (error) {
            console.error('[ExecutionStore] 停止执行失败:', error);
            set({
              error: error instanceof Error ? error.message : '停止执行失败'
            });
          }
        },

        pauseExecution: async () => {
          console.log('[ExecutionStore] 暂停执行');
          set({ isPaused: true });
          // TODO: 实现暂停API调用
        },

        resumeExecution: async () => {
          console.log('[ExecutionStore] 恢复执行');
          set({ isPaused: false });
          // TODO: 实现恢复API调用
        },

        clearError: () => {
          set({ error: null });
        },

        updateServerState: (snapshot: any) => {
          console.log('[ExecutionStore] 更新服务器状态:', snapshot);

          set({
            isRunning: snapshot.status === 'running',
            isPaused: snapshot.status === 'paused',
            workflowId: snapshot.workflowId,
            executionId: snapshot.executionId,
            progress: snapshot.currentStep ?
              (snapshot.currentStep.index / snapshot.currentStep.total) * 100 : 0,
          });
        },
      };
    },
    { name: 'execution-store' }
  )
);

// 导出必要的 hooks，供 App.tsx 使用
export const useIsRunning = () => useExecutionStore(state => state.isRunning);
export const useExecutionError = () => useExecutionStore(state => state.error);