import { apiHelpers } from './api/zahnerApi';
import { 
  Workflow, 
  WorkflowDefinition, 
  PaginatedResponse,
  Execution,
  ExecutionStatus 
} from '@zahnerflow/types';

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
  // 执行工作流
  executeWorkflow: (workflowId: string, params?: {
    parameters?: Record<string, any>;
    priority?: 'low' | 'normal' | 'high';
  }): Promise<{
    executionId: string;
    status: ExecutionStatus;
    startTime: Date;
    error?: string;
    results?: any[];
  }> => {
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