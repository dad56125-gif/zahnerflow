/**
 * 连接线绑定服务 - 重构版本
 *
 * 专注于连接线数据转换和缓存，移除重复计算逻辑
 * 使用统一layout提供的预计算连接点（ComputedEdge格式）
 * 保持向后兼容性，支持现有API接口
 */

import {
  ElectrochemicalNode,
  Position,
  NodePosition,
  DynamicLayoutResult,
  ConnectionData,
  CachedConnection,
  ConnectionBindingOptions,
  IConnectionBindingService,
  LayoutUtils
} from '../services/layout/types';
import { ComputedEdge } from './LayoutConfig';

export class ConnectionBindingService implements IConnectionBindingService {
  private utils: LayoutUtils;

  constructor(utils: LayoutUtils) {
    this.utils = utils;
  }

  /**
   * 【新方法】从ComputedEdge数组转换连接线数据
   * 使用统一layout提供的预计算连接点，避免重复计算
   */
  convertFromComputedEdges(computedEdges: ComputedEdge[]): ConnectionData[] {
    return computedEdges.map(edge => this.convertSingleEdge(edge));
  }

  /**
   * 【兼容性方法】计算所有连接线数据（保持向后兼容）
   * 为了兼容现有代码，保留此方法但标记为deprecated
   * @deprecated 建议使用 convertFromComputedEdges 方法
   */
  calculateConnections(nodes: NodePosition[], layout: DynamicLayoutResult): ConnectionData[] {
    console.warn('ConnectionBindingService.calculateConnections is deprecated. Consider using convertFromComputedEdges for better performance.');

    const connections: ConnectionData[] = [];

    for (let i = 0; i < nodes.length - 1; i++) {
      const source_node = nodes[i];
      const target_node = nodes[i + 1];

      if (!source_node || !target_node) continue;

      const connection_data = this.calculateSingleConnection(
        source_node,
        target_node,
        layout,
        i
      );

      if (connection_data) {
        connections.push(connection_data);
      }
    }

    return connections;
  }

  /**
   * 将单个ComputedEdge转换为ConnectionData格式
   */
  private convertSingleEdge(edge: ComputedEdge): ConnectionData {
    const is_l_shape = edge.type === 'smoothstep';
    const path_points = [edge.sourcePosition, edge.targetPosition];

    // 如果是L形连接，需要确定控制点
    let control_point: Position | undefined;
    if (is_l_shape) {
      // 🎯 核心修复：根据源节点是否在奇数行决定控制点方向
      // 奇数行从左到右，向右延伸；偶数行从右到左，向左延伸
      const controlX = edge.sourcePosition.x + (edge.layoutMeta?.sourceIsInOddRow ? 30 : -30);
      control_point = {
        x: controlX,
        y: edge.targetPosition.y
      };
      // 重新构造path_points为三段式路径
      path_points.splice(1, 0, control_point);
    }

    return {
      id: edge.id.replace('edge-', 'connection-'), // 统一ID格式
      source_id: edge.source,
      target_id: edge.target,
      source_position: edge.sourcePosition,
      target_position: edge.targetPosition,
      path_points: path_points,
      is_l_shape: is_l_shape,
      control_point: control_point
    };
  }

  /**
   * 【兼容性方法】计算单个连接线数据（保持向后兼容）
   * @deprecated 保留用于兼容性，但建议使用新的转换方法
   */
  private calculateSingleConnection(
    source_node: NodePosition,
    target_node: NodePosition,
    layout: DynamicLayoutResult,
    index: number
  ): ConnectionData | null {
    const source_row = source_node.row;
    const target_row = target_node.row;
    const is_same_row = source_row === target_row;

    // 计算连接点位置
    const source_position = this.calculateConnectionPoint(source_node, is_same_row);
    const target_position = this.calculateConnectionPoint(target_node, is_same_row, true);

    const connection_id = `connection-${source_node.id}-${target_node.id}`;

    if (is_same_row) {
      // 同行直线连接
      return {
        id: connection_id,
        source_id: source_node.id,
        target_id: target_node.id,
        source_position: source_position,
        target_position: target_position,
        path_points: [source_position, target_position],
        is_l_shape: false
      };
    } else {
      // 跨行L形连接
      const control_point = this.calculateControlPoint(
        source_position,
        target_position,
        source_node,
        target_node,
        layout
      );

      return {
        id: connection_id,
        source_id: source_node.id,
        target_id: target_node.id,
        source_position: source_position,
        target_position: target_position,
        path_points: [source_position, control_point, target_position],
        is_l_shape: true,
        control_point: control_point
      };
    }
  }

  /**
   * 【兼容性方法】计算节点连接点位置
   * @deprecated 保留用于兼容性
   */
  private calculateConnectionPoint(
    node: NodePosition,
    is_same_row: boolean,
    is_target: boolean = false
  ): Position {
    const node_center_y = node.position.y + node.size.height / 2;

    if (is_same_row) {
      // 同行连接：根据行号奇偶性决定连接方向
      const is_left_to_right = node.row % 2 === 0;

      if (is_target) {
        // 目标节点：与源节点方向相反
        return {
          x: is_left_to_right ? node.position.x : node.position.x + node.size.width,
          y: node_center_y
        };
      } else {
        // 源节点
        return {
          x: is_left_to_right ? node.position.x + node.size.width : node.position.x,
          y: node_center_y
        };
      }
    } else {
      // 跨行连接：源节点和目标节点都根据行号决定方向
      if (is_target) {
        const is_target_left_to_right = node.row % 2 === 0;
        return {
          x: is_target_left_to_right ? node.position.x : node.position.x + node.size.width,
          y: node_center_y
        };
      } else {
        // 源节点根据行号决定方向
        const is_source_left_to_right = node.row % 2 === 0;
        return {
          x: is_source_left_to_right ? node.position.x + node.size.width : node.position.x,
          y: node_center_y
        };
      }
    }
  }

  /**
   * 【兼容性方法】计算L形连接线的控制点
   * @deprecated 保留用于兼容性
   */
  private calculateControlPoint(
    source_position: Position,
    target_position: Position,
    source_node: NodePosition,
    target_node: NodePosition,
    layout: DynamicLayoutResult
  ): Position {
    // 控制点的X坐标：根据源节点行号决定延伸方向
    const is_source_left_to_right = source_node.row % 2 === 0;
    const control_x = is_source_left_to_right
      ? source_position.x + layout.connection_length  // 偶数行：向右延伸
      : source_position.x - layout.connection_length; // 奇数行：向左延伸

    // 控制点的Y坐标：与目标节点Y坐标对齐
    const control_y = target_position.y;

    return {
      x: control_x,
      y: control_y
    };
  }

  /**
   * 生成用于渲染的缓存连接线数据
   * 简化ConnectionLines组件的数据结构
   */
  generateCachedConnections(connections: ConnectionData[]): CachedConnection[] {
    return connections.map(conn => {
      if (conn.is_l_shape && conn.control_point) {
        // L形连接线
        return {
          id: conn.id,
          start_x: conn.source_position.x,
          start_y: conn.source_position.y,
          end_x: conn.target_position.x,
          end_y: conn.target_position.y,
          mid_x: conn.control_point.x,
          mid_y: conn.control_point.y,
          is_l_shape: true
        };
      } else {
        // 直线连接
        return {
          id: conn.id,
          start_x: conn.source_position.x,
          start_y: conn.source_position.y,
          end_x: conn.target_position.x,
          end_y: conn.target_position.y,
          is_l_shape: false
        };
      }
    });
  }

  /**
   * 【新方法】直接从ComputedEdge生成缓存连接线
   * 避免中间转换步骤，提升性能
   */
  generateCachedConnectionsFromEdges(computedEdges: ComputedEdge[]): CachedConnection[] {
    return computedEdges.map(edge => {
      const is_l_shape = edge.type === 'smoothstep';

      if (is_l_shape) {
        // L形连接线：需要计算控制点
        // 🎯 核心修复：根据源节点是否在奇数行决定控制点方向
        // 奇数行从左到右，向右延伸；偶数行从右到左，向左延伸
        const controlX = edge.sourcePosition.x + (edge.layoutMeta?.sourceIsInOddRow ? 30 : -30);
        return {
          id: edge.id,
          start_x: edge.sourcePosition.x,
          start_y: edge.sourcePosition.y,
          end_x: edge.targetPosition.x,
          end_y: edge.targetPosition.y,
          mid_x: controlX,
          mid_y: edge.targetPosition.y,
          is_l_shape: true
        };
      } else {
        // 直线连接
        return {
          id: edge.id,
          start_x: edge.sourcePosition.x,
          start_y: edge.sourcePosition.y,
          end_x: edge.targetPosition.x,
          end_y: edge.targetPosition.y,
          is_l_shape: false
        };
      }
    });
  }

  /**
   * 检查连接线是否需要更新
   * 优化渲染性能，避免不必要的重新计算
   */
  shouldUpdateConnections(prev_nodes: ElectrochemicalNode[], curr_nodes: ElectrochemicalNode[]): boolean {
    // 节点数量变化
    if (prev_nodes.length !== curr_nodes.length) {
      return true;
    }

    // 节点位置变化
    for (let i = 0; i < curr_nodes.length; i++) {
      const prev_node = prev_nodes[i];
      const curr_node = curr_nodes[i];

      if (!prev_node || !curr_node) {
        return true;
      }

      if (prev_node.position.x !== curr_node.position.x ||
          prev_node.position.y !== curr_node.position.y) {
        return true;
      }

      // 节点尺寸变化
      const prev_width = prev_node.style?.width || 140;
      const curr_width = curr_node.style?.width || 140;
      const prev_height = prev_node.style?.height || 60;
      const curr_height = curr_node.style?.height || 60;

      if (prev_width !== curr_width || prev_height !== curr_height) {
        return true;
      }

      // 节点状态变化
      if (prev_node.status !== curr_node.status) {
        return true;
      }
    }

    return false;
  }

  /**
   * 【新方法】检查ComputedEdge是否需要更新
   * 基于节点数据直接判断，避免重复计算
   */
  shouldUpdateEdges(prev_edges: ComputedEdge[], curr_edges: ComputedEdge[]): boolean {
    // 边数量变化
    if (prev_edges.length !== curr_edges.length) {
      return true;
    }

    // 检查每条边的关键属性
    for (let i = 0; i < curr_edges.length; i++) {
      const prev_edge = prev_edges[i];
      const curr_edge = curr_edges[i];

      if (!prev_edge || !curr_edge) {
        return true;
      }

      // 检查连接点位置变化
      if (prev_edge.sourcePosition.x !== curr_edge.sourcePosition.x ||
          prev_edge.sourcePosition.y !== curr_edge.sourcePosition.y ||
          prev_edge.targetPosition.x !== curr_edge.targetPosition.x ||
          prev_edge.targetPosition.y !== curr_edge.targetPosition.y) {
        return true;
      }

      // 检查连接类型变化
      if (prev_edge.type !== curr_edge.type) {
        return true;
      }
    }

    return false;
  }

  /**
   * 【新方法】获取连接线统计信息
   * 用于性能监控和调试
   */
  getConnectionStats(edges: ComputedEdge[]): {
    total: number;
    straight: number;
    lShape: number;
    animated: number;
  } {
    return edges.reduce((stats, edge) => {
      stats.total++;
      if (edge.type === 'straight') {
        stats.straight++;
      } else if (edge.type === 'smoothstep') {
        stats.lShape++;
      }
      if (edge.animated) {
        stats.animated++;
      }
      return stats;
    }, { total: 0, straight: 0, lShape: 0, animated: 0 });
  }

  /**
   * 创建布局工具函数实例
   */
  static createDefaultUtils(): LayoutUtils {
    return {
      getNodeSize: (node: ElectrochemicalNode) => ({
        width: node.style?.width || 140,
        height: node.style?.height || 60
      }),

      isPositionInNode: (position: Position, node: NodePosition): boolean => {
        return position.x >= node.position.x &&
               position.x <= node.position.x + node.size.width &&
               position.y >= node.position.y &&
               position.y <= node.position.y + node.size.height;
      },

      calculateDistance: (p1: Position, p2: Position): number => {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
      },

      generateUniqueId: (prefix: string): string => {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      }
    };
  }
}

// 导出单例实例
export const connection_binding_service = new ConnectionBindingService(
  ConnectionBindingService.createDefaultUtils()
);

/**
 * 【兼容性导出】便捷函数：直接从ComputedEdge生成缓存连接线
 * 为使用统一布局的组件提供简化的API
 */
export function generateCachedConnectionsFromLayout(
  computedEdges: ComputedEdge[]
): CachedConnection[] {
  return connection_binding_service.generateCachedConnectionsFromEdges(computedEdges);
}

/**
 * 【兼容性导出】便捷函数：将ComputedEdge转换为ConnectionData
 * 保持与现有代码的兼容性
 */
export function convertComputedEdgesToConnections(
  computedEdges: ComputedEdge[]
): ConnectionData[] {
  return connection_binding_service.convertFromComputedEdges(computedEdges);
}

/**
 * 【兼容性导出】便捷函数：检查边数据是否需要更新
 * 提供基于ComputedEdge的性能优化
 */
export function shouldUpdateConnectionEdges(
  prevEdges: ComputedEdge[],
  currEdges: ComputedEdge[]
): boolean {
  return connection_binding_service.shouldUpdateEdges(prevEdges, currEdges);
}