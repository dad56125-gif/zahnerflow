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
          edges: connections.map(conn => ({
            id: conn.id,
            source: conn.source_id,
            target: conn.target_id
          })),
          version: (currentWorkflow.version || 0) + 1
        };

        // 同步到后端
        await workflowService.updateWorkflow(workflowId, {
          definition: workflowDefinition,
          version: workflowDefinition.version
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
        const hasConfig = (node as any).config && Object.keys((node as any).config).length > 0;
        const hasParameters = node.data && node.data.parameters && Object.keys(node.data.parameters).length > 0;
        return hasConfig || hasParameters;
      }).length,
      workflowVersion: currentWorkflow?.version || 0,
      lastUpdated: currentWorkflow?.updatedAt ? new Date(currentWorkflow.updatedAt) : null
    };
  }
};

export default workflowExecutionService;