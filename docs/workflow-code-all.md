# Workflow 系统完整代码清单

> 总计约 3,500 行代码
> 包含所有 Workflow 核心文件

---

## Store 状态管理

### services/stores/workflowStore.ts

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
---

### services/stores/workflowParameterStore.ts

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
---

### services/stores/executionStore.ts

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
---

## 服务层 API

### services/workflowService.ts

import { apiHelpers } from './api/zahnerApi';
import {
  Workflow,
  WorkflowDefinition,
  PaginatedResponse,
  Execution,
  ExecutionStatus
} from '@zahnerflow/types';
import { useCanvasStore, useWorkflowStore } from './stores';
import { workflowSyncUtil } from './workflowSyncUtil';

// 工作流相关API
export const workflowService = {
  // 获取工作流列表
  getWorkflows: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }): Promise<PaginatedResponse<Workflow>> => {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, String(value));
        }
      });
    }
    
    const url = `/workflows${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return apiHelpers.getPaginated<Workflow>(url);
  },

  // 获取单个工作流详情
  getWorkflow: (id: string): Promise<Workflow> => {
    return apiHelpers.get<Workflow>(`/workflows/${id}`);
  },

  // 创建工作流
  createWorkflow: (definition: WorkflowDefinition): Promise<Workflow> => {
    return apiHelpers.post<Workflow>('/workflows', definition);
  },

  // 更新工作流
  updateWorkflow: (id: string, data: {
    name?: string;
    description?: string;
    definition?: WorkflowDefinition;
    status?: string;
  }): Promise<Workflow> => {
    return apiHelpers.put<Workflow>(`/workflows/${id}`, data);
  },

  // 删除工作流
  deleteWorkflow: (id: string): Promise<void> => {
    return apiHelpers.delete<void>(`/workflows/${id}`);
  },

  // 复制工作流
  duplicateWorkflow: (id: string): Promise<Workflow> => {
    return apiHelpers.post<Workflow>(`/workflows/${id}/duplicate`);
  },

  // 验证工作流
  validateWorkflow: (definition: WorkflowDefinition): Promise<{
    isValid: boolean;
    errors: Array<{
      type: string;
      message: string;
      nodeId?: string;
    }>;
    warnings: Array<{
      type: string;
      message: string;
      nodeId?: string;
    }>;
  }> => {
    return apiHelpers.post('/workflows/validate', { definition });
  },

  // 导出工作流
  exportWorkflow: (id: string): Promise<{
    metadata: any;
    definition: WorkflowDefinition;
  }> => {
    return apiHelpers.get(`/workflows/${id}/export`);
  },

  // 导入工作流
  importWorkflow: (data: {
    metadata: any;
    definition: WorkflowDefinition;
  }): Promise<Workflow> => {
    return apiHelpers.post<Workflow>('/workflows/import', data);
  },
};

// 执行相关API
export const executionService = {
  // 执行工作流 - 先同步前端参数到后端
  executeWorkflow: async (workflowId: string, params?: {
    parameters?: Record<string, any>;
    priority?: 'low' | 'normal' | 'high';
  }): Promise<{
    executionId: string;
    status: ExecutionStatus;
    startTime: Date;
    error?: string;
    results?: any[];
  }> => {
    // 1. 获取前端当前的工作流状态
    const { nodes } = useCanvasStore.getState();
    const { currentWorkflow } = useWorkflowStore.getState();

    // 2. 如果是当前正在编辑的工作流，先同步参数到后端
    if (currentWorkflow && currentWorkflow.id === workflowId) {
      try {
        console.log('[executionService] 正在同步前端参数到后端工作流...');

        // 构建更新的工作流定义
        const updatedDefinition: WorkflowDefinition = {
          id: workflowId,
          name: currentWorkflow.name,
          description: currentWorkflow.description || '',
          ownerName: currentWorkflow.ownerName,
          individualName: currentWorkflow.individualName,
          nodes: nodes.map(node => ({
            id: node.id,
            type: node.type,
            name: node.name,
            position: node.position,
            data: node.data,
            // 移除config字段，只使用data.parameters
            input: node.input,
            output: node.output,
            status: node.status || 'ready'
          })),
          // 移除edges字段，不再使用
          version: 1.0 // 使用固定版本号
        };

        // 同步到后端
        await workflowService.updateWorkflow(workflowId, {
          definition: updatedDefinition
        });

        console.log('[executionService] 前端参数已同步到后端工作流');
      } catch (error) {
        console.error('[executionService] 同步前端参数失败:', error);
        // 同步失败不影响执行，但给出警告
        console.warn('[executionService] 将使用后端存储的工作流定义执行，可能包含过时参数');
      }
    }

    // 3. 执行工作流
    return apiHelpers.post(`/executions`, { workflowId, ...params });
  },

  // 获取执行状态
  getExecutionStatus: (executionId: string): Promise<{
    executionId: string;
    workflowId: string;
    status: ExecutionStatus;
    currentNode: string;
    completedNodes: string[];
    nodeResults?: Map<string, any>;
    error?: string;
    startTime: Date;
    endTime?: Date;
    progress: number;
  }> => {
    return apiHelpers.get(`/executions/${executionId}`);
  },

  // 暂停执行
  pauseExecution: (executionId: string): Promise<{ message: string }> => {
    return apiHelpers.put<{ message: string }>(`/executions/${executionId}/pause`);
  },

  // 恢复执行
  resumeExecution: (executionId: string): Promise<{ message: string }> => {
    return apiHelpers.put<{ message: string }>(`/executions/${executionId}/resume`);
  },

  // 停止执行
  stopExecution: (executionId: string): Promise<{ message: string }> => {
    return apiHelpers.delete<{ message: string }>(`/executions/${executionId}`);
  },

  // 获取执行历史
  getExecutionHistory: (params?: {
    page?: number;
    limit?: number;
    workflowId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<PaginatedResponse<Execution>> => {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, String(value));
        }
      });
    }
    
    const url = `/execution/history${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return apiHelpers.getPaginated<Execution>(url);
  },

  // 获取执行结果
  getExecutionResults: (executionId: string): Promise<Record<string, any>> => {
    return apiHelpers.get(`/execution/${executionId}/results`);
  },

  // 清理执行记录
  cleanupExecutions: (olderThanDays: number): Promise<void> => {
    return apiHelpers.post<void>('/execution/cleanup', { olderThanDays });
  },
};

// 工作流模板API
export const templateService = {
  // 获取模板列表
  getTemplates: (category?: string): Promise<Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    tags: string[];
    author: string;
    createdAt: string;
  }>> => {
    const url = `/templates${category ? `?category=${category}` : ''}`;
    return apiHelpers.get(url);
  },

  // 获取模板详情
  getTemplate: (id: string): Promise<{
    id: string;
    name: string;
    description: string;
    category: string;
    definition: WorkflowDefinition;
    tags: string[];
    author: string;
    createdAt: string;
  }> => {
    return apiHelpers.get(`/templates/${id}`);
  },

  // 从模板创建工作流
  createFromTemplate: (templateId: string, name: string): Promise<Workflow> => {
    return apiHelpers.post<Workflow>(`/templates/${templateId}/create`, { name });
  },
};

export default {
  workflow: workflowService,
  execution: executionService,
  template: templateService,
};

---

### services/workflowExecutionService.ts

import { apiHelpers } from './api/zahnerApi';
import { useCanvasStore, useWorkflowStore } from './stores';
import { workflowService } from './workflowService';

/**
 * 工作流执行服务 - 带参数同步功能
 *
 * 使用说明：
 * 1. 使用此服务替代原有的 executionService.executeWorkflow
 * 2. 执行前会自动将前端最新的节点参数同步到后端
 * 3. 确保工作流运行时使用的是用户配置的最新参数
 */
export const workflowExecutionService = {
  /**
   * 执行工作流 - 自动同步前端参数到后端
   *
   * @param workflowId 要执行的工作流ID
   * @param params 执行参数（可选）
   * @returns Promise<{executionId: string, status: string, startTime: Date}>
   */
  executeWorkflow: async (workflowId: string, params?: {
    parameters?: Record<string, any>;
    priority?: 'low' | 'normal' | 'high';
  }) => {
    console.log('[WorkflowExecutionService] 开始执行工作流:', workflowId);

    // 1. 获取前端当前的工作流状态
    const canvasState = useCanvasStore.getState();
    const workflowState = useWorkflowStore.getState();
    const { nodes, connections } = canvasState;
    const { currentWorkflow } = workflowState;

    // 2. 检查是否需要同步前端参数到后端
    if (currentWorkflow && currentWorkflow.id === workflowId) {
      try {
        console.log('[WorkflowExecutionService] 检测到当前工作流，正在同步前端参数到后端...');

        // 构建符合后端API要求的工作流定义
        const workflowDefinition = {
          id: workflowId,
          name: currentWorkflow.name || '未命名工作流',
          description: currentWorkflow.description || '',
          ownerName: currentWorkflow.ownerName || '默认用户',
          individualName: currentWorkflow.individualName || '默认项目',
          nodes: nodes.map(node => {
            // 确保参数正确映射到 config 字段
            const nodeConfig = (node as any).config || (node.data && node.data.parameters) || {};

            return {
              id: node.id,
              type: node.type,
              name: node.name,
              position: node.position,
              // 保持数据兼容性
              data: {
                ...node.data,
                parameters: nodeConfig
              },
              // 优先使用 config 字段存储参数（供后端执行服务使用）
              config: nodeConfig,
              input: {
                id: `${node.id}_input`,
                name: 'Input',
                dataType: 'flow'
              },
              output: {
                id: `${node.id}_output`,
                name: 'Output',
                dataType: 'flow'
              }
            };
          }),
          edges: [], // 不再使用edges，使用空数组
          version: 1.0 // 使用固定版本号
        };

        // 同步到后端
        await workflowService.updateWorkflow(workflowId, {
          definition: workflowDefinition
        });

        console.log('[WorkflowExecutionService] 前端参数已成功同步到后端工作流');
        console.log(`[WorkflowExecutionService] 同步了 ${nodes.length} 个节点和 ${connections.length} 个连接`);

      } catch (error) {
        console.error('[WorkflowExecutionService] 同步前端参数失败:', error);
        console.warn('[WorkflowExecutionService] 将使用后端存储的工作流定义执行，可能包含过期参数');
        // 同步失败不影响执行，继续执行流程
      }
    } else {
      console.log('[WorkflowExecutionService] 不是当前编辑的工作流，跳过参数同步');
    }

    // 3. 执行工作流
    console.log('[WorkflowExecutionService] 开始执行工作流...');
    const response = await apiHelpers.post('/executions', { workflowId, ...params });

    console.log('[WorkflowExecutionService] 工作流执行已启动:', response);
    return response;
  },

  /**
   * 获取执行状态
   */
  getExecutionStatus: (executionId: string) => {
    return apiHelpers.get(`/executions/${executionId}`);
  },

  /**
   * 暂停执行
   */
  pauseExecution: (executionId: string) => {
    return apiHelpers.put(`/executions/${executionId}/pause`);
  },

  /**
   * 恢复执行
   */
  resumeExecution: (executionId: string) => {
    return apiHelpers.put(`/executions/${executionId}/resume`);
  },

  /**
   * 停止执行
   */
  stopExecution: (executionId: string) => {
    return apiHelpers.delete(`/executions/${executionId}`);
  },

  /**
   * 检查工作流是否需要同步
   */
  needsSync: (workflowId: string): boolean => {
    const { currentWorkflow } = useWorkflowStore.getState();
    const { nodes } = useCanvasStore.getState();

    // 如果不是当前工作流，不需要同步
    if (!currentWorkflow || currentWorkflow.id !== workflowId) {
      return false;
    }

    // 检查是否有参数配置需要同步
    const hasConfiguredNodes = nodes.some(node => {
      const hasConfig = (node as any).config && Object.keys((node as any).config).length > 0;
      const hasParameters = node.data && node.data.parameters && Object.keys(node.data.parameters).length > 0;
      return hasConfig || hasParameters;
    });

    return hasConfiguredNodes;
  },

  /**
   * 获取同步状态信息
   */
  getSyncStatus: (workflowId: string) => {
    const { currentWorkflow } = useWorkflowStore.getState();
    const { nodes, connections } = useCanvasStore.getState();

    return {
      isCurrentWorkflow: currentWorkflow?.id === workflowId,
      nodeCount: nodes.length,
      connectionCount: connections.length,
      configuredNodes: nodes.filter(node => {
        // 检查节点是否有配置参数（新版本只使用data.parameters）
        const hasParameters = node.data && node.data.parameters && Object.keys(node.data.parameters).length > 0;
        return hasParameters;
      }).length,
      workflowVersion: 1.0, // 使用固定版本号
      lastUpdated: currentWorkflow?.updatedAt ? new Date(currentWorkflow.updatedAt) : null
    };
  }
};

export default workflowExecutionService;
---

### services/workflowSyncUtil.ts

import { useCanvasStore } from './stores';
import { useWorkflowStore } from './stores';
import { workflowService } from './workflowService';
import type { WorkflowDefinition } from '@zahnerflow/types';

/**
 * 工作流同步工具
 * 用于在执行工作流前，将前端当前的节点参数同步到后端
 */
export const workflowSyncUtil = {
  /**
   * 同步前端当前工作流状态到后端
   * @param workflowId 要同步的工作流ID
   * @returns Promise<boolean> 同步是否成功
   */
  syncCurrentWorkflowToBackend: async (workflowId: string): Promise<boolean> => {
    try {
      console.log('[WorkflowSync] 开始同步前端参数到后端工作流...');

      // 1. 获取前端当前的工作流状态
      const { nodes, connections } = useCanvasStore.getState();
      const { currentWorkflow } = useWorkflowStore.getState();

      if (!currentWorkflow || currentWorkflow.id !== workflowId) {
        console.warn('[WorkflowSync] 当前工作流不匹配，跳过同步');
        return false;
      }

      // 2. 构建更新的工作流定义
      const updatedDefinition: WorkflowDefinition = {
        id: workflowId,
        name: currentWorkflow.name,
        description: currentWorkflow.description || '',
        ownerName: currentWorkflow.ownerName,
        individualName: currentWorkflow.individualName,
        nodes: nodes.map(node => {
          // 直接使用 data.parameters，不再依赖config字段
          const parameters = node.data?.parameters || {};

          return {
            id: node.id,
            type: node.type,
            name: node.name,
            position: node.position,
            data: {
              ...node.data,
              parameters: parameters
            },
            input: node.input,
            output: node.output,
            status: node.status || 'ready'
          };
        }),
        // 移除edges字段，不再使用
        version: 1.0 // 使用固定版本号
      };

      // 3. 同步到后端
      await workflowService.updateWorkflow(workflowId, {
        definition: updatedDefinition
      });

      console.log('[WorkflowSync] 前端参数已同步到后端工作流');
      console.log(`[WorkflowSync] 同步了 ${nodes.length} 个节点`);

      return true;
    } catch (error) {
      console.error('[WorkflowSync] 同步前端参数失败:', error);
      return false;
    }
  },

  /**
   * 检查是否需要同步
   * @param workflowId 工作流ID
   * @returns boolean 是否需要同步
   */
  needsSync: (workflowId: string): boolean => {
    const { currentWorkflow } = useWorkflowStore.getState();
    const { nodes } = useCanvasStore.getState();

    // 如果没有当前工作流或不匹配，不需要同步
    if (!currentWorkflow || currentWorkflow.id !== workflowId) {
      return false;
    }

    // 检查是否有未保存的参数修改
    const hasUnsavedChanges = nodes.some(node => {
      const nodeConfig = node.data?.parameters || {};
      const hasConfig = Object.keys(nodeConfig).length > 0;
      return hasConfig; // 简化版：如果节点有参数配置，就认为需要同步
    });

    return hasUnsavedChanges;
  },

  /**
   * 获取工作流同步状态信息
   * @param workflowId 工作流ID
   * @returns object 同步状态信息
   */
  getSyncStatus: (workflowId: string) => {
    const { currentWorkflow } = useWorkflowStore.getState();
    const { nodes } = useCanvasStore.getState();

    return {
      canSync: currentWorkflow?.id === workflowId,
      nodeCount: nodes.length,
      connectionCount: 0, // 不再使用connections，固定为0
      nodesWithConfig: nodes.filter(node => {
        const config = node.data?.parameters || {};
        return Object.keys(config).length > 0;
      }).length,
      lastSyncTime: currentWorkflow?.updatedAt ? new Date(currentWorkflow.updatedAt) : null,
      workflowVersion: 1.0 // 使用固定版本号
    };
  }
};

export default workflowSyncUtil;
---

## 核心管理器

### components/features/workflow/WorkflowManager.ts

/**
 * 工作流管理器
 *
 * 负责工作流的导出、导入、保存和加载功能
 * 支持工作流的版本控制和配置管理
 */

import { ElectrochemicalNode, NodeType, NodeCategory } from '@/types/nodes';
import type { SimpleLoopInfo } from '../../../canvas/useSimpleLoopDetection';

// 工作流数据接口
export interface WorkflowData {
  version: string;
  metadata: WorkflowMetadata;
  nodes: ElectrochemicalNode[];
  connections: Array<{
    id: string;
    sourceId: string;
    targetId: string;
  }>;
  loops: SimpleLoopInfo[];
  settings: WorkflowSettings;
  timestamp: number;
}

// 工作流元数据接口
export interface WorkflowMetadata {
  name: string;
  description?: string;
  author?: string;
  tags?: string[];
  category?: string;
  created_at: number;
  updated_at: number;
}

// 工作流设置接口
export interface WorkflowSettings {
  canvasSettings: {
    zoomLevel: number;
    canvasSize: {
      width: number;
      height: number;
    };
  };
  executionSettings: {
    autoStart: boolean;
    parallelExecution: boolean;
    errorHandling: 'stop' | 'continue' | 'retry';
    maxRetries: number;
  };
  dataSettings: {
    autoSave: boolean;
    saveInterval: number;
    exportFormat: 'json' | 'csv' | 'xlsx';
  };
}

// 工作流导出选项接口
export interface WorkflowExportOptions {
  includeMetadata?: boolean;
  includeSettings?: boolean;
  includeData?: boolean;
  format?: 'json' | 'csv' | 'xlsx';
  prettyPrint?: boolean;
}

// 工作流导入选项接口
export interface WorkflowImportOptions {
  validateStructure?: boolean;
  mergeWithExisting?: boolean;
  preserveIds?: boolean;
  upgradeVersion?: boolean;
}

// 工作流验证结果接口
export interface WorkflowValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

/**
 * 工作流管理器类
 */
export class WorkflowManager {
  private static readonly CURRENT_VERSION = '2.0.0';
  private static readonly SUPPORTED_VERSIONS = ['1.0.0', '1.1.0', '2.0.0'];

  /**
   * 导出工作流
   */
  public static async exportWorkflow(
    nodes: ElectrochemicalNode[],
    connections: Array<{ id: string; sourceId: string; targetId: string }>,
    loops: SimpleLoopInfo[],
    metadata: WorkflowMetadata,
    settings: WorkflowSettings,
    options: WorkflowExportOptions = {}
  ): Promise<{ data: string; filename: string }> {
    const {
      includeMetadata = true,
      includeSettings = true,
      includeData = false,
      format = 'json',
      prettyPrint = true
    } = options;

    // 构建工作流数据
    const workflowData: WorkflowData = {
      version: this.CURRENT_VERSION,
      metadata: includeMetadata ? {
        ...metadata,
        updated_at: Date.now()
      } : this.getDefaultMetadata(),
      nodes,
      connections,
      loops,
      settings: includeSettings ? settings : this.getDefaultSettings(),
      timestamp: Date.now()
    };

    let data: string;
    let filename: string;

    switch (format) {
      case 'json':
        data = JSON.stringify(workflowData, null, prettyPrint ? 2 : 0);
        filename = `${this.sanitizeFilename(metadata.name || 'workflow')}_${new Date().toISOString().split('T')[0]}.json`;
        break;

      case 'csv':
        data = this.convertToCSV(workflowData, includeData);
        filename = `${this.sanitizeFilename(metadata.name || 'workflow')}_${new Date().toISOString().split('T')[0]}.csv`;
        break;

      case 'xlsx':
        // 注意：这里需要实现 XLSX 导出功能
        throw new Error('XLSX 导出功能尚未实现，请使用 JSON 或 CSV 格式');

      default:
        throw new Error(`不支持的导出格式: ${format}`);
    }

    return { data, filename };
  }

  /**
   * 导入工作流
   */
  public static async importWorkflow(
    data: string,
    format: 'json' | 'csv' = 'json',
    options: WorkflowImportOptions = {}
  ): Promise<{
    workflow: WorkflowData;
    validation: WorkflowValidationResult;
  }> {
    const {
      validateStructure = true,
      mergeWithExisting = false,
      preserveIds = false,
      upgradeVersion = true
    } = options;

    let workflowData: WorkflowData;

    try {
      switch (format) {
        case 'json':
          workflowData = JSON.parse(data);
          break;

        case 'csv':
          workflowData = this.parseFromCSV(data);
          break;

        default:
          throw new Error(`不支持的导入格式: ${format}`);
      }

      // 验证工作流数据
      const validation = validateStructure
        ? this.validateWorkflow(workflowData)
        : this.createEmptyValidation();

      if (!validation.isValid && !mergeWithExisting) {
        throw new Error(`工作流验证失败: ${validation.errors.join(', ')}`);
      }

      // 版本升级
      if (upgradeVersion && workflowData.version !== this.CURRENT_VERSION) {
        workflowData = this.upgradeWorkflowVersion(workflowData);
      }

      // ID处理
      if (!preserveIds) {
        workflowData = this.regenerateIds(workflowData);
      }

      return {
        workflow: workflowData,
        validation
      };

    } catch (error) {
      throw new Error(`导入工作流失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 验证工作流数据
   */
  public static validateWorkflow(workflow: Partial<WorkflowData>): WorkflowValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // 版本检查
    if (!workflow.version) {
      errors.push('缺少工作流版本信息');
    } else if (!this.SUPPORTED_VERSIONS.includes(workflow.version)) {
      warnings.push(`工作流版本 ${workflow.version} 可能不完全兼容，建议升级到 ${this.CURRENT_VERSION}`);
    }

    // 节点验证
    if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
      errors.push('工作流缺少有效的节点数据');
    } else {
      // 定义当前支持的节点类型
      const supportedNodeTypes: NodeType[] = [
        'startup', 'shutdown', 'change_temperature', 'change_gas_flow',
        'eis_potentiostatic', 'eis_galvanostatic', 'ocp_measurement',
        'chronoamperometry', 'chronopotentiometry', 'voltage_ramp',
        'current_ramp', 'lsv_measurement', 'loop_start', 'loop_end', 'wait_delay'
      ];

      workflow.nodes.forEach((node, index) => {
        if (!node.id) {
          errors.push(`节点 ${index} 缺少 ID`);
        }
        if (!node.type) {
          errors.push(`节点 ${node.id || index} 缺少类型`);
        } else {
          // 检查节点类型是否受支持
          if (!supportedNodeTypes.includes(node.type)) {
            warnings.push(`节点 ${node.id} 使用了未知类型 "${node.type}"，将使用默认配置显示`);
          }
        }
        if (!node.position || typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
          errors.push(`节点 ${node.id || index} 位置信息无效`);
        }

        // 检查节点数据结构
        if (node.data && node.data.parameters) {
          // 检查是否有废弃的参数字段
          if ('loop_id' in node.data.parameters) {
            warnings.push(`节点 ${node.id} 包含废弃的 loop_id 参数，将被忽略`);
          }
        }
      });
    }

    // 连接验证
    if (!workflow.connections || !Array.isArray(workflow.connections)) {
      warnings.push('工作流缺少连接数据');
    } else {
      workflow.connections.forEach((connection, index) => {
        if (!connection.sourceId || !connection.targetId) {
          errors.push(`连接 ${index} 缺少源节点或目标节点 ID`);
        }

        // 检查连接的节点是否存在
        if (workflow.nodes) {
          const sourceExists = workflow.nodes.some(node => node.id === connection.sourceId);
          const targetExists = workflow.nodes.some(node => node.id === connection.targetId);

          if (!sourceExists) {
            errors.push(`连接 ${index} 的源节点 ${connection.sourceId} 不存在`);
          }
          if (!targetExists) {
            errors.push(`连接 ${index} 的目标节点 ${connection.targetId} 不存在`);
          }
        }
      });
    }

    // 循环验证
    if (workflow.loops && Array.isArray(workflow.loops)) {
      workflow.loops.forEach((loop, index) => {
        if (!loop.id) {
          errors.push(`循环 ${index} 缺少 ID`);
        }
        if (!loop.startNodeId || !loop.endNodeId) {
          errors.push(`循环 ${loop.id || index} 缺少开始或结束节点`);
        }
        if (!loop.nodeIds || !Array.isArray(loop.nodeIds)) {
          errors.push(`循环 ${loop.id || index} 节点列表无效`);
        }
      });
    }

    // 元数据验证
    if (!workflow.metadata) {
      warnings.push('工作流缺少元数据信息');
    } else {
      if (!workflow.metadata.name) {
        warnings.push('工作流缺少名称');
      }
    }

    // 设置验证
    if (!workflow.settings) {
      suggestions.push('建议添加工作流设置以获得更好的体验');
    }

    // 性能建议
    if (workflow.nodes && workflow.nodes.length > 50) {
      suggestions.push('工作流包含较多节点，建议考虑分组或模块化以提高性能');
    }

    if (workflow.connections && workflow.connections.length > 100) {
      suggestions.push('工作流包含较多连接，建议检查是否存在冗余连接');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * 转换为CSV格式
   */
  private static convertToCSV(workflow: WorkflowData, includeData: boolean = false): string {
    const csvLines: string[] = [];

    // 添加元数据
    csvLines.push('# 工作流元数据');
    csvLines.push(`名称,${workflow.metadata.name || ''}`);
    csvLines.push(`描述,${workflow.metadata.description || ''}`);
    csvLines.push(`版本,${workflow.version}`);
    csvLines.push(`创建时间,${new Date(workflow.timestamp).toISOString()}`);
    csvLines.push('');

    // 添加节点信息
    csvLines.push('# 节点信息');
    csvLines.push('ID,名称,类型,X坐标,Y坐标,宽度,高度,状态');
    workflow.nodes.forEach(node => {
      csvLines.push([
        node.id,
        node.name,
        node.type,
        node.position.x,
        node.position.y,
        node.style.width || 140,
        node.style.height || 60,
        node.status || 'ready'
      ].join(','));
    });
    csvLines.push('');

    // 添加连接信息
    csvLines.push('# 连接信息');
    csvLines.push('ID,源节点,目标节点');
    workflow.connections.forEach(connection => {
      csvLines.push([connection.id, connection.sourceId, connection.targetId].join(','));
    });
    csvLines.push('');

    // 添加循环信息
    if (workflow.loops.length > 0) {
      csvLines.push('# 循环信息');
      csvLines.push('ID,开始节点,结束节点,迭代次数,包含节点');
      workflow.loops.forEach(loop => {
        csvLines.push([
          loop.id,
          loop.startNodeId,
          loop.endNodeId,
          loop.iterationCount,
          loop.nodeIds.join(';')
        ].join(','));
      });
    }

    return csvLines.join('\n');
  }

  /**
   * 创建工作流配置
   */
  public static createWorkflowConfig(
    name: string,
    nodes: ElectrochemicalNode[],
    connections: Array<{ id: string; sourceId: string; targetId: string }>,
    loops: SimpleLoopInfo[]
  ): WorkflowData {
    return {
      version: this.CURRENT_VERSION,
      metadata: {
        name,
        description: '',
        created_at: Date.now(),
        updated_at: Date.now()
      },
      nodes,
      connections,
      loops,
      settings: this.getDefaultSettings(),
      timestamp: Date.now()
    };
  }

  /**
   * 验证工作流配置
   */
  public static validateWorkflowConfig(config: Partial<WorkflowData>): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.metadata?.name) {
      errors.push('工作流名称不能为空');
    }

    if (!config.nodes || config.nodes.length === 0) {
      errors.push('工作流必须包含至少一个节点');
    }

    if (config.connections && config.connections.length > 0) {
      config.connections.forEach((conn, index) => {
        if (!conn.sourceId || !conn.targetId) {
          errors.push(`连接 ${index + 1} 缺少源节点或目标节点`);
        }
      });
    }

    if (config.loops && config.loops.length > 0) {
      config.loops.forEach((loop, index) => {
        if (!loop.startNodeId || !loop.endNodeId) {
          errors.push(`循环 ${index + 1} 缺少开始或结束节点`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 从CSV解析工作流
   */
  private static parseFromCSV(csvData: string): WorkflowData {
    // 这是一个简化的CSV解析实现
    // 在实际项目中，建议使用专门的CSV解析库
    const lines = csvData.split('\n');
    const workflow: Partial<WorkflowData> = {
      version: '2.0.0',
      nodes: [],
      connections: [],
      loops: [],
      metadata: this.getDefaultMetadata(),
      settings: this.getDefaultSettings(),
      timestamp: Date.now()
    };

    let currentSection = '';
    let metadata: Partial<WorkflowMetadata> = {};

    for (const line of lines) {
      const trimmedLine = line.trim();

      // 跳过空行和注释
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        if (trimmedLine.includes('元数据')) currentSection = 'metadata';
        else if (trimmedLine.includes('节点')) currentSection = 'nodes';
        else if (trimmedLine.includes('连接')) currentSection = 'connections';
        else if (trimmedLine.includes('循环')) currentSection = 'loops';
        continue;
      }

      const [key, value] = trimmedLine.split(',').map(s => s.trim());

      switch (currentSection) {
        case 'metadata':
          if (key === '名称') metadata.name = value;
          else if (key === '描述') metadata.description = value;
          break;

        case 'nodes':
          if (key !== 'ID' && workflow.nodes) {
            const node: ElectrochemicalNode = {
              id: key,
              name: value,
              type: (lines[lines.indexOf(line) + 1]?.split(',')[2]?.trim() || 'unknown') as NodeType,
              category: 'basic_measurement', // 添加必需的category字段
              position: {
                x: parseFloat(lines[lines.indexOf(line) + 1]?.split(',')[3] || '0'),
                y: parseFloat(lines[lines.indexOf(line) + 1]?.split(',')[4] || '0')
              },
              style: {
                width: parseFloat(lines[lines.indexOf(line) + 1]?.split(',')[5] || '140'),
                height: parseFloat(lines[lines.indexOf(line) + 1]?.split(',')[6] || '60')
              },
              status: (lines[lines.indexOf(line) + 1]?.split(',')[7]?.trim() || 'ready') as any,
              data: {
                name: value,
                description: `Imported node: ${key}`,
                parameters: {},
                createdAt: new Date(),
                updatedAt: new Date()
              },
              input: { // 添加必需的input字段
                id: `${key}_input`,
                name: 'Input',
                dataType: 'flow' as const
              },
              output: { // 添加必需的output字段
                id: `${key}_output`,
                name: 'Output',
                dataType: 'flow' as const
              }
            };
            workflow.nodes.push(node);
          }
          break;

        case 'connections':
          if (key !== 'ID' && workflow.connections) {
            workflow.connections.push({
              id: key,
              sourceId: value,
              targetId: lines[lines.indexOf(line) + 1]?.split(',')[2]?.trim() || ''
            });
          }
          break;

        case 'loops':
          if (key !== 'ID' && workflow.loops) {
            const parts = trimmedLine.split(',');
            workflow.loops.push({
              id: key,
              startNodeId: value,
              endNodeId: parts[2]?.trim() || '',
              nodeIds: parts[4]?.trim().split(';').filter(Boolean) || [],
              iterationCount: parseInt(parts[3] || '1'),
              level: 0
            });
          }
          break;
      }
    }

    if (metadata.name || metadata.description) {
      workflow.metadata = {
        name: metadata?.name || 'Imported Workflow',
        description: metadata?.description || '',
        author: metadata?.author || '',
        tags: metadata?.tags || [],
        category: metadata?.category || '',
        created_at: Date.now(),
        updated_at: Date.now()
      };
    }

    return workflow as WorkflowData;
  }

  /**
   * 升级工作流版本
   */
  private static upgradeWorkflowVersion(workflow: WorkflowData): WorkflowData {
    let upgradedWorkflow = { ...workflow };

    // 根据版本进行升级
    switch (workflow.version) {
      case '1.0.0':
        // 1.0.0 -> 1.1.0: 添加循环支持
        upgradedWorkflow.loops = upgradedWorkflow.loops || [];
        upgradedWorkflow.version = '1.1.0';
        break;

      case '1.1.0':
        // 1.1.0 -> 2.0.0: 添加新的设置和元数据
        upgradedWorkflow.settings = {
          ...this.getDefaultSettings(),
          ...upgradedWorkflow.settings
        };
        upgradedWorkflow.metadata = {
          ...this.getDefaultMetadata(),
          ...upgradedWorkflow.metadata,
          updated_at: Date.now()
        };
        upgradedWorkflow.version = '2.0.0';
        break;
    }

    return upgradedWorkflow;
  }

  /**
   * 重新生成ID
   */
  private static regenerateIds(workflow: WorkflowData): WorkflowData {
    const idMap = new Map<string, string>();

    // 生成新的节点ID
    const newNodes = workflow.nodes.map(node => {
      const newId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      idMap.set(node.id, newId);
      return {
        ...node,
        id: newId
      };
    });

    // 更新连接中的节点ID
    const newConnections = workflow.connections.map(connection => ({
      ...connection,
      id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sourceId: idMap.get(connection.sourceId) || connection.sourceId,
      targetId: idMap.get(connection.targetId) || connection.targetId
    }));

    // 更新循环中的节点ID
    const newLoops = workflow.loops.map(loop => ({
      ...loop,
      startNodeId: idMap.get(loop.startNodeId) || loop.startNodeId,
      endNodeId: idMap.get(loop.endNodeId) || loop.endNodeId,
      nodeIds: loop.nodeIds.map(nodeId => idMap.get(nodeId) || nodeId)
    }));

    return {
      ...workflow,
      nodes: newNodes,
      connections: newConnections,
      loops: newLoops
    };
  }

  /**
   * 获取默认元数据
   */
  private static getDefaultMetadata(): WorkflowMetadata {
    return {
      name: '未命名工作流',
      description: '',
      created_at: Date.now(),
      updated_at: Date.now()
    };
  }

  /**
   * 获取默认设置
   */
  private static getDefaultSettings(): WorkflowSettings {
    return {
      canvasSettings: {
        zoomLevel: 1.0,
        canvasSize: {
          width: 1200,
          height: 800
        }
      },
      executionSettings: {
        autoStart: false,
        parallelExecution: false,
        errorHandling: 'stop',
        maxRetries: 3
      },
      dataSettings: {
        autoSave: true,
        saveInterval: 300000, // 5分钟
        exportFormat: 'json'
      }
    };
  }

  /**
   * 创建空的验证结果
   */
  private static createEmptyValidation(): WorkflowValidationResult {
    return {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: []
    };
  }

  /**
   * 清理文件名
   */
  private static sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^\w\s-]/g, '') // 移除特殊字符
      .replace(/\s+/g, '_') // 空格替换为下划线
      .substring(0, 50); // 限制长度
  }

  /**
   * 创建工作流模板
   */
  public static createWorkflowTemplate(
    name: string,
    description: string,
    nodeTypes: string[]
  ): WorkflowData {
    const templateNodes: ElectrochemicalNode[] = nodeTypes.map((type, index) => ({
      id: `template_node_${index}`,
      name: `模板节点 ${index + 1}`,
      type: type as any,
      category: 'basic_measurement', // 添加必需的category字段
      position: { x: 100 + index * 200, y: 100 },
      style: { width: 140, height: 60 },
      status: 'ready' as any,
      data: { // 修复NodeData接口
        name: `模板节点 ${index + 1}`,
        description: `Template node: ${type}`,
        parameters: {},
        createdAt: new Date(),
        updatedAt: new Date()
      },
      input: { // 添加必需的input字段
        id: `template_node_${index}_input`,
        name: 'Input',
        dataType: 'flow' as const
      },
      output: { // 添加必需的output字段
        id: `template_node_${index}_output`,
        name: 'Output',
        dataType: 'flow' as const
      }
    }));

    return {
      version: this.CURRENT_VERSION,
      metadata: {
        name,
        description,
        created_at: Date.now(),
        updated_at: Date.now(),
        tags: ['template'],
        category: 'template'
      },
      nodes: templateNodes,
      connections: [],
      loops: [],
      settings: this.getDefaultSettings(),
      timestamp: Date.now()
    };
  }

  /**
   * 比较工作流差异
   */
  public static compareWorkflows(
    workflow1: WorkflowData,
    workflow2: WorkflowData
  ): {
    added: ElectrochemicalNode[];
    removed: ElectrochemicalNode[];
    modified: Array<{ old: ElectrochemicalNode; new: ElectrochemicalNode }>;
  } {
    const added: ElectrochemicalNode[] = [];
    const removed: ElectrochemicalNode[] = [];
    const modified: Array<{ old: ElectrochemicalNode; new: ElectrochemicalNode }> = [];

    const nodes1Map = new Map(workflow1.nodes.map(node => [node.id, node]));
    const nodes2Map = new Map(workflow2.nodes.map(node => [node.id, node]));

    // 查找新增的节点
    for (const [id, node] of nodes2Map) {
      if (!nodes1Map.has(id)) {
        added.push(node);
      }
    }

    // 查找删除的节点
    for (const [id, node] of nodes1Map) {
      if (!nodes2Map.has(id)) {
        removed.push(node);
      }
    }

    // 查找修改的节点
    for (const [id, node2] of nodes2Map) {
      const node1 = nodes1Map.get(id);
      if (node1 && JSON.stringify(node1) !== JSON.stringify(node2)) {
        modified.push({ old: node1, new: node2 });
      }
    }

    return { added, removed, modified };
  }
}

export default WorkflowManager;
---

### components/features/workflow/WorkflowManagerUI.tsx

/**
 * 工作流管理UI组件
 *
 * 提供工作流的导出、导入和管理功能
 * 集成工作流模板、历史记录和配置管理
 */

import React, { useState, useRef, useEffect } from 'react';
import { ElectrochemicalNode } from '@/types/nodes';
import { useCanvasStore } from '@/canvas/canvasStore';
import { useWorkflowStore } from '@/services/stores';
import { useWorkflowParameterStore } from '@/services/stores';
import { useSimpleLoopDetection } from '../../../canvas/useSimpleLoopDetection';
import WorkflowManager, { type WorkflowData, type WorkflowMetadata } from './WorkflowManager';
import { useOnClickOutside } from '@/services/hooks/useOnClickOutside';
import { api } from '@/services/api';
import { useUser } from '@/contexts/UserContext';
import Portal from '@/components/Portal';

// 工作流管理UI属性接口
export interface WorkflowManagerUIProps {
  className?: string;
  style?: React.CSSProperties;
  onClose?: () => void;
}

// 工作流历史记录接口
interface WorkflowHistory {
  id: string;
  name: string;
  filename: string;
  filepath: string;
  project_name: string;
  created_at: string;
  file_size?: number;
  node_count?: number;
  connection_count?: number;
  loop_count?: number;
}

/**
 * 工作流管理UI组件
 */
export const WorkflowManagerUI: React.FC<WorkflowManagerUIProps> = ({
  className = '',
  style = {},
  onClose
}) => {
  const {
    nodes,
    connections,
    setNodes,
    setConnections
  } = useCanvasStore();

  const { setCurrentWorkflow } = useWorkflowStore();
  const { setCurrentEditingWorkflowId } = useWorkflowParameterStore();

  const { currentUser } = useUser();
  const [activeTab, setActiveTab] = useState<'templates' | 'history'>('history');
  const [workflowHistory, setWorkflowHistory] = useState<WorkflowHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [projects, setProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [isProjectDropdownHiding, setIsProjectDropdownHiding] = useState(false);
  const [projectDropdownPosition, setProjectDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const projectDropdownButtonRef = useRef<HTMLButtonElement>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  const [templates] = useState<WorkflowData[]>([
    WorkflowManager.createWorkflowTemplate(
      '基础电化学测试',
      '包含开路电位和计时安培法的基础测试流程',
      ['ocp_measurement', 'chronoamperometry']
    ),
    WorkflowManager.createWorkflowTemplate(
      '循环伏安测试',
      '标准的循环伏安法测试流程',
      ['ocp_measurement', 'cv_measurement', 'eis_potentiostatic']
    ),
    WorkflowManager.createWorkflowTemplate(
      '阻抗谱分析',
      '电化学阻抗谱分析流程',
      ['ocp_measurement', 'eis_potentiostatic']
    )
  ]);

  // 检测循环（使用简化版Hook）
  const detectedLoops = useSimpleLoopDetection(nodes);

  // 使用useOnClickOutside Hook实现点击外部关闭
  useOnClickOutside(panelRef, () => {
    if (onClose) {
      onClose();
    }
  });

  // 项目下拉菜单点击外部关闭处理
  useEffect(() => {
    if (!isProjectDropdownOpen && !isProjectDropdownHiding) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;

      // 如果点击在按钮上，不关闭
      if (projectDropdownButtonRef.current?.contains(target)) return;

      // 如果点击在下拉菜单上，不关闭
      if (projectDropdownRef.current?.contains(target)) return;

      // 点击在其他地方，开始关闭动画
      setIsProjectDropdownHiding(true);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isProjectDropdownOpen, isProjectDropdownHiding]);

  // 处理项目下拉菜单动画结束事件
  useEffect(() => {
    if (!isProjectDropdownHiding) return;

    const dropdown = projectDropdownRef.current;
    if (!dropdown) return;

    let animationCompleted = false;
    const fallbackTimer = setTimeout(() => {
      if (!animationCompleted) {
        setIsProjectDropdownOpen(false);
        setIsProjectDropdownHiding(false);
      }
    }, 300);

    const handleAnimationEnd = (e: AnimationEvent) => {
      if (e.animationName === 'dropdownOut') {
        animationCompleted = true;
        clearTimeout(fallbackTimer);
        setIsProjectDropdownOpen(false);
        setIsProjectDropdownHiding(false);
      }
    };

    const timer = setTimeout(() => {
      dropdown.addEventListener('animationend', handleAnimationEnd);
    }, 0);

    return () => {
      clearTimeout(timer);
      clearTimeout(fallbackTimer);
      dropdown.removeEventListener('animationend', handleAnimationEnd);
    };
  }, [isProjectDropdownHiding]);

  // 计算项目下拉菜单位置
  const updateProjectDropdownPosition = () => {
    if (!projectDropdownButtonRef.current) return;

    const buttonRect = projectDropdownButtonRef.current.getBoundingClientRect();
    setProjectDropdownPosition({
      top: buttonRect.bottom + 8, // 按钮底部 + 小间距
      left: buttonRect.left,
      width: Math.max(200, buttonRect.width)
    });
  };

  // 打开项目下拉菜单时更新位置
  useEffect(() => {
    if (isProjectDropdownOpen) {
      updateProjectDropdownPosition();

      const handleResize = () => updateProjectDropdownPosition();
      const handleScroll = () => updateProjectDropdownPosition();

      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll, true);

      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [isProjectDropdownOpen]);

  // 加载项目列表和历史工作流
  useEffect(() => {
    if (currentUser) {
      loadProjects();
    }
  }, [currentUser]);

  useEffect(() => {
    if (activeTab === 'history') {
      loadWorkflowHistory();
    }
  }, [activeTab, selectedProject]);

  const loadProjects = async () => {
    try {
      const response: any = await api.get(`/files/projects?user=${currentUser}`);
      if (response?.success) {
        const list = Array.isArray(response.projects)
          ? (response.projects as string[])
          : (Array.isArray(response.data) ? (response.data as string[]) : []);
        setProjects(list);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const loadWorkflowHistory = async () => {
    setLoadingHistory(true);
    setHistoryError('');

    try {
      // 使用现有的工作流API，请求50条记录
      const response: any = await api.get('/workflows?limit=50');

      console.log('Raw API response:', response); // 调试日志

      // 检查不同的响应格式
      let workflows = [];
      let paginationInfo = null;

      if (response?.items && Array.isArray(response.items)) {
        // PaginatedResponse格式
        workflows = response.items;
        paginationInfo = response.pagination;
      } else if (Array.isArray(response)) {
        // 直接返回数组格式
        workflows = response;
      } else if (response?.data && Array.isArray(response.data)) {
        // ApiResponse格式
        workflows = response.data;
      } else {
        console.warn('Unexpected response format:', response);
        setHistoryError('无法解析工作流数据格式');
        setWorkflowHistory([]);
        return;
      }

      console.log('Parsed workflows:', workflows); // 调试日志
      console.log('Pagination info:', paginationInfo); // 调试日志

      const formattedWorkflows = workflows.map((workflow: any) => ({
        id: workflow.id,
        name: workflow.name,
        filename: `${workflow.id}.json`,
        filepath: `/api/workflows/${workflow.id}`,
        project_name: workflow.individualName || workflow.ownerName || '默认项目',
        created_at: workflow.createdAt,
        node_count: workflow.definition?.nodes?.length || 0,
        connection_count: workflow.definition?.edges?.length || 0,
        loop_count: Math.floor((workflow.definition?.nodes?.length || 0) / 2) // 估算循环数
      }));

      console.log('Formatted workflows:', formattedWorkflows); // 调试日志

      // 按创建时间降序排列（最新的在前面）
      const sortedWorkflows = formattedWorkflows.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // 如果选择了项目，进行过滤
      const filteredWorkflows = selectedProject
        ? sortedWorkflows.filter(w => w.project_name === selectedProject)
        : sortedWorkflows;

      setWorkflowHistory(filteredWorkflows);

      if (filteredWorkflows.length === 0) {
        setHistoryError('没有找到匹配的工作流');
      }
    } catch (error) {
      console.error('Failed to load workflow history:', error);
      setHistoryError('网络错误，无法加载历史工作流');
      setWorkflowHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  
  
  // 加载历史工作流
  const loadHistoryWorkflow = async (workflow: WorkflowHistory) => {
    try {
      console.log('Loading workflow:', workflow.id); // 调试日志

      // 使用现有的工作流API获取特定工作流
      const response = await api.get(`/workflows/${workflow.id}`);

      console.log('Single workflow response:', response); // 调试日志

      // 直接使用响应数据
      let workflowData = response;

      if (!workflowData) {
        throw new Error(`找不到工作流 "${workflow.name}"`);
      }

      console.log('Workflow data to process:', workflowData); // 调试日志

      // 适配后端返回的数据结构：直接访问definition.nodes，而不是通过.data.definition.nodes
      const workflowDefinition = (workflowData as any)?.data?.definition || (workflowData as any)?.definition || {};

      console.log('Workflow definition:', workflowDefinition); // 调试日志

      // 转换工作流数据格式以适配前端期望的结构
      const convertedNodes = workflowDefinition.nodes?.map((node: any) => {
        // 兼容性处理：处理新旧版本节点结构差异
        const isOldVersion = !node.data; // 旧版本没有data字段

        // 获取参数对象并进行数据清理
        let parameters: Record<string, any> = {};
        if (isOldVersion) {
          parameters = node.config?.parameters || {};
        } else {
          parameters = node.data?.parameters || node.config?.parameters || {};
        }

        // 数据清理：移除不再支持的字段以保持兼容性
        // 移除 loop_id 字段（已在新版本中移除）
        if ('loop_id' in parameters) {
          console.log(`[WorkflowManagerUI] 移除历史节点 ${node.id} 中的废弃字段: loop_id`);
          delete parameters.loop_id;
        }

        // 根据节点类型确定正确的分类
        const getNodeTypeCategory = (nodeType: string) => {
          if (['startup', 'shutdown', 'change_temperature', 'change_gas_flow'].includes(nodeType)) {
            return 'device';
          }
          if (['loop_start', 'loop_end', 'wait_delay'].includes(nodeType)) {
            return 'flow_control';
          }
          return 'basic_measurement';
        };

        return {
          id: node.id,
          type: node.type,
          name: node.name,
          category: getNodeTypeCategory(node.type),
          position: node.position,
          style: { width: 140, height: 60 },
          status: node.status || 'ready', // 优先使用原有status，否则默认为ready
          data: {
            name: node.name,
            description: isOldVersion ? `Node: ${node.type}` : (node.data?.description || `Node: ${node.type}`),
            parameters: parameters, // 使用清理后的参数
            createdAt: isOldVersion ? new Date() : (node.data?.createdAt ? new Date(node.data.createdAt) : new Date()),
            updatedAt: isOldVersion ? new Date() : (node.data?.updatedAt ? new Date(node.data.updatedAt) : new Date())
          },
          input: {
            id: `${node.id}_input`,
            name: 'Input',
            dataType: 'flow' as const
          },
          output: {
            id: `${node.id}_output`,
            name: 'Output',
            dataType: 'flow' as const
          }
        };
      }) || [];

      const formattedConnections = workflowDefinition.edges?.map((edge: any) => ({
        id: edge.id,
        source_id: edge.source,
        target_id: edge.target
      })) || [];

      console.log('Converted nodes:', convertedNodes);
      console.log('Formatted connections:', formattedConnections);

      // 应用加载的工作流
      setNodes(convertedNodes);
      setConnections(formattedConnections);

      // 同步更新WorkflowStore状态
      setCurrentWorkflow({
        id: workflow.id,
        name: workflow.name,
        createdAt: new Date(workflow.created_at),
        updatedAt: new Date(workflow.created_at),
        workstation: 'zahner-zennium', // 添加缺失的workstation字段
        status: 'active', // 添加缺失的status字段
        // 构建完整的工作流对象（不再包含edges）
        definition: {
          nodes: convertedNodes,
          id: workflow.id,
          name: workflow.name,
          version: 1.0
        },
        ownerName: workflow.project_name || '默认项目'
      });
      // 同步设置当前编辑的工作流ID以加载对应的默认参数
      setCurrentEditingWorkflowId(workflow.id);

      console.log(`历史工作流 "${workflow.name}" 加载成功`);

    } catch (error) {
      console.error('加载历史工作流失败:', error);
      alert(`加载工作流 "${workflow.name}" 失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 删除历史工作流文件
  const deleteHistoryWorkflow = async (workflow: WorkflowHistory) => {
    try {
      // 这里可以添加删除文件的API调用
      // 暂时只从本地列表中移除
      setWorkflowHistory(prev => prev.filter(item => item.id !== workflow.id));
      setDeletingItemId(null); // 清除删除状态
      console.log(`历史工作流 "${workflow.name}" 已从列表中移除`);
    } catch (error) {
      console.error('删除历史工作流失败:', error);
      setDeletingItemId(null); // 清除删除状态
      alert(`删除工作流 "${workflow.name}" 失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 显示删除确认
  const showDeleteConfirm = (workflow: WorkflowHistory) => {
    setDeletingItemId(workflow.id);
  };

  // 取消删除
  const cancelDelete = () => {
    setDeletingItemId(null);
  };

  // 应用模板
  const applyTemplate = (template: WorkflowData) => {
    if (window.confirm(`确定要应用模板 "${template.metadata?.name}" 吗？这将替换当前工作流。`)) {
      setNodes(template.nodes);
      // 转换连接线格式：从 camelCase 到 snake_case
      const formattedConnections = template.connections.map(conn => ({
        id: conn.id,
        source_id: conn.sourceId,
        target_id: conn.targetId
      }));
      setConnections(formattedConnections);
    }
  };

  
  // 获取工作流统计
  const getWorkflowStats = () => {
    return {
      nodes: nodes.length,
      connections: connections.length,
      loops: detectedLoops.length,
      lastModified: new Date().toLocaleString()
    };
  };

  const stats = getWorkflowStats();

  return (
    <Portal>
      <div className="portal-overlay">
        <div
          ref={panelRef}
          className={`workflow-manager-ui glass ${className}`}
          style={{
            ...style,
            background: 'rgba(0, 0, 0, 0.5)' // 覆盖玻璃态背景透明度为0.5
          }}
        >
          <div className="manager-header">
            <h3>工作流管理</h3>
            <div className="workflow-stats">
              <span>节点: {stats.nodes}</span>
              <span>连接: {stats.connections}</span>
              <span>循环: {stats.loops}</span>
            </div>
          </div>

          {/* 标签导航 */}
          <div className="tab-navigation">
            <button
              className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              历史记录
            </button>
            <button
              className={`tab-btn ${activeTab === 'templates' ? 'active' : ''}`}
              onClick={() => setActiveTab('templates')}
            >
              收藏
            </button>
          </div>

          {/* 标签内容 */}
          <div className="tab-content">

            {/* 历史记录标签 */}
            {activeTab === 'history' && (
              <div className="history-tab">
                <div className="history-header">
                  {/* 项目筛选器 - 自定义下拉菜单 */}
                  <div className="history-filter">
                    <button
                      ref={projectDropdownButtonRef}
                      className="btn btn_secondary btn_small"
                      onClick={() => {
                        if (isProjectDropdownOpen) {
                          setIsProjectDropdownOpen(false);
                          setIsProjectDropdownHiding(true);
                        } else {
                          setIsProjectDropdownOpen(true);
                        }
                      }}
                    >
                      <span className="user-display">{selectedProject || '请选择项目'}</span>
                      <svg className={`dropdown-arrow ${isProjectDropdownOpen ? 'rotated' : ''}`} viewBox="-10 -6 20 12" width="12" height="12">
                        <path
                          d="M -8 -3 L 0 5 L 8 -3"
                          fill="none"
                          stroke="rgba(255,255,255,0.8)"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {historyError && (
                  <div className="history-error alert alert_danger">
                    <div className="alert_message">{historyError}</div>
                    <button
                      onClick={loadWorkflowHistory}
                      className="retry-btn btn btn_warning btn_small"
                      disabled={loadingHistory}
                    >
                      重试
                    </button>
                  </div>
                )}

                {loadingHistory ? (
                  <div className="history-loading">
                    <div className="loading-spinner spinner"></div>
                    <div>正在加载历史工作流...</div>
                  </div>
                ) : workflowHistory.length === 0 ? (
                  <div className="history-empty">
                    <div className="empty-icon">📋</div>
                    <div className="empty-text">暂无历史工作流</div>
                    <div className="empty-hint">
                      {selectedProject
                        ? `项目 "${selectedProject}" 中没有找到历史工作流`
                        : '导出工作流后会在这里显示记录'
                      }
                    </div>
                  </div>
                ) : (
                  <div className="history-list">
                    {workflowHistory.map((item) => (
                      <div
                        key={item.id}
                        className="history-item card"
                        onDoubleClick={() => loadHistoryWorkflow(item)}
                        title="双击加载工作流"
                      >
                        <div className="history-info">
                          <div className="history-name">
                            {item.name}
                            <span className="history-id">({item.id})</span>
                          </div>
                          <div className="history-project">
                            项目: {item.project_name}
                          </div>
                          <div className="history-details">
                            <span>节点: {item.node_count || 0}</span>
                            <span>连接: {item.connection_count || 0}</span>
                            <span>循环: {item.loop_count || 0}</span>
                            {item.file_size && (
                              <span>大小: {Math.round(item.file_size / 1024)}KB</span>
                            )}
                          </div>
                          <div className="history-time">
                            {new Date(item.created_at).toLocaleString()}
                          </div>
                        </div>
                        <div className="history-actions">
                        <button
                          onClick={() => showDeleteConfirm(item)}
                          className="delete-user-btn"
                          title="删除记录"
                          style={{ display: deletingItemId === item.id ? 'none' : 'flex' }}
                        >
                          ×
                        </button>
                        {deletingItemId === item.id && (
                          <div className="delete-confirm">
                            <span className="delete-confirm-text">确认删除？</span>
                            <button
                              onClick={() => deleteHistoryWorkflow(item)}
                              className="delete-confirm-btn confirm"
                              title="确认删除"
                            >
                              ✓
                            </button>
                            <button
                              onClick={cancelDelete}
                              className="delete-confirm-btn cancel"
                              title="取消删除"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 收藏标签 */}
            {activeTab === 'templates' && (
              <div className="templates-tab">
                <div className="templates-header">
                  <h4>收藏</h4>
                  <p>选择一个收藏快速开始新的工作流</p>
                </div>

                <div className="templates-grid">
                  {templates.map((template, index) => (
                    <div key={index} className="template-card card">
                      <div className="template-header">
                        <h5>{template.metadata?.name}</h5>
                        <span className="template-badge badge badge_neutral">收藏</span>
                      </div>
                      <div className="template-description">
                        {template.metadata?.description}
                      </div>
                      <div className="template-stats">
                        <span>节点: {template.nodes.length}</span>
                        <span>连接: {template.connections.length}</span>
                      </div>
                      <div className="template-actions">
                        <button
                          onClick={() => applyTemplate(template)}
                          className="btn-apply btn btn_primary btn_small"
                        >
                          应用模板
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 项目下拉菜单 - 使用Portal渲染 */}
      <Portal>
        {(isProjectDropdownOpen || isProjectDropdownHiding) && (
          <div
            ref={projectDropdownRef}
            className={`dropdown_base overlay_base ${isProjectDropdownHiding ? 'hiding' : 'show'}`}
            style={{
              top: `${projectDropdownPosition.top}px`,
              left: `${projectDropdownPosition.left}px`,
              width: `${projectDropdownPosition.width}px`
            } as React.CSSProperties}
          >
            <div className="dropdown_list">
                {projects.length > 0 ? (
                projects.map(project => (
                  <div
                    key={project}
                    className={`dropdown_option ${project === selectedProject ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedProject(project);
                      setIsProjectDropdownHiding(true);
                    }}
                  >
                    {project}
                  </div>
                ))
              ) : (
                <div className="dropdown_empty">暂无项目</div>
              )}
            </div>
          </div>
        )}
      </Portal>
    </Portal>
  );
};

export default WorkflowManagerUI;
---

## UI 组件

### components/common/WorkflowIdDisplay.tsx

import React, { useState, useRef, useEffect } from 'react';
import { useWorkflowStore } from '../../services/stores';
import { useOnClickOutside } from '../../services/hooks/useOnClickOutside';

interface WorkflowIdDisplayProps {
  className?: string;
}

export const WorkflowIdDisplay: React.FC<WorkflowIdDisplayProps> = ({ className = '' }) => {
  const { currentWorkflow, updateWorkflow } = useWorkflowStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 同步当前工作流名称到编辑状态
  useEffect(() => {
    if (currentWorkflow && !isEditing) {
      setEditValue(currentWorkflow.name || '');
    }
  }, [currentWorkflow, isEditing]);

  // 双击开始编辑
  const handleDoubleClick = () => {
    if (currentWorkflow) {
      // 只编辑工作流名称
      setEditValue(currentWorkflow.name || '');
      setIsEditing(true);
    }
  };

  // 保存编辑
  const handleSave = async () => {
    if (currentWorkflow && editValue.trim() !== currentWorkflow.name) {
      try {
        await updateWorkflow(currentWorkflow.id, {
          name: editValue.trim(),
        });
      } catch (error) {
        console.error('更新工作流名称失败:', error);
        // 可以在这里添加错误提示
      }
    }
    setIsEditing(false);
  };

  // 取消编辑
  const handleCancel = () => {
    setEditValue(currentWorkflow?.name || '');
    setIsEditing(false);
  };

  // 键盘事件处理
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  // 失去焦点时保存（作为备用方案）
  const handleBlur = () => {
    if (isEditing) {
      handleSave();
    }
  };

  // 自动聚焦输入框
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // 使用点击外部关闭Hook作为onBlur的补充
  useOnClickOutside(containerRef, handleSave, isEditing);

  // 如果没有当前工作流，显示占位符
  if (!currentWorkflow) {
    return (
      <div ref={containerRef} className={`workflow-id-display placeholder ${className}`}>
        <span className="display-text">未选择工作流</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`workflow-id-display ${isEditing ? 'editing' : ''} ${className}`}>
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="workflow-name-input"
          placeholder={`编辑 ${currentWorkflow.id} 的工作流名称`}
          maxLength={50}
        />
      ) : (
        <div
          className="display-content"
          onDoubleClick={handleDoubleClick}
          title={`双击编辑工作流名称 (ID: ${currentWorkflow.id})`}
        >
          <span className="display-text">
            {currentWorkflow.name || currentWorkflow.id}
          </span>
          <span className="edit-hint">✏️</span>
        </div>
      )}
    </div>
  );
};
---

## 样式文件

### styles/_workflow.css

/* === _workflow.css - 工作流管理 === */

/* === 工作流管理器覆盖层 === */
.workflow-manager-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(var(--blur-lg));
  -webkit-backdrop-filter: blur(var(--blur-lg));
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space);
  animation: modal_backdrop_in var(--duration-normal) var(--ease-out);
}

/* === 工作流管理面板 === */
.workflow-manager-panel {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  backdrop-filter: blur(var(--blur-xl));
  -webkit-backdrop-filter: blur(var(--blur-xl));
  box-shadow:
    0 16px 64px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.3),
    inset 0 -1px 0 rgba(255, 255, 255, 0.1);
  width: 90vw;
  max-width: clamp(40rem, 80vw, 60rem);
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: modal_scale_in var(--duration-normal) var(--ease-bounce);
}

/* === 工作流面板头部 === */
.workflow-panel-header {
  padding: clamp(1.25rem, 2.5vw, 1.75rem);
  border-bottom: 1px solid var(--glass-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(0, 0, 0, 0.1);
}

.workflow-panel-title {
  font-size: clamp(1.25rem, 2.5vw, 1.5rem);
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}

.workflow-panel-close {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: clamp(1.25rem, 2.5vw, 1.5rem);
  cursor: pointer;
  padding: clamp(0.375rem, 0.8vw, 0.5rem);
  border-radius: var(--radius-sm);
  transition: var(--transition);
  line-height: 1;
}

.workflow-panel-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

/* === 工作流面板主体 === */
.workflow-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: clamp(1.25rem, 2.5vw, 1.75rem);
  display: flex;
  flex-direction: column;
  gap: clamp(1.25rem, 2.5vw, 1.75rem);
}

/* === 工作流卡片网格 === */
.workflow-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(clamp(16rem, 30vw, 20rem), 1fr));
  gap: clamp(1.25rem, 2.5vw, 1.75rem);
}

/* === 工作流卡片 === */
.workflow-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  padding: clamp(1rem, 2vw, 1.25rem);
  transition: var(--transition);
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.workflow-card:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: var(--glass-border-hover);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.workflow-card.active {
  border-color: var(--color-primary);
  background: var(--color-primary-bg);
  box-shadow:
    0 0 20px rgba(59, 130, 246, 0.3),
    0 8px 24px rgba(0, 0, 0, 0.2);
}

/* === 工作流卡片头部 === */
.workflow-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: clamp(0.75rem, 1.5vw, 1rem);
}

.workflow-card-title {
  font-size: clamp(1rem, 2vw, 1.125rem);
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  flex: 1;
  margin-right: clamp(0.5rem, 1vw, 0.75rem);
}

.workflow-card-status {
  display: flex;
  align-items: center;
  gap: clamp(0.375rem, 0.8vw, 0.5rem);
  font-size: clamp(0.75rem, 1.5vw, 0.8125rem);
  padding: clamp(0.25rem, 0.5vw, 0.375rem) clamp(0.5rem, 1vw, 0.625rem);
  border-radius: var(--radius-sm);
  font-weight: 500;
}

.workflow-card-status.running {
  background: var(--workflow-running);
  color: white;
}

.workflow-card-status.completed {
  background: var(--workflow-completed);
  color: white;
}

.workflow-card-status.paused {
  background: var(--workflow-paused);
  color: white;
}

.workflow-card-status.stopped {
  background: var(--workflow-stopped);
  color: white;
}

.workflow-card-status.error {
  background: var(--workflow-error);
  color: white;
}

/* === 工作流卡片信息 === */
.workflow-card-info {
  display: flex;
  flex-direction: column;
  gap: clamp(0.5rem, 1vw, 0.75rem);
}

.workflow-card-description {
  font-size: clamp(0.8125rem, 1.8vw, 0.875rem);
  color: var(--text-secondary);
  line-height: 1.5;
  flex: 1;
}

.workflow-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: clamp(0.75rem, 1.5vw, 1rem);
  font-size: clamp(0.75rem, 1.5vw, 0.8125rem);
  color: var(--text-muted);
}

.workflow-meta-item {
  display: flex;
  align-items: center;
  gap: clamp(0.25rem, 0.5vw, 0.375rem);
}

/* === 工作流卡片操作 === */
.workflow-card-actions {
  display: flex;
  gap: clamp(0.5rem, 1vw, 0.75rem);
  margin-top: clamp(1rem, 2vw, 1.25rem);
  padding-top: clamp(0.75rem, 1.5vw, 1rem);
  border-top: 1px solid var(--glass-border);
}

.workflow-card-actions .btn {
  flex: 1;
  font-size: clamp(0.75rem, 1.5vw, 0.8125rem);
  padding: clamp(0.5rem, 1vw, 0.625rem);
}

/* === 工作流控制栏 === */
.workflow-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: clamp(1rem, 2vw, 1.25rem);
  background: rgba(0, 0, 0, 0.1);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  backdrop-filter: blur(var(--blur-md));
  -webkit-backdrop-filter: blur(var(--blur-md));
}

.workflow-controls-left {
  display: flex;
  align-items: center;
  gap: clamp(0.75rem, 1.5vw, 1rem);
}

.workflow-controls-right {
  display: flex;
  align-items: center;
  gap: clamp(0.5rem, 1vw, 0.75rem);
}

/* === 工作流统计 === */
.workflow-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(clamp(8rem, 15vw, 10rem), 1fr));
  gap: clamp(1rem, 2vw, 1.25rem);
}

.workflow-stat-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  padding: clamp(1rem, 2vw, 1.25rem);
  text-align: center;
}

.workflow-stat-value {
  font-size: clamp(1.5rem, 3vw, 2rem);
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: clamp(0.375rem, 0.8vw, 0.5rem);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}

.workflow-stat-label {
  font-size: clamp(0.8125rem, 1.8vw, 0.875rem);
  color: var(--text-secondary);
  font-weight: 500;
}

/* === 工作流过滤器 === */
.workflow-filters {
  display: flex;
  flex-wrap: wrap;
  gap: clamp(0.75rem, 1.5vw, 1rem);
  padding: clamp(1rem, 2vw, 1.25rem);
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
}

.workflow-filter-group {
  display: flex;
  align-items: center;
  gap: clamp(0.5rem, 1vw, 0.75rem);
}

.workflow-filter-label {
  font-size: clamp(0.8125rem, 1.8vw, 0.875rem);
  color: var(--text-secondary);
  font-weight: 500;
}

.workflow-filter-select {
  padding: clamp(0.375rem, 0.8vw, 0.5rem) clamp(0.625rem, 1.2vw, 0.875rem);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  background: var(--glass-bg);
  color: var(--text-primary);
  font-size: clamp(0.75rem, 1.5vw, 0.8125rem);
  backdrop-filter: blur(var(--blur-md));
  -webkit-backdrop-filter: blur(var(--blur-md));
  transition: var(--transition);
  cursor: pointer;
}

/* === 工作流搜索框 === */
.workflow-search {
  position: relative;
  flex: 1;
  max-width: clamp(16rem, 30vw, 20rem);
}

.workflow-search-input {
  width: 100%;
  padding: clamp(0.5rem, 1vw, 0.625rem) clamp(2.5rem, 4vw, 3rem) clamp(0.5rem, 1vw, 0.625rem) clamp(0.75rem, 1.5vw, 1rem);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  background: var(--glass-bg);
  color: var(--text-primary);
  font-size: clamp(0.8125rem, 1.8vw, 0.875rem);
  backdrop-filter: blur(var(--blur-md));
  -webkit-backdrop-filter: blur(var(--blur-md));
  transition: var(--transition);
}

.workflow-search-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.workflow-search-icon {
  position: absolute;
  left: clamp(0.75rem, 1.5vw, 1rem);
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: clamp(0.875rem, 1.8vw, 1rem);
}

/* === 工作流时间轴 === */
.workflow-timeline {
  display: flex;
  flex-direction: column;
  gap: clamp(0.75rem, 1.5vw, 1rem);
}

.timeline-item {
  display: flex;
  gap: clamp(0.75rem, 1.5vw, 1rem);
  padding-left: clamp(1.5rem, 3vw, 2rem);
  position: relative;
}

.timeline-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: clamp(0.5rem, 1vw, 0.75rem);
  width: clamp(0.75rem, 1.5vw, 1rem);
  height: clamp(0.75rem, 1.5vw, 1rem);
  border-radius: 50%;
  background: var(--glass-border);
  border: 2px solid var(--glass-bg);
}

.timeline-item.active::before {
  background: var(--color-primary);
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2);
}

.timeline-item.completed::before {
  background: var(--color-success);
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.2);
}

.timeline-item.error::before {
  background: var(--color-danger);
  box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.2);
}

.timeline-content {
  flex: 1;
  padding: clamp(0.75rem, 1.5vw, 1rem);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
}

.timeline-time {
  font-size: clamp(0.75rem, 1.5vw, 0.8125rem);
  color: var(--text-muted);
  margin-bottom: clamp(0.25rem, 0.5vw, 0.375rem);
}

.timeline-title {
  font-size: clamp(0.875rem, 1.8vw, 0.9375rem);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: clamp(0.25rem, 0.5vw, 0.375rem);
}

.timeline-description {
  font-size: clamp(0.75rem, 1.5vw, 0.8125rem);
  color: var(--text-secondary);
  line-height: 1.5;
}

/* === 工作流空状态 === */
.workflow-empty-state {
  text-align: center;
  padding: clamp(3rem, 6vw, 4rem) clamp(2rem, 4vw, 3rem);
  color: var(--text-muted);
}

.workflow-empty-icon {
  font-size: clamp(3rem, 6vw, 4rem);
  margin-bottom: clamp(1rem, 2vw, 1.5rem);
  opacity: 0.5;
}

.workflow-empty-title {
  font-size: clamp(1.25rem, 2.5vw, 1.5rem);
  font-weight: 600;
  margin-bottom: clamp(0.5rem, 1vw, 0.75rem);
  color: var(--text-secondary);
}

.workflow-empty-description {
  font-size: clamp(0.875rem, 1.8vw, 0.9375rem);
  line-height: 1.6;
  max-width: clamp(20rem, 40vw, 30rem);
  margin: 0 auto;
}

/* === 工作流ID/名称显示组件样式 === */
.workflow-id-display {
  /* 布局定位 */
  position: absolute;
  bottom: var(--size-lg);
  left: var(--size-lg);
  z-index: var(--z-overlay);

  /* 尺寸 */
  min-width: clamp(12.5rem, 20vw, 18.75rem);
  max-width: clamp(12.5rem, 20vw, 18.75rem);

  /* 视觉样式 - 使用玻璃态系统 */
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  backdrop-filter: blur(var(--blur-md));
  -webkit-backdrop-filter: blur(var(--blur-md));
  box-shadow: 0 4px var(--size-lg) var(--glass-shadow);

  /* 内间距 */
  padding: var(--size-2xs) var(--size-2xs);

  /* 交互 */
  transition: var(--transition);
}

.workflow-id-display:hover {
  background: var(--glass-bg-hover);
  border-color: var(--glass-border-hover);
  transform: translateY(-1px);
  box-shadow: 0 8px var(--size-xl) var(--glass-shadow-hover);
}

.workflow-id-display.placeholder {
  opacity: 0.6;
  border-color: rgba(255, 255, 255, 0.1);
}

.workflow-id-display.placeholder .display-text {
  color: var(--text-secondary);
  font-style: italic;
}

.display-content {
  /* 布局 */
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-sm);

  /* 交互 */
  cursor: pointer;
  user-select: none;
}

.display-text {
  /* 文本样式 */
  color: var(--text-primary);
  font-size: var(--text-body);
  font-weight: 500;

  /* 布局控制 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.edit-hint {
  /* 文本样式 */
  color: var(--text-muted);
  font-size: var(--size-sm);

  /* 交互状态 */
  opacity: 0;
  transition: opacity 0.2s ease;
}

.workflow-id-display:hover .edit-hint {
  opacity: 0.7;
}

.workflow-id-display.editing {
  background: rgba(255, 255, 255, 0.2);
  border-color: var(--color-primary);
  box-shadow: 0 0 var(--size-md) rgba(59, 130, 246, 0.3);
}

.workflow-name-input {
  /* 布局 */
  width: 100%;

  /* 重置默认样式 */
  background: transparent;
  border: none;
  outline: none;

  /* 文本样式 - 继承系统变量 */
  color: var(--text-primary);
  font-size: var(--text-body);
  font-weight: 500;
  font-family: inherit;

  /* 内边距 */
  padding: var(--size-3xs) var(--size-2xs);

  /* 视觉效果 */
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.1);
}

.workflow-name-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.7;
}

.workflow-name-input:focus {
  background: rgba(255, 255, 255, 0.15);
}

/* === 工作流管理UI专用样式 === */

/* Portal 容器样式 */
.portal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
}

/* 工作流管理UI - 组合glass类 + 自定义尺寸 */
.workflow-manager-ui {
  /* 继承glass类的所有样式，只重写需要的变量 */
  max-width: 90vw;
  width: 600px;
  max-height: calc(100vh - 200px);
  flex-direction: column;
  display: flex;
  overflow: hidden;
}

/* 头部样式 */
.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--size-lg);
  border-bottom: 1px solid var(--glass-border);
  background: rgba(0, 0, 0, 0.1);
}

.manager-header h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--size-lg);
  font-weight: 600;
}

.workflow-stats {
  display: flex;
  gap: var(--size-sm);
  font-size: var(--size-xs);
  color: var(--text-secondary);
}

/* 标签导航 */
.tab-navigation {
  display: flex;
  background: var(--glass-hover);
  border-bottom: 1px solid var(--glass-border);
}

.tab-btn {
  flex: 1;
  padding: var(--size-sm) var(--size-md);
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--size-sm);
  font-weight: 500;
  transition: var(--transition);
  border-bottom: 2px solid transparent;
}

.tab-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

.tab-btn.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  background: var(--color-primary-bg);
}

/* 标签内容 */
.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--size-lg);
}

/* 历史记录列表 */
.history-list {
  display: flex;
  flex-direction: column;
  gap: var(--size-sm);
}

.history-item {
  /* 组合card类，添加cursor */
  cursor: pointer;
}

/* 历史记录信息 */
.history-info {
  flex: 1;
}

.history-name {
  font-size: var(--size-sm);
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: var(--size-3xs);
}

.history-id {
  font-size: var(--size-xs);
  color: var(--text-muted);
  margin-left: var(--size-3xs);
}

.history-project,
.history-details,
.history-time {
  font-size: var(--size-xs);
  color: var(--text-secondary);
  margin-bottom: var(--size-3xs);
}

.history-details {
  display: flex;
  gap: var(--size-sm);
}

/* 历史记录操作按钮 */
.history-actions {
  display: flex;
  gap: var(--size-3xs);
}

.delete-user-btn {
  width: var(--size-lg);
  height: var(--size-lg);
  border: none;
  border-radius: var(--effect-sm);
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--size-xs);
  transition: var(--transition);
  color: var(--text-muted);
}

.delete-user-btn:hover {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

/* 删除确认 */
.delete-confirm {
  display: flex;
  align-items: center;
  gap: var(--size-2xs);
  padding: var(--size-3xs) var(--size-2xs);
  background: var(--color-danger-bg);
  border: 1px solid var(--color-danger);
  border-radius: var(--effect-sm);
  animation: confirmIn 0.2s ease-out;
}

.delete-confirm-text {
  font-size: var(--size-xs);
  color: var(--color-danger);
  font-weight: 500;
  white-space: nowrap;
}

.delete-confirm-btn {
  width: var(--size-md);
  height: var(--size-md);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: calc(var(--size-xs) * 0.8);
  font-weight: bold;
  transition: var(--transition);
  line-height: 1;
}

.delete-confirm-btn.confirm {
  background: rgba(239, 68, 68, 0.2);
  color: var(--color-danger);
}

.delete-confirm-btn.confirm:hover {
  background: var(--color-danger);
  color: white;
  transform: scale(1.1);
}

.delete-confirm-btn.cancel {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
}

.delete-confirm-btn.cancel:hover {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  transform: scale(1.1);
}

@keyframes confirmIn {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* 模板网格 */
.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: var(--size-md);
}

.template-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--size-sm);
}

.template-header h5 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--size-sm);
  font-weight: 600;
}

.template-description {
  font-size: var(--size-xs);
  color: var(--text-secondary);
  line-height: 1.4;
  margin-bottom: var(--size-sm);
}

.template-stats {
  display: flex;
  gap: var(--size-sm);
  margin-bottom: var(--size-sm);
  font-size: var(--size-xs);
  color: var(--text-secondary);
}

.template-actions {
  display: flex;
  justify-content: flex-end;
}

.btn-apply {
  /* 组合按钮系统 */
  padding: var(--size-3xs) var(--size-sm);
  font-size: var(--size-xs);
}

/* 用户下拉菜单已统一到 _ui_kit.css 中的 .dropdown_base */

/* 错误和加载状态 */
.history-error {
  /* 组合alert类 */
  margin-bottom: var(--size-sm);
}

.retry-btn {
  padding: var(--size-3xs) var(--size-2xs);
  font-size: var(--size-xs);
}

.history-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--size-4xl) var(--size-lg);
  text-align: center;
  color: var(--text-secondary);
}

.loading-spinner {
  font-size: var(--size-3xl);
  margin-bottom: var(--size-sm);
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.history-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--size-4xl) var(--size-lg);
  text-align: center;
}

.empty-icon {
  font-size: var(--size-4xl);
  margin-bottom: var(--size-md);
  opacity: 0.5;
}

.empty-text {
  font-size: var(--size-lg);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--size-3xs);
}

.empty-hint {
  font-size: var(--size-sm);
  color: var(--text-secondary);
}

/* === 响应式设计 === */
@media (max-width: 768px) {
  .workflow-cards-grid {
    grid-template-columns: 1fr;
    gap: var(--space);
  }

  .workflow-controls {
    flex-direction: column;
    gap: var(--space);
    align-items: stretch;
  }

  .workflow-controls-left,
  .workflow-controls-right {
    justify-content: center;
  }

  .workflow-stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .workflow-filters {
    flex-direction: column;
  }

  .workflow-search {
    max-width: none;
  }

  .workflow-panel-header {
    padding: var(--space);
  }

  .workflow-panel-body {
    padding: var(--space);
  }

  .workflow-card-actions {
    flex-direction: column;
  }

  .workflow-id-display {
    bottom: var(--size-md);
    left: var(--size-md);
    min-width: clamp(10rem, 15vw, 15rem);
    max-width: clamp(10rem, 15vw, 15rem);
    padding: var(--size-3xs) var(--size-2xs);
  }
}\n\n---\n\n文档生成完成
