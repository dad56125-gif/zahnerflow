import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { workflowService } from './workflowService'; // 注意引用路径
import { workflowWebSocketService } from './websocket.service';

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
        
        // 1. 监听节点更新 (i=index, s=status, d=data)
        workflowWebSocketService.onExecutionUpdate((update: any) => {
          // 这里假设 update 格式是 { i: number, s: string, d?: any }
          // 如果后端返回格式是 ExecutionUpdate (full object)，需要适配
          
          const state = get();
          // 如果接收到的是简化的索引更新
          if (update.i !== undefined && state.executionId) {
             const newNodeStatuses = [...state.nodeStatuses];
             newNodeStatuses[update.i] = update.s;
             
             const changes: any = { nodeStatuses: newNodeStatuses };
             if (update.d !== undefined) {
               const newNodeResults = [...state.nodeResults];
               newNodeResults[update.i] = update.d;
               changes.nodeResults = newNodeResults;
             }
             if (update.s === 'run') changes.currentNodeIndex = update.i;
             
             set(changes);
          }
        });

        // 2. 监听完成
        workflowWebSocketService.onExecutionComplete && workflowWebSocketService.onExecutionComplete((data: any) => {
           if (get().executionId === data.executionId) {
             set({ isRunning: false, isPaused: false, currentNodeIndex: null });
           }
        });
        
        // 3. 监听全量快照 (作为兜底)
        workflowWebSocketService.onSystemStateSnapshot && workflowWebSocketService.onSystemStateSnapshot((snapshot) => {
            // 如果需要同步后端状态，可以在这里处理
            if (snapshot.status === 'running' && !get().isRunning) {
                set({ isRunning: true, executionId: snapshot.executionId });
            }
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

        startExecution: async (workflowId, nodes) => {
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
            // 使用 execution service
            const result = await workflowService.execution.executeWorkflow(workflowId, nodes);
            set({
              executionId: result.executionId,
              workflowId: result.workflowId || workflowId
            });
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
            await workflowService.execution.stopExecution(executionId);
            set({ isRunning: false, isPaused: false, currentNodeIndex: null });
          } catch (error) {
            set({ error: '停止失败' });
          }
        },

        pauseExecution: async () => {
          const { executionId } = get();
          if (!executionId) return;
          try {
            await workflowService.execution.pauseExecution(executionId);
            set({ isPaused: true });
          } catch (e) { console.error(e); }
        },

        resumeExecution: async () => {
          const { executionId } = get();
          if (!executionId) return;
          try {
            await workflowService.execution.resumeExecution(executionId);
            set({ isPaused: false });
          } catch (e) { console.error(e); }
        },

        clearError: () => set({ error: null }),
        resetExecutionState: () => set({
          isRunning: false,
          isPaused: false,
          executionId: null,
          nodeStatuses: [],
          nodeResults: []
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