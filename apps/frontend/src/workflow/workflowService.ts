import { apiHelpers } from '../services/api/zahnerApi';
import {
  Workflow,
  WorkflowDefinition,
  PaginatedResponse,
  Execution,
  ExecutionStatus
} from '@zahnerflow/types';
import { useCanvasStore, useWorkflowStore } from '.';

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

};

// 执行相关API
export const executionService = {
  /**
   * 执行工作流
   * - 支持Create if Null: workflowId为null时后端创建新工作流
   * - 直接传递nodes数组，不经过前端同步
   */
  executeWorkflow: async (
    workflowId: string | null,
    nodes: any[],
    params?: {
      priority?: 'low' | 'normal' | 'high';
      ownerName?: string;  // ✅ 新增：当前用户名，用于关联路径配置
      workflowName?: string; // ✅ 新增：预定义的工作流名称
    }
  ): Promise<{
    executionId: string;
    workflowId: string;
    status: ExecutionStatus;
    startTime: Date;
  }> => {
    return apiHelpers.post('/executions', {
      workflowId,
      nodes,
      ownerName: params?.ownerName,  // ✅ 传递给后端
      workflowName: params?.workflowName, // ✅ 传递给后端
      priority: params?.priority
    });
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
