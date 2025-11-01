/**
 * 统一布局计算服务类型定义
 *
 * 提供Canvas节点布局和连接线计算所需的完整类型系统
 * 所有参数命名使用snake_case规范
 */

import { ElectrochemicalNode } from '../../nodes/types';

// 重新导出ElectrochemicalNode类型
export type { ElectrochemicalNode };

// 基础几何类型
export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 布局配置类型
export interface LayoutConfig {
  // 画布配置
  canvas_padding: number;
  canvas_row_height: number;

  // 节点配置
  node_default_width: number;
  node_default_height: number;
  node_min_spacing: number;

  // 连接线配置
  connection_stroke_width: number;
  connection_color: string;
  connection_arrow_size: number;
}

// 动态布局计算结果
export interface DynamicLayoutResult {
  nodes_per_row: number;
  spacing: number;
  start_x: number;
  connection_length: number;
  total_rows: number;
}

// 连接线数据类型
export interface ConnectionData {
  id: string;
  source_id: string;
  target_id: string;
  source_position: Position;
  target_position: Position;
  path_points: Position[];
  is_l_shape: boolean;
  control_point?: Position;
}

// 缓存的连接线（用于渲染优化）
export interface CachedConnection {
  id: string;
  start_x: number;
  start_y: number;
  end_x: number;
  end_y: number;
  mid_x?: number;
  mid_y?: number;
  is_l_shape: boolean;
}

// 节点位置信息
export interface NodePosition {
  id: string;
  name: string;
  position: Position;
  size: Size;
  index: number;
  row: number;
  col: number;
}

// 布局计算选项
export interface LayoutCalculationOptions {
  canvas_width: number;
  nodes: ElectrochemicalNode[];
  enable_zigzag: boolean;
  center_single_node: boolean;
}

// 连接线绑定选项
export interface ConnectionBindingOptions {
  show_arrows: boolean;
  animate_connections: boolean;
  highlight_active_connections: boolean;
}

// 布局服务接口
export interface ILayoutService {
  // 动态布局计算
  calculateDynamicLayout(options: LayoutCalculationOptions): DynamicLayoutResult;

  // 节点位置计算
  calculateNodePosition(index: number, options: LayoutCalculationOptions): Position;

  // 拖拽位置计算
  calculateNodeIndexFromPosition(position: Position, options: LayoutCalculationOptions): number;

  // 批量节点位置计算
  calculateAllNodePositions(options: LayoutCalculationOptions): NodePosition[];

  // 重新计算所有节点位置
  recalculateAllPositions(nodes: ElectrochemicalNode[], canvas_width: number): ElectrochemicalNode[];
}

// 连接线绑定服务接口
export interface IConnectionBindingService {
  // 计算连接线数据
  calculateConnections(nodes: NodePosition[], layout: DynamicLayoutResult): ConnectionData[];

  // 生成缓存连接线
  generateCachedConnections(connections: ConnectionData[]): CachedConnection[];

  // 检查连接线是否需要更新
  shouldUpdateConnections(prevNodes: ElectrochemicalNode[], currNodes: ElectrochemicalNode[]): boolean;
}

// 布局变更事件类型
export interface LayoutChangeEvent {
  type: 'node_position_changed' | 'node_added' | 'node_removed' | 'canvas_resized';
  payload: {
    affected_nodes?: string[];
    new_layout?: DynamicLayoutResult;
    canvas_size?: Size;
  };
}

// 布局服务事件监听器
export type LayoutEventListener = (event: LayoutChangeEvent) => void;

// 默认布局配置
export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  canvas_padding: 100,
  canvas_row_height: 150,
  node_default_width: 140,
  node_default_height: 60,
  node_min_spacing: 60,
  connection_stroke_width: 2,
  connection_color: 'rgba(255,255,255,0.6)',
  connection_arrow_size: 10
};

// 常用工具函数类型
export interface LayoutUtils {
  // 获取节点实际尺寸
  getNodeSize(node: ElectrochemicalNode): Size;

  // 检查位置是否在节点内
  isPositionInNode(position: Position, node: NodePosition): boolean;

  // 计算两点间距离
  calculateDistance(p1: Position, p2: Position): number;

  // 生成唯一ID
  generateUniqueId(prefix: string): string;
}