// --- START OF FILE apps/frontend/src/services/layout/useNodeChangeDetection.ts ---

import { useState, useEffect, useRef } from 'react';

// 通用节点接口：只需要 id 和 type（兼容 WorkflowNode 和 DisplayNode）
interface NodeLike {
  id: string;
  type: string;
}

/**
 * 简化版变更检测
 * 仅当节点数量或顺序发生变化时触发
 */
export const useNodeChangeDetection = (
  nodes: NodeLike[],
  options: { enable_delay?: boolean; delay_ms?: number } = {}
): number => {
  const [trigger, setTrigger] = useState(0);
  const prevIdsRef = useRef<string>('');

  useEffect(() => {
    // 生成指纹：仅包含 ID 和 类型 (布局只受这些影响)
    const currentIds = nodes.map(n => `${n.id}:${n.type}`).join('|');

    if (currentIds !== prevIdsRef.current) {
      if (options.enable_delay) {
        const timer = setTimeout(() => {
          setTrigger(t => t + 1);
          prevIdsRef.current = currentIds;
        }, options.delay_ms || 300);
        return () => clearTimeout(timer);
      } else {
        setTrigger(t => t + 1);
        prevIdsRef.current = currentIds;
      }
    }
  }, [nodes, options.enable_delay, options.delay_ms]);

  return trigger;
};