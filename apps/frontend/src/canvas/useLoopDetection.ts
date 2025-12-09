// --- START OF FILE apps/frontend/src/hooks/useSimpleLoopDetection.ts ---

import { useMemo } from 'react';
import { WorkflowNode } from '../types/Interfaces';

export interface SimpleLoopInfo {
  id: string;
  startNodeId: string;
  endNodeId: string;
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

        // 适配新结构：config 代替 data.parameters
        const iterationCount = node.config?.loop_count || 1;

        loops.push({
          id: `loop_${start.nodeId}`,
          startNodeId: start.nodeId,
          endNodeId: node.id,
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