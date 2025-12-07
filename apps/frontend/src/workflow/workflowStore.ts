import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
// 1. 引入新定义的 Workflow
import { Workflow } from '../types/Interfaces'; 
import { workflowService } from './workflowService';

interface WorkflowState {
  workflows: Workflow[];
  currentWorkflow: Workflow | null;
  isLoading: boolean;
  error: string | null;

  fetchWorkflows: () => Promise<void>;
  createWorkflow: (data: Partial<Workflow>) => Promise<void>;
  updateWorkflow: (id: string, data: Partial<Workflow>) => Promise<void>;
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
            // 🚨 强制类型转换：假设后端数据能适配，或者我们不在乎旧类型检查
            const items = (response.items || []) as unknown as Workflow[];
            set({ workflows: items, isLoading: false });
          } catch (error) {
            set({ error: '加载工作流列表失败', isLoading: false });
          }
        },

        createWorkflow: async (data) => {
          set({ isLoading: true, error: null });
          try {
            // 🚨 强制转换入参和出参
            const workflow = await workflowService.createWorkflow(data as any) as unknown as Workflow;
            
            set(state => ({
              workflows: [...state.workflows, workflow],
              currentWorkflow: workflow,
              isLoading: false
            }));
          } catch (error) {
            set({ error: '创建工作流失败', isLoading: false });
            throw error;
          }
        },

        updateWorkflow: async (id, data) => {
          set(state => {
            const isCurrent = state.currentWorkflow?.id === id;
            // 乐观更新
            const updatedCurrent = isCurrent 
              ? { ...state.currentWorkflow, ...data } as Workflow 
              : state.currentWorkflow;
            
            return { currentWorkflow: updatedCurrent };
          });

          try {
            // 🚨 强制转换
            const workflow = await workflowService.updateWorkflow(id, data as any) as unknown as Workflow;
            
            set(state => ({
              workflows: state.workflows.map(w => w.id === id ? workflow : w),
              currentWorkflow: state.currentWorkflow?.id === id ? workflow : state.currentWorkflow,
            }));
          } catch (error) {
            set({ error: '更新工作流失败' });
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
        partialize: (state) => ({ workflows: state.workflows }),
      }
    ),
    { name: 'workflow-store' }
  )
);