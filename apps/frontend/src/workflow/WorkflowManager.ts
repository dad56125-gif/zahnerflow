/**
 * 工作流管理器 - 核心工具类
 *
 * 仅保留基础工作流操作功能
 * 复杂的导入/导出/版本控制由后端负责
 */

import { WorkflowDefinition, WorkflowNode } from '@zahnerflow/types';
import { NodeTypeType } from '@/services/nodes/nodeTypes';

export class WorkflowManager {
  /**
   * 创建一个空的工作流定义
   */
  static createEmpty(): WorkflowDefinition {
    return {
      nodes: []
    };
  }

  /**
   * 验证工作流配置
   */
  static validateWorkflowConfig(config: Partial<WorkflowDefinition>): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config) {
      errors.push('工作流配置不能为空');
      return { isValid: false, errors, warnings };
    }

    if (!config.nodes) {
      errors.push('工作流必须包含节点');
      return { isValid: false, errors, warnings };
    }

    if (config.nodes.length === 0) {
      warnings.push('工作流没有节点');
    }

    for (let i = 0; i < config.nodes.length; i++) {
      const node = config.nodes[i];

      if (!node.id) {
        errors.push(`节点 ${i} 缺少ID`);
      }

      if (!node.type) {
        errors.push(`节点 ${i} 缺少类型`);
      }

      if (!node.data) {
        errors.push(`节点 ${i} 缺少数据`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}
