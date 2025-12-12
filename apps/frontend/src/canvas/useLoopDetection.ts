// --- START OF FILE apps/frontend/src/hooks/useSimpleLoopDetection.ts ---

import { useMemo } from 'react';
import { WorkflowNode } from '../types/Interfaces';

export interface SimpleLoopInfo {
  id: string;
  startNodeId: string;
  endNodeId: string;
  startIndex: number;  // ✅ 新增：loop_start 节点的索引
  level: number;
  nodeIds: string[];
  iterationCount: number;
}

/**
 * 极简循环检测器 Hook
 * 适配 WorkflowNode 结构
 */
export const useLoopDetection = (nodes: WorkflowNode[]): SimpleLoopInfo[] => {
  return useMemo(() => {
    const loops: SimpleLoopInfo[] = [];
    const stack: { nodeId: string; index: number }[] = [];

    nodes.forEach((node, index) => {
      if (node.type === 'loop_start') {
        stack.push({ nodeId: node.id, index });
      } else if (node.type === 'loop_end' && stack.length > 0) {
        const start = stack.pop()!;
        const innerNodeIds = nodes.slice(start.index, index + 1).map(n => n.id);

        // 🔧 修复：从 loop_start 节点获取 loop_count，而不是 loop_end
        const startNode = nodes[start.index];
        const iterationCount = startNode.config?.loop_count || 1;

        loops.push({
          id: `loop_${start.nodeId}`,
          startNodeId: start.nodeId,
          endNodeId: node.id,
          startIndex: start.index,  // ✅ 新增
          level: stack.length,
          nodeIds: innerNodeIds,
          iterationCount
        });
      }
    });

    return loops;
  }, [nodes]);
};

export default useLoopDetection;