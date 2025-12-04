import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { executionService } from './workflowService';
import { workflowWebSocketService, ExecutionSnapshot } from './websocket.service';

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
        
        // 1. 监听节点细粒度更新 (用于UI实时反馈：节点变色、数据更新)
        workflowWebSocketService.onExecutionUpdate((update: any) => {
          // 假设 update 格式是 { i: number, s: string, d?: any } (简化的索引更新)
          // 或者如果是完整对象，需要在此适配
          
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

        // 2. 监听全量系统快照 (作为执行状态的单一真理源 SSOT)
        // 替代了原本不存在的 onExecutionComplete，统一处理开始、暂停、完成、失败
        workflowWebSocketService.onSystemStateSnapshot((snapshot: ExecutionSnapshot) => {
            const state = get();
            const { status, executionId, error, currentStep, workflowId } = snapshot;

            // 如果当前没有运行，但收到了运行中的快照（例如页面刷新后重连），则同步状态
            // 或者如果当前正在运行，根据快照更新状态
            
            // 情况 A: 执行结束 (Completed / Failed / Cancelled)
            if (['completed', 'failed', 'cancelled'].includes(status)) {
                // 只有当快照的 executionId 匹配当前 store 的 ID，或者 store 认为正在运行时才处理
                // 防止处理旧的残留快照
                if (state.executionId === executionId || state.isRunning) {
                    set({ 
                        isRunning: false, 
                        isPaused: false, 
                        currentNodeIndex: null,
                        error: status === 'failed' ? (error || '执行失败') : null
                    });
                }
            }
            
            // 情况 B: 正在运行或暂停 (Running / Paused)
            else if (status === 'running' || status === 'paused') {
                const isPaused = status === 'paused';
                
                // 状态同步对象
                const updates: Partial<ExecutionState> = {};
                let hasUpdates = false;

                // 强制同步运行状态
                if (!state.isRunning) {
                    updates.isRunning = true;
                    hasUpdates = true;
                }
                
                // 同步暂停状态
                if (state.isPaused !== isPaused) {
                    updates.isPaused = isPaused;
                    hasUpdates = true;
                }

                // 同步 ID (如果是接管会话)
                if (state.executionId !== executionId) {
                    updates.executionId = executionId;
                    updates.workflowId = workflowId;
                    hasUpdates = true;
                }

                // 同步当前步骤 (如果有)
                if (currentStep && currentStep.index !== undefined && currentStep.index !== state.currentNodeIndex) {
                    updates.currentNodeIndex = currentStep.index;
                    hasUpdates = true;
                }

                // 同步错误信息 (如果有)
                if (error && state.error !== error) {
                    updates.error = error;
                    hasUpdates = true;
                }

                if (hasUpdates) {
                    set(updates);
                }
            }
            
            // 情况 C: 空闲 (Idle)
            else if (status === 'idle') {
                if (state.isRunning) {
                    set({ isRunning: false, isPaused: false, currentNodeIndex: null });
                }
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
            currentNodeIndex: null
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
          error: null
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