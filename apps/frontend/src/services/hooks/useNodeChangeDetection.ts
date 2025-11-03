/**
 * useNodeChangeDetection Hook
 *
 * 封装节点变化检测逻辑，复用 ConnectionBindingService 的 shouldUpdateConnections 方法
 * 支持延迟更新机制和布局稳定检查，返回 updateTrigger 计数器用于强制重新渲染
 */

import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { connection_binding_service } from '../layout/ConnectionBindingService';
import { ElectrochemicalNode } from '../../types/nodes';

/**
 * Hook 配置选项接口
 */
export interface UseNodeChangeDetectionOptions {
  /** 是否启用延迟更新机制 */
  enable_delay?: boolean;
  /** 延迟时间（毫秒） */
  delay_ms?: number;
  /** 布局是否稳定 */
  layout_stable?: boolean;
}

/**
 * 节点变化检测 Hook
 *
 * @param nodes - 要监听的节点数组
 * @param options - 配置选项
 * @returns update_trigger - 更新触发计数器，用于强制重新渲染
 */
export const useNodeChangeDetection = (
  nodes: any[],
  options: UseNodeChangeDetectionOptions = {}
): number => {
  const {
    enable_delay = false,
    delay_ms = 300,
    layout_stable = true
  } = options;

  // 状态管理
  const [prev_nodes, setPrevNodes] = useState<ElectrochemicalNode[]>([]);
  const [update_trigger, setUpdateTrigger] = useState(0);

  // 定时器引用
  const timeout_ref = useRef<NodeJS.Timeout | null>(null);
  const pending_update_ref = useRef<boolean>(false);

  /**
   * 将普通节点转换为 ElectrochemicalNode 格式
   * 这里需要根据实际传入的节点格式进行转换
   */
  const convertToElectrochemicalNodes = (raw_nodes: any[]): ElectrochemicalNode[] => {
    return raw_nodes.map(node => {
      // 如果已经是 ElectrochemicalNode 格式，直接返回
      if (node && typeof node === 'object' && 'id' in node && 'type' in node) {
        return {
          id: node.id,
          type: node.type || 'startup',
          name: node.name || node.data?.name || 'Unknown',
          category: node.category || 'device',
          position: {
            x: node.position?.x || node.x || 0,
            y: node.position?.y || node.y || 0
          },
          data: {
            name: node.data?.name || node.name || 'Unknown',
            description: node.data?.description || node.description || '',
            parameters: node.data?.parameters || node.parameters || {},
            results: node.data?.results || node.results || {},
            createdAt: node.data?.createdAt || node.createdAt || new Date(),
            updatedAt: node.data?.updatedAt || node.updatedAt || new Date()
          },
          status: node.status || 'idle',
          input: node.input || {
            id: 'input',
            name: '输入',
            dataType: 'flow' as const,
            description: '流程输入'
          },
          output: node.output || {
            id: 'output',
            name: '输出',
            dataType: 'flow' as const,
            description: '流程输出'
          },
          style: node.style || {
            width: 140,
            height: 60
          }
        };
      }

      // 如果是无效节点，返回默认的 ElectrochemicalNode
      return {
        id: `node_${Math.random().toString(36).substring(2, 11)}`,
        type: 'startup',
        name: 'Unknown Node',
        category: 'device',
        position: { x: 0, y: 0 },
        data: {
          name: 'Unknown Node',
          description: '',
          parameters: {},
          results: {},
          createdAt: new Date(),
          updatedAt: new Date()
        },
        status: 'idle',
        input: {
          id: 'input',
          name: '输入',
          dataType: 'flow',
          description: '流程输入'
        },
        output: {
          id: 'output',
          name: '输出',
          dataType: 'flow',
          description: '流程输出'
        },
        style: {
          width: 140,
          height: 60
        }
      };
    });
  };

  /**
   * 清理定时器
   */
  const clearPendingUpdate = () => {
    if (timeout_ref.current) {
      clearTimeout(timeout_ref.current);
      timeout_ref.current = null;
    }
    pending_update_ref.current = false;
  };

  /**
   * 触发更新
   */
  const triggerUpdate = () => {
    setUpdateTrigger(prev => prev + 1);
  };

  // 监听 nodes 变化
  useEffect(() => {
    // 将当前节点转换为 ElectrochemicalNode 格式
    const current_electrochemical_nodes = convertToElectrochemicalNodes(nodes);

    // 使用 ConnectionBindingService 的 shouldUpdateConnections 方法检查是否需要更新
    const should_update = connection_binding_service.shouldUpdateConnections(
      prev_nodes,
      current_electrochemical_nodes
    );

    // 只有在需要更新且布局稳定时才触发更新
    if (should_update && layout_stable) {
      if (enable_delay) {
        // 启用延迟更新机制
        if (!pending_update_ref.current) {
          pending_update_ref.current = true;
          timeout_ref.current = setTimeout(() => {
            triggerUpdate();
            clearPendingUpdate();
          }, delay_ms);
        }
      } else {
        // 立即触发更新
        triggerUpdate();
      }

      // 更新 prev_nodes
      setPrevNodes(current_electrochemical_nodes);
    }
  }, [nodes, layout_stable, enable_delay, delay_ms, prev_nodes]);

  // 清理副作用
  useEffect(() => {
    return () => {
      clearPendingUpdate();
    };
  }, []);

  return update_trigger;
};

/**
 * 预设的配置常量
 */
export const NODE_CHANGE_DETECTION_CONFIG = {
  /** 快速响应配置 - 禁用延迟 */
  FAST_RESPONSE: {
    enable_delay: false,
    delay_ms: 0,
    layout_stable: true
  },

  /** 平衡配置 - 适中延迟 */
  BALANCED: {
    enable_delay: true,
    delay_ms: 150,
    layout_stable: true
  },

  /** 防抖配置 - 较长延迟 */
  DEBOUNCE: {
    enable_delay: true,
    delay_ms: 300,
    layout_stable: true
  },

  /** 保守配置 - 仅在布局稳定时更新 */
  CONSERVATIVE: {
    enable_delay: true,
    delay_ms: 500,
    layout_stable: true
  }
} as const;

/**
 * 默认导出
 */
export default useNodeChangeDetection;