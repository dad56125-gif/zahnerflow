/**
 * 极简循环检测器 Hook
 *
 * 完全复刻后端逻辑：
 * - 基于数组遍历 + 栈配对
 * - 不关心连线拓扑，只关心节点顺序
 * - 与后端 buildLoopBoundaries 方法 100% 一致
 */

import { useMemo } from 'react';
import { ElectrochemicalNode } from '../types/types';

export interface SimpleLoopInfo {
  id: string;
  startNodeId: string;
  endNodeId: string;
  level: number; // 嵌套层级
  // 前端可视化所需的额外字段
  nodeIds: string[];
  iterationCount: number;
}

/**
 * Hook：检测工作流中的循环结构
 * @param nodes 节点数组
 * @returns 循环信息数组
 */
export const useSimpleLoopDetection = (nodes: ElectrochemicalNode[]): SimpleLoopInfo[] => {
  return useMemo(() => {
    const loops: SimpleLoopInfo[] = [];
    const stack: { nodeId: string; index: number }[] = [];

    // 遍历节点数组，遇到 loop_start 入栈，loop_end 出栈配对
    nodes.forEach((node, index) => {
      if (node.type === 'loop_start') {
        stack.push({ nodeId: node.id, index });
      } else if (node.type === 'loop_end' && stack.length > 0) {
        const start = stack.pop()!;
        // 收集循环内的节点ID
        const innerNodeIds = nodes.slice(start.index, index + 1).map(n => n.id);
        // 从节点参数中获取循环次数
        const iterationCount = node.data?.parameters?.loop_count || 1;

        loops.push({
          id: `loop_${start.nodeId}`,
          startNodeId: start.nodeId,
          endNodeId: node.id,
          level: stack.length, // 当前栈深度 = 嵌套层级
          nodeIds: innerNodeIds,
          iterationCount
        });
      }
    });

    return loops;
  }, [nodes]);
};

export default useSimpleLoopDetection;
