/**
 * 节点变化检测 Hook (优化版)
 * 文件位置: src/services/layout/useNodeChangeDetection.ts
 *
 * 职责：监听节点数组，当且仅当节点的【几何属性】(位置、大小)或状态发生实质变化时，
 * 触发更新计数器。内置了 Diff 算法，不再依赖外部 Service。
 */

import { useState, useEffect, useRef } from 'react';
import { ElectrochemicalNode } from '../types/nodes';

// =============================================================================
// 1. 内置 Diff 工具函数
//    替代了原 ConnectionBindingService.shouldUpdateConnections
// =============================================================================

/**
 * 比较两组节点是否发生"几何级"变化
 * 仅比较影响布局渲染的属性：position(x,y), style(width,height), status
 */
function hasGeometricChanges(
  prevNodes: ElectrochemicalNode[], 
  currNodes: ElectrochemicalNode[]
): boolean {
  // 1. 数量不同，肯定变了
  if (prevNodes.length !== currNodes.length) return true;

  for (let i = 0; i < currNodes.length; i++) {
    const prev = prevNodes[i];
    const curr = currNodes[i];
    
    if (!prev || !curr) return true;

    // 2. 比较位置 (x, y)
    // 使用极小的容差处理浮点数，虽然通常是整数
    if (Math.abs(prev.position.x - curr.position.x) > 0.01 || 
        Math.abs(prev.position.y - curr.position.y) > 0.01) {
      return true;
    }

    // 3. 比较尺寸 (width, height)
    // 处理 style 可能为空的情况
    const prevW = prev.style?.width || 140;
    const currW = curr.style?.width || 140;
    if (prevW !== currW) return true;

    const prevH = prev.style?.height || 60;
    const currH = curr.style?.height || 60;
    if (prevH !== currH) return true;
    
    // 4. 比较状态 (Status 变化通常伴随颜色变化，需要重绘)
    if (prev.status !== curr.status) return true;
  }

  // 走到这里说明所有关键属性都一样
  return false;
}

// =============================================================================
// 2. Hook 主体
// =============================================================================

export interface UseNodeChangeDetectionOptions {
  /** 是否启用延迟更新机制 (防抖) */
  enable_delay?: boolean;
  /** 延迟时间（毫秒） */
  delay_ms?: number;
  /** 外部传入的布局稳定状态 */
  layout_stable?: boolean;
}

export const useNodeChangeDetection = (
  nodes: any[], // 接收原始节点数据
  options: UseNodeChangeDetectionOptions = {}
): number => {
  const {
    enable_delay = false,
    delay_ms = 300,
    layout_stable = true
  } = options;

  // 保存上一次的节点快照用于比较
  const [prevNodes, setPrevNodes] = useState<ElectrochemicalNode[]>([]);
  // 更新触发器（计数器）
  const [updateTrigger, setUpdateTrigger] = useState(0);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdateRef = useRef<boolean>(false);

  // 触发更新的内部函数
  const triggerUpdate = () => {
    setUpdateTrigger(prev => prev + 1);
  };

  useEffect(() => {
    // 简单的类型断言，不再进行昂贵的深拷贝和全量字段映射
    // 因为我们只读 position/style，即使缺少其他字段也不会报错
    const currentNodes = nodes as ElectrochemicalNode[];

    // 执行比较
    const shouldUpdate = hasGeometricChanges(prevNodes, currentNodes);

    // 如果需要更新 且 布局已稳定
    if (shouldUpdate && layout_stable) {
      if (enable_delay) {
        // 启用防抖模式
        if (!pendingUpdateRef.current) {
          pendingUpdateRef.current = true;
          timeoutRef.current = setTimeout(() => {
            triggerUpdate();
            // 清理定时器引用
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            pendingUpdateRef.current = false;
          }, delay_ms);
        }
      } else {
        // 立即响应模式
        triggerUpdate();
      }
      
      // 更新快照，准备下一次比较
      // 注意：这里保存引用是安全的，因为 Zustand 每次更新都会产生新的数组引用
      setPrevNodes(currentNodes);
    }
  }, [nodes, layout_stable, enable_delay, delay_ms, prevNodes]);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return updateTrigger;
};

// =============================================================================
// 3. 配置常量 (保留原功能)
// =============================================================================

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

export default useNodeChangeDetection;