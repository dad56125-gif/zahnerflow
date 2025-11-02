/**
 * 循环检测器
 *
 * 负责检测节点之间的循环关系，识别循环的开始和结束节点
 * 提供循环结构分析和验证功能
 */

import { ElectrochemicalNode, NodeType } from '../../nodes/types';

// 循环信息接口
export interface LoopInfo {
  id: string;
  start_node_id: string;
  end_node_id: string;
  node_ids: string[];
  iteration_count: number;
  current_iteration: number;
  is_active: boolean;
  parameters: Record<string, any>;
}

// 循环检测结果接口
export interface LoopDetectionResult {
  loops: LoopInfo[];
  orphanStartNodes: string[]; // 孤立的循环开始节点
  orphanEndNodes: string[];   // 孤立的循环结束节点
  nestedLoops: string[];      // 嵌套循环的循环ID
  invalidConnections: string[]; // 无效的循环连接
}

// 循环配置接口
export interface LoopConfig {
  maxIterations: number;
  allowNestedLoops: boolean;
  validateLoopIntegrity: boolean;
}

/**
 * 循环检测器类
 */
export class LoopDetector {
  private static readonly DEFAULT_CONFIG: LoopConfig = {
    maxIterations: 1000,
    allowNestedLoops: true,
    validateLoopIntegrity: true
  };

  /**
   * 检测工作流中的所有循环
   */
  public static detectLoops(
    nodes: ElectrochemicalNode[],
    connections: Array<{ source_id: string; target_id: string }>,
    config: Partial<LoopConfig> = {}
  ): LoopDetectionResult {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };

    // 获取所有循环节点
    const loopStartNodes = nodes.filter(n => n.type === 'loop_start');
    const loopEndNodes = nodes.filter(n => n.type === 'loop_end');

    // 构建节点连接图
    const connectionGraph = this.buildConnectionGraph(nodes, connections);

    // 检测循环
    const loops = this.detectLoopStructures(loopStartNodes, loopEndNodes, connectionGraph, nodes);

    // 验证循环完整性
    const orphanStartNodes = loopStartNodes
      .filter(startNode => !loops.some(loop => loop.start_node_id === startNode.id))
      .map(node => node.id);

    const orphanEndNodes = loopEndNodes
      .filter(endNode => !loops.some(loop => loop.end_node_id === endNode.id))
      .map(node => node.id);

    // 检测嵌套循环
    const nestedLoops = this.detectNestedLoops(loops, connectionGraph);

    // 验证循环连接有效性
    const invalidConnections = this.validateLoopConnections(loops, connectionGraph);

    return {
      loops,
      orphanStartNodes,
      orphanEndNodes,
      nestedLoops,
      invalidConnections
    };
  }

  /**
   * 构建节点连接图
   * 修正：根据实际的连接线结构构建连接图
   */
  private static buildConnectionGraph(
    nodes: ElectrochemicalNode[],
    connections: any[] // 可以是任意类型的连接数据
  ): Map<string, string[]> {
    const graph = new Map<string, string[]>();

    // 初始化所有节点的连接列表
    nodes.forEach(node => {
      graph.set(node.id, []);
    });

    // 处理连接数据 - 统一使用snake_case格式
    if (connections && connections.length > 0) {
      connections.forEach(connection => {
        let sourceId: string | undefined;
        let targetId: string | undefined;

        // 标准的连接对象 { source_id, target_id }
        if (typeof connection === 'object' && connection !== null) {
          sourceId = connection.source_id;
          targetId = connection.target_id;

          // 连接线缓存数据格式 { id, start_x, start_y, end_x, end_y }
          if (!sourceId && !targetId && 'id' in connection && connection.id.includes('connection-')) {
            const idParts = connection.id.split('-');
            if (idParts.length >= 3) {
              sourceId = idParts[1];
              targetId = idParts[2];
            }
          }
        }

        // 如果找到了有效的源和目标节点，添加到图中
        if (sourceId && targetId && sourceId !== targetId) {
          const sourceConnections = graph.get(sourceId) || [];
          if (!sourceConnections.includes(targetId)) {
            sourceConnections.push(targetId);
            graph.set(sourceId, sourceConnections);
          }
        }
      });
    }

    // 如果没有连接数据，按照节点顺序构建连接（像连接线服务那样）
    if (graph.size === 0 || Array.from(graph.values()).every(connections => connections.length === 0)) {
      // no explicit connections; build graph by node order

      // 建立节点ID到索引的映射
      const nodeIndexMap = new Map<string, number>();
      nodes.forEach((node, index) => {
        nodeIndexMap.set(node.id, index);
      });

      // 按顺序连接相邻节点
      for (let i = 0; i < nodes.length - 1; i++) {
        const currentNode = nodes[i];
        const nextNode = nodes[i + 1];

        if (currentNode && nextNode) {
          const connections = graph.get(currentNode.id) || [];
          connections.push(nextNode.id);
          graph.set(currentNode.id, connections);
        }
      }
    }

    return graph;
  }

  /**
   * 检测循环结构
   * 修正：循环应该经过所有中间节点，而不是直接从start跳到end
   */
  private static detectLoopStructures(
    loopStartNodes: ElectrochemicalNode[],
    loopEndNodes: ElectrochemicalNode[],
    connectionGraph: Map<string, string[]>,
    allNodes: ElectrochemicalNode[]
  ): LoopInfo[] {
    const loops: LoopInfo[] = [];

    // 首先建立节点ID到索引的映射，用于确定节点顺序
    const nodeIndexMap = new Map<string, number>();
    allNodes.forEach((node, index) => {
      nodeIndexMap.set(node.id, index);
    });

    for (const startNode of loopStartNodes) {
      const loopId = startNode.data.parameters?.loop_id;
      if (!loopId) {
        // skip invalid start node without loop_id
        continue;
      }

      // 查找对应的循环结束节点
      const endNode = loopEndNodes.find(n =>
        n.data.parameters?.loop_id === loopId
      );

      if (!endNode) {
        // skip if no matching end node
        continue;
      }

      // 查找前向循环路径：start → 中间节点 → end
      const forwardPath = this.findForwardLoopPath(startNode.id, endNode.id, connectionGraph, nodeIndexMap);

      if (forwardPath.length > 0) {
        // 直接使用前向路径作为循环路径（不需要显式返回连接）
        // 在实际执行中，循环会自动从end回到下一个节点或start

        // 获取循环参数
        const loopParams = this.extractLoopParameters(startNode, endNode);

        const loopInfo: LoopInfo = {
          id: loopId,
          start_node_id: startNode.id,
          end_node_id: endNode.id,
          node_ids: forwardPath, // 包含所有中间节点的路径
          iteration_count: loopParams.iteration_count || 1,
          current_iteration: 0,
          is_active: false,
          parameters: loopParams
        };

        loops.push(loopInfo);
        // detected loop
      }
    }

    return loops;
  }

  /**
   * 查找前向循环路径：从start到end，经过所有中间节点
   * 参考连接线的顺序连接方式
   */
  private static findForwardLoopPath(
    start_node_id: string,
    end_node_id: string,
    connectionGraph: Map<string, string[]>,
    nodeIndexMap: Map<string, number>
  ): string[] {
    const visited = new Set<string>();
    const path: string[] = [];

    const dfs = (currentNodeId: string): boolean => {
      if (visited.has(currentNodeId)) {
        return false; // 检测到环路
      }

      visited.add(currentNodeId);
      path.push(currentNodeId);

      if (currentNodeId === end_node_id) {
        return true; // 找到目标节点
      }

      // 获取下一个节点，按照节点索引排序，确保顺序正确
      const nextNodes = connectionGraph.get(currentNodeId) || [];
      const sortedNextNodes = nextNodes
        .map(nodeId => ({ nodeId, index: nodeIndexMap.get(nodeId) || Infinity }))
        .filter(node => node.index !== Infinity)
        .sort((a, b) => a.index - b.index)
        .map(node => node.nodeId);

      for (const nextNode of sortedNextNodes) {
        if (dfs(nextNode)) {
          return true;
        }
      }

      path.pop();
      return false;
    };

    if (dfs(start_node_id)) {
      return path;
    }

    return [];
  }

  
  /**
   * 提取循环参数
   */
  private static extractLoopParameters(
    startNode: ElectrochemicalNode,
    endNode: ElectrochemicalNode
  ): Record<string, any> {
    const startParams = startNode.data.parameters || {};
    const endParams = endNode.data.parameters || {};

    return {
      loop_id: startParams.loop_id || endParams.loop_id,
      iteration_count: parseInt(startParams.iteration_count) || 1,
      delay_ms: parseInt(startParams.delay_ms) || 0,
      break_condition: startParams.break_condition || null,
      continue_condition: startParams.continue_condition || null,
      data_accumulation: startParams.data_accumulation || 'all',
      export_format: startParams.export_format || 'csv'
    };
  }

  /**
   * 检测嵌套循环
   */
  private static detectNestedLoops(
    loops: LoopInfo[],
    connectionGraph: Map<string, string[]>
  ): string[] {
    const nestedLoops: string[] = [];

    for (const loop of loops) {
      // 检查循环内部是否包含其他循环的开始节点
      const innerLoopStarts = loops.filter(otherLoop =>
        otherLoop.id !== loop.id &&
        loop.node_ids.includes(otherLoop.start_node_id)
      );

      if (innerLoopStarts.length > 0) {
        nestedLoops.push(loop.id);
      }
    }

    return nestedLoops;
  }

  /**
   * 验证循环连接
   */
  private static validateLoopConnections(
    loops: LoopInfo[],
    connectionGraph: Map<string, string[]>
  ): string[] {
    const invalidConnections: string[] = [];

    for (const loop of loops) {
      // 验证循环路径的完整性
      for (let i = 0; i < loop.node_ids.length - 1; i++) {
        const currentNode = loop.node_ids[i];
        const nextNode = loop.node_ids[i + 1];
        const connections = connectionGraph.get(currentNode) || [];

        if (!connections.includes(nextNode)) {
          invalidConnections.push(`${currentNode} -> ${nextNode}`);
        }
      }
    }

    return invalidConnections;
  }

  /**
   * 获取循环的统计信息
   */
  public static getLoopStatistics(
    loops: LoopInfo[]
  ): {
    totalLoops: number;
    activeLoops: number;
    totalIterations: number;
    completedIterations: number;
    averageIterations: number;
    loopsByIterationCount: Record<number, number>;
  } {
    const totalLoops = loops.length;
    const activeLoops = loops.filter(loop => loop.is_active).length;
    const totalIterations = loops.reduce((sum, loop) => sum + loop.iteration_count, 0);
    const completedIterations = loops.reduce((sum, loop) => sum + loop.current_iteration, 0);
    const averageIterations = totalLoops > 0 ? totalIterations / totalLoops : 0;

    // 按迭代次数分组
    const loopsByIterationCount: Record<number, number> = {};
    loops.forEach(loop => {
      const count = loopsByIterationCount[loop.iteration_count] || 0;
      loopsByIterationCount[loop.iteration_count] = count + 1;
    });

    return {
      totalLoops,
      activeLoops,
      totalIterations,
      completedIterations,
      averageIterations,
      loopsByIterationCount
    };
  }

  /**
   * 验证单个循环的合法性
   */
  public static validateLoop(
    loop: LoopInfo,
    nodes: ElectrochemicalNode[]
  ): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 验证节点存在性
    const startNode = nodes.find(n => n.id === loop.start_node_id);
    const endNode = nodes.find(n => n.id === loop.end_node_id);

    if (!startNode) {
      errors.push(`循环开始节点 ${loop.start_node_id} 不存在`);
    }

    if (!endNode) {
      errors.push(`循环结束节点 ${loop.end_node_id} 不存在`);
    }

    // 验证迭代次数
    if (loop.iteration_count <= 0) {
      errors.push(`循环迭代次数必须大于0，当前值: ${loop.iteration_count}`);
    }

    if (loop.iteration_count > 10000) {
      warnings.push(`循环迭代次数过大 (${loop.iteration_count})，可能导致性能问题`);
    }

    // 验证循环路径
    if (loop.node_ids.length < 2) {
      errors.push(`循环路径必须包含至少2个节点，当前: ${loop.node_ids.length}`);
    }

    if (!loop.node_ids.includes(loop.start_node_id)) {
      errors.push(`循环路径不包含开始节点 ${loop.start_node_id}`);
    }

    if (!loop.node_ids.includes(loop.end_node_id)) {
      errors.push(`循环路径不包含结束节点 ${loop.end_node_id}`);
    }

    // 验证参数
    if (loop.parameters.delay_ms && loop.parameters.delay_ms < 0) {
      errors.push(`循环延迟时间不能为负数，当前值: ${loop.parameters.delay_ms}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 更新循环状态
   */
  public static updateLoopState(
    loopId: string,
    updates: Partial<LoopInfo>,
    loops: LoopInfo[]
  ): LoopInfo[] {
    return loops.map(loop => {
      if (loop.id === loopId) {
        return { ...loop, ...updates };
      }
      return loop;
    });
  }

  /**
   * 获取循环中的所有节点
   */
  public static getLoopNodes(
    loopId: string,
    loops: LoopInfo[],
    nodes: ElectrochemicalNode[]
  ): ElectrochemicalNode[] {
    const loop = loops.find(l => l.id === loopId);
    if (!loop) {
      return [];
    }

    return nodes.filter(node => loop.node_ids.includes(node.id));
  }

  /**
   * 检查节点是否在循环中
   */
  public static isNodeInLoop(
    nodeId: string,
    loops: LoopInfo[]
  ): { isInLoop: boolean; loopIds: string[] } {
    const loopIds = loops
      .filter(loop => loop.node_ids.includes(nodeId))
      .map(loop => loop.id);

    return {
      isInLoop: loopIds.length > 0,
      loopIds
    };
  }
}

export default LoopDetector;
