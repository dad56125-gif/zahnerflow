import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { Workflow } from '@zahnerflow/types';
import { workflowService } from '../workflowService';

// 简化的工作流状态管理
interface WorkflowState {
  currentWorkflow: Workflow | null;
  isLoading: boolean;
  error: string | null;

  // 操作方法
  setCurrentWorkflow: (workflow: Workflow | null) => void;
  updateWorkflow: (updates: Partial<Workflow>) => void;
  clearError: () => void;
}

export const useWorkflowStore = create<WorkflowState>()(
  devtools(
    (set, get) => ({
      currentWorkflow: null,
      isLoading: false,
      error: null,

      setCurrentWorkflow: (workflow) => {
        console.log('[WorkflowStore] 设置当前工作流:', workflow?.id || 'null');
        set({ currentWorkflow: workflow, error: null });
      },

      updateWorkflow: (updates) => {
        set(state => {
          if (!state.currentWorkflow) return state;

          const updatedWorkflow = { ...state.currentWorkflow, ...updates };
          console.log('[WorkflowStore] 更新工作流:', updatedWorkflow.id, updates);

          return { currentWorkflow: updatedWorkflow };
        });
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    { name: 'workflow-store' }
  )
);