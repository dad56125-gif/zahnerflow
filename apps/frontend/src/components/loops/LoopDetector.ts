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
  startNodeId: string;
  endNodeId: string;
  nodeIds: string[];
  iterationCount: number;
  currentIteration: number;
  isActive: boolean;
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
    connections: Array<{ sourceId: string; targetId: string }>,
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
      .filter(startNode => !loops.some(loop => loop.startNodeId === startNode.id))
      .map(node => node.id);

    const orphanEndNodes = loopEndNodes
      .filter(endNode => !loops.some(loop => loop.endNodeId === endNode.id))
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
   */
  private static buildConnectionGraph(
    nodes: ElectrochemicalNode[],
    connections: Array<{ sourceId: string; targetId: string }>
  ): Map<string, string[]> {
    const graph = new Map<string, string[]>();

    // 初始化所有节点的连接列表
    nodes.forEach(node => {
      graph.set(node.id, []);
    });

    // 添加连接关系
    connections.forEach(connection => {
      const sourceConnections = graph.get(connection.sourceId) || [];
      sourceConnections.push(connection.targetId);
      graph.set(connection.sourceId, sourceConnections);
    });

    return graph;
  }

  /**
   * 检测循环结构
   */
  private static detectLoopStructures(
    loopStartNodes: ElectrochemicalNode[],
    loopEndNodes: ElectrochemicalNode[],
    connectionGraph: Map<string, string[]>,
    allNodes: ElectrochemicalNode[]
  ): LoopInfo[] {
    const loops: LoopInfo[] = [];

    for (const startNode of loopStartNodes) {
      const loopId = startNode.data.parameters?.loop_id;
      if (!loopId) {
        console.warn(`循环开始节点 ${startNode.id} 缺少 loop_id 参数`);
        continue;
      }

      // 查找对应的循环结束节点
      const endNode = loopEndNodes.find(n =>
        n.data.parameters?.loop_id === loopId
      );

      if (!endNode) {
        console.warn(`循环 ${loopId} 缺少对应的结束节点`);
        continue;
      }

      // 查找循环路径
      const loopPath = this.findLoopPath(startNode.id, endNode.id, connectionGraph);

      if (loopPath.length > 0) {
        // 获取循环参数
        const loopParams = this.extractLoopParameters(startNode, endNode);

        const loopInfo: LoopInfo = {
          id: loopId,
          startNodeId: startNode.id,
          endNodeId: endNode.id,
          nodeIds: loopPath,
          iterationCount: loopParams.iteration_count || 1,
          currentIteration: 0,
          isActive: false,
          parameters: loopParams
        };

        loops.push(loopInfo);
      }
    }

    return loops;
  }

  /**
   * 查找循环路径
   */
  private static findLoopPath(
    startNodeId: string,
    endNodeId: string,
    connectionGraph: Map<string, string[]>
  ): string[] {
    const visited = new Set<string>();
    const path: string[] = [];

    const dfs = (currentNodeId: string): boolean => {
      if (visited.has(currentNodeId)) {
        return false; // 检测到环路
      }

      visited.add(currentNodeId);
      path.push(currentNodeId);

      if (currentNodeId === endNodeId) {
        return true; // 找到目标节点
      }

      const nextNodes = connectionGraph.get(currentNodeId) || [];
      for (const nextNode of nextNodes) {
        if (dfs(nextNode)) {
          return true;
        }
      }

      path.pop();
      return false;
    };

    if (dfs(startNodeId)) {
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
        loop.nodeIds.includes(otherLoop.startNodeId)
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
      for (let i = 0; i < loop.nodeIds.length - 1; i++) {
        const currentNode = loop.nodeIds[i];
        const nextNode = loop.nodeIds[i + 1];
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
    const activeLoops = loops.filter(loop => loop.isActive).length;
    const totalIterations = loops.reduce((sum, loop) => sum + loop.iterationCount, 0);
    const completedIterations = loops.reduce((sum, loop) => sum + loop.currentIteration, 0);
    const averageIterations = totalLoops > 0 ? totalIterations / totalLoops : 0;

    // 按迭代次数分组
    const loopsByIterationCount: Record<number, number> = {};
    loops.forEach(loop => {
      const count = loopsByIterationCount[loop.iterationCount] || 0;
      loopsByIterationCount[loop.iterationCount] = count + 1;
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
    const startNode = nodes.find(n => n.id === loop.startNodeId);
    const endNode = nodes.find(n => n.id === loop.endNodeId);

    if (!startNode) {
      errors.push(`循环开始节点 ${loop.startNodeId} 不存在`);
    }

    if (!endNode) {
      errors.push(`循环结束节点 ${loop.endNodeId} 不存在`);
    }

    // 验证迭代次数
    if (loop.iterationCount <= 0) {
      errors.push(`循环迭代次数必须大于0，当前值: ${loop.iterationCount}`);
    }

    if (loop.iterationCount > 10000) {
      warnings.push(`循环迭代次数过大 (${loop.iterationCount})，可能导致性能问题`);
    }

    // 验证循环路径
    if (loop.nodeIds.length < 2) {
      errors.push(`循环路径必须包含至少2个节点，当前: ${loop.nodeIds.length}`);
    }

    if (!loop.nodeIds.includes(loop.startNodeId)) {
      errors.push(`循环路径不包含开始节点 ${loop.startNodeId}`);
    }

    if (!loop.nodeIds.includes(loop.endNodeId)) {
      errors.push(`循环路径不包含结束节点 ${loop.endNodeId}`);
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

    return nodes.filter(node => loop.nodeIds.includes(node.id));
  }

  /**
   * 检查节点是否在循环中
   */
  public static isNodeInLoop(
    nodeId: string,
    loops: LoopInfo[]
  ): { isInLoop: boolean; loopIds: string[] } {
    const loopIds = loops
      .filter(loop => loop.nodeIds.includes(nodeId))
      .map(loop => loop.id);

    return {
      isInLoop: loopIds.length > 0,
      loopIds
    };
  }
}

export default LoopDetector;