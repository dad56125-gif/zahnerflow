import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface WorkflowState {
  // 草稿名称用于新工作流创建；已归档工作流名称在实验记录中修改。
  draftWorkflowName: string | null;
  setDraftWorkflowName: (name: string | null) => void;
}

export const useWorkflowStore = create<WorkflowState>()(
  devtools(
    persist(
      (set) => ({
        draftWorkflowName: null,
        setDraftWorkflowName: (name) => {
          set({ draftWorkflowName: name });
        },
      }),
      {
        name: 'workflow-storage',
        partialize: (state) => ({ draftWorkflowName: state.draftWorkflowName }),
      }
    ),
    { name: 'workflow-store' }
  )
);
