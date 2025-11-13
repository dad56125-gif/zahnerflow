/**
 * 连接线绑定服务
 *
 * 负责计算和管理节点间的连接线，确保连接线与节点位置完全同步
 * 替代ConnectionLines.tsx中的重复计算逻辑
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
} from './types';

export class ConnectionBindingService implements IConnectionBindingService {
  private utils: LayoutUtils;

  constructor(utils: LayoutUtils) {
    this.utils = utils;
  }

  /**
   * 计算所有连接线数据
   * 根据节点位置和布局配置生成连接线路径
   */
  calculateConnections(nodes: NodePosition[], layout: DynamicLayoutResult): ConnectionData[] {
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
   * 计算单个连接线数据
   * 支持直线和L形连接线
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
   * 计算节点连接点位置
   * 根据连接方向和行号决定连接点在节点的左侧还是右侧
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
   * 计算L形连接线的控制点
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