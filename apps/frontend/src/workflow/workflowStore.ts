import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { Workflow } from '@zahnerflow/types';
import { workflowService } from './workflowService';

interface WorkflowState {
  workflows: Workflow[];
  currentWorkflow: Workflow | null;
  isLoading: boolean;
  error: string | null;

  fetchWorkflows: () => Promise<void>;
  createWorkflow: (data: any) => Promise<void>;
  updateWorkflow: (id: string, data: any) => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;
  setCurrentWorkflow: (workflow: Workflow | null) => void;
  clearError: () => void;
}

export const useWorkflowStore = create<WorkflowState>()(
  devtools(
    persist(
      (set, get) => ({
        workflows: [],
        currentWorkflow: null,
        isLoading: false,
        error: null,

        fetchWorkflows: async () => {
          set({ isLoading: true, error: null });
          try {
            const response = await workflowService.getWorkflows();
            set({ workflows: response.items, isLoading: false });
          } catch (error) {
            set({ error: '加载工作流列表失败', isLoading: false });
          }
        },

        createWorkflow: async (data) => {
          set({ isLoading: true, error: null });
          try {
            const workflow = await workflowService.createWorkflow(data);
            set(state => ({
              workflows: [...state.workflows, workflow],
              currentWorkflow: workflow, // 创建后自动选中
              isLoading: false
            }));
          } catch (error) {
            set({ error: '创建工作流失败', isLoading: false });
            throw error;
          }
        },

        updateWorkflow: async (id, data) => {
          // 乐观更新
          set(state => {
            const isCurrent = state.currentWorkflow?.id === id;
            return {
              currentWorkflow: isCurrent ? { ...state.currentWorkflow!, ...data } : state.currentWorkflow
            };
          });

          try {
            const workflow = await workflowService.updateWorkflow(id, data);
            set(state => ({
              workflows: state.workflows.map(w => w.id === id ? workflow : w),
              currentWorkflow: state.currentWorkflow?.id === id ? workflow : state.currentWorkflow,
            }));
          } catch (error) {
            set({ error: '更新工作流失败' });
            // 回滚逻辑可在此添加
            throw error;
          }
        },

        deleteWorkflow: async (id) => {
          set({ isLoading: true, error: null });
          try {
            await workflowService.deleteWorkflow(id);
            set(state => ({
              workflows: state.workflows.filter(w => w.id !== id),
              currentWorkflow: state.currentWorkflow?.id === id ? null : state.currentWorkflow,
              isLoading: false
            }));
          } catch (error) {
            set({ error: '删除工作流失败', isLoading: false });
            throw error;
          }
        },

        setCurrentWorkflow: (workflow) => {
          set({ currentWorkflow: workflow, error: null });
        },

        clearError: () => set({ error: null }),
      }),
      {
        name: 'workflow-storage',
        partialize: (state) => ({ workflows: state.workflows }), // 不持久化 currentWorkflow，防止 ID 变更导致的问题
      }
    ),
    { name: 'workflow-store' }
  )
);