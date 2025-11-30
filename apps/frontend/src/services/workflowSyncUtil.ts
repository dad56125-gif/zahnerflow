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
          // 确保参数正确映射到 config 字段
          const config = node.config || node.data?.parameters || {};

          return {
            id: node.id,
            type: node.type,
            name: node.name,
            position: node.position,
            data: {
              ...node.data,
              // 保持 parameters 以向后兼容
              parameters: config
            },
            // 优先使用 config 字段存储参数
            config: config,
            input: node.input,
            output: node.output,
            status: node.status || 'ready'
          };
        }),
        edges: connections.map(conn => ({
          id: conn.id,
          source: conn.source_id,
          target: conn.target_id
        })),
        version: (currentWorkflow.version || 1) + 1
      };

      // 3. 同步到后端
      await workflowService.updateWorkflow(workflowId, {
        definition: updatedDefinition,
        version: updatedDefinition.version
      });

      console.log('[WorkflowSync] 前端参数已同步到后端工作流');
      console.log(`[WorkflowSync] 同步了 ${nodes.length} 个节点和 ${connections.length} 个连接`);

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
      const nodeConfig = node.config || node.data?.parameters || {};
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
    const { nodes, connections } = useCanvasStore.getState();

    return {
      canSync: currentWorkflow?.id === workflowId,
      nodeCount: nodes.length,
      connectionCount: connections.length,
      nodesWithConfig: nodes.filter(node => {
        const config = node.config || node.data?.parameters || {};
        return Object.keys(config).length > 0;
      }).length,
      lastSyncTime: currentWorkflow?.updatedAt ? new Date(currentWorkflow.updatedAt) : null,
      workflowVersion: currentWorkflow?.version || 1
    };
  }
};

export default workflowSyncUtil;