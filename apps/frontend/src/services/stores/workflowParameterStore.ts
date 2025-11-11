import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

// 工作流参数管理状态
interface WorkflowParameterState {
  currentEditingWorkflowId: string | null; // 当前编辑的工作流ID（可能是临时ID）
  workflowDefaultParameters: Record<string, Record<string, any>>; // 工作流级别默认参数

  // 操作方法
  setCurrentEditingWorkflowId: (workflowId: string | null) => void;

  // 工作流默认参数管理
  getWorkflowDefaultParameters: (nodeType: string) => Record<string, any> | null;
  setWorkflowDefaultParameters: (nodeType: string, parameters: Record<string, any>) => void;
  clearWorkflowDefaultParameters: (nodeType: string) => void;
  getAllWorkflowDefaultParameters: () => Record<string, Record<string, any>>;

  // 工具方法
  generateTemporaryWorkflowId: () => string;
  isTemporaryWorkflow: (workflowId: string) => boolean;
}

// 获取存储键名
const getStorageKey = (workflowId: string): string => {
  if (workflowId.startsWith('temp_')) {
    return 'current-temp-workflow-defaults';
  }
  return `workflow-defaults-${workflowId}`;
};

// 从localStorage读取工作流默认参数
const loadWorkflowDefaults = (workflowId: string): Record<string, any> => {
  try {
    const key = getStorageKey(workflowId);
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.warn(`加载工作流 ${workflowId} 默认参数失败:`, error);
    return {};
  }
};

// 保存工作流默认参数到localStorage
const saveWorkflowDefaults = (workflowId: string, defaults: Record<string, any>): void => {
  try {
    const key = getStorageKey(workflowId);
    localStorage.setItem(key, JSON.stringify(defaults));
  } catch (error) {
    console.warn(`保存工作流 ${workflowId} 默认参数失败:`, error);
  }
};

export const useWorkflowParameterStore = create<WorkflowParameterState>()(
  devtools(
    persist(
      (set, get) => ({
        currentEditingWorkflowId: null,
        workflowDefaultParameters: {},

        setCurrentEditingWorkflowId: (workflowId) => {
          const state = get();

          // 如果有之前的工作流ID，保存其参数
          if (state.currentEditingWorkflowId && state.currentEditingWorkflowId !== workflowId) {
            saveWorkflowDefaults(
              state.currentEditingWorkflowId,
              state.workflowDefaultParameters
            );
          }

          // 加载新工作流的参数
          const newDefaults = workflowId ? loadWorkflowDefaults(workflowId) : {};

          set({
            currentEditingWorkflowId: workflowId,
            workflowDefaultParameters: newDefaults
          });
        },

        getWorkflowDefaultParameters: (nodeType) => {
          const { workflowDefaultParameters } = get();
          return workflowDefaultParameters[nodeType] || null;
        },

        setWorkflowDefaultParameters: (nodeType, parameters) => {
          const { currentEditingWorkflowId, workflowDefaultParameters } = get();

          if (!currentEditingWorkflowId) {
            console.warn('未设置当前编辑工作流，无法保存默认参数');
            return;
          }

          const newDefaults = {
            ...workflowDefaultParameters,
            [nodeType]: parameters
          };

          set({ workflowDefaultParameters: newDefaults });

          // 立即保存到localStorage
          saveWorkflowDefaults(currentEditingWorkflowId, newDefaults);
        },

        clearWorkflowDefaultParameters: (nodeType) => {
          const { currentEditingWorkflowId, workflowDefaultParameters } = get();

          if (!currentEditingWorkflowId) {
            console.warn('未设置当前编辑工作流，无法清除默认参数');
            return;
          }

          const newDefaults = { ...workflowDefaultParameters };
          delete newDefaults[nodeType];

          set({ workflowDefaultParameters: newDefaults });

          // 立即保存到localStorage
          saveWorkflowDefaults(currentEditingWorkflowId, newDefaults);
        },

        getAllWorkflowDefaultParameters: () => {
          const { workflowDefaultParameters } = get();
          return { ...workflowDefaultParameters };
        },

        generateTemporaryWorkflowId: () => {
          return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        },

        isTemporaryWorkflow: (workflowId) => {
          return workflowId.startsWith('temp_');
        },
      }),
      {
        name: 'workflow-parameter-storage',
        partialize: (state) => ({
          currentEditingWorkflowId: state.currentEditingWorkflowId,
        }),
      }
    ),
    { name: 'workflow-parameter-store' }
  )
);

// 监听页面关闭事件，确保参数被保存
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const state = useWorkflowParameterStore.getState();
    if (state.currentEditingWorkflowId && Object.keys(state.workflowDefaultParameters).length > 0) {
      saveWorkflowDefaults(state.currentEditingWorkflowId, state.workflowDefaultParameters);
    }
  });
}