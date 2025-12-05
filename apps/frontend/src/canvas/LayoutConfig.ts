/**
 * 统一布局配置与类型定义 (极简版)
 * 文件位置: src/services/layout/LayoutConfig.ts
 * 
 * 只保留"动态响应式蛇形布局"所需的配置和类型
 */

import { ElectrochemicalNode } from '../types/nodes';

// =============================================================================
// 1. 基础几何类型
// =============================================================================

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

// =============================================================================
// 2. 统一布局配置
// =============================================================================

export interface StartOffset {
  x: number;
  y: number;
}

export interface ResponsiveParams {
  canvasWidth: number;
  zoomLevel: number;
  nodeCount: number;
}

export interface DynamicCalculationResult {
  optimalColumns: number;
  adjustedNodeWidth: number;
  adjustedSpacing: number;
  effectiveContainerWidth: number;
}

/**
 * 布局配置接口
 * (已移除 mode 字段，因为现在只有一种布局方式)
 */
export interface LayoutConfig {
  /** 固定列数配置 (undefined 表示动态计算) */
  columns?: number;

  // 节点基础尺寸配置
  nodeWidth: number;
  nodeHeight: number;
  rowHeight: number;
  spacing: number;
  segmentLength: number;

  // 响应式布局边界配置
  minColumns: number;
  maxColumns: number;
  minNodeWidth: number;
  containerPadding: number;

  // 缩放适配配置
  zoomAware: boolean;
  maxZoomLevel: number;
  minZoomLevel: number;

  // 起始偏移配置
  startOffset: StartOffset;
}

/**
 * 默认布局配置
 */
export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  columns: undefined,
  nodeWidth: 200,
  nodeHeight: 60,
  rowHeight: 100,
  spacing: 40,
  segmentLength: 30,
  minColumns: 2,
  maxColumns: 8,
  minNodeWidth: 140,
  containerPadding: 50,
  zoomAware: true,
  maxZoomLevel: 1.2,
  minZoomLevel: 0.6,
  startOffset: { x: 50, y: 50 }
};

// =============================================================================
// 3. 计算结果与连接线类型
// =============================================================================

export interface ComputedEdge {
  id: string;
  source: string;
  target: string;
  type?: 'straight' | 'smoothstep' | 'default';
  sourcePosition: Position;
  targetPosition: Position;
  layoutMeta?: {
    sourceIsInOddRow: boolean;
    targetIsInOddRow: boolean;
  };
  sourceDir?: 1 | -1;
  targetDir?: 1 | -1;
  animated?: boolean;
  style?: React.CSSProperties;
  label?: string;
}

// 缓存连接线（用于 LoopBoundary 等辅助计算）
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

// 兼容性接口
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

export interface LayoutResult {
  layoutNodes: Array<ElectrochemicalNode & {
    layoutMeta?: {
      index: number;
      row: number;
      col: number;
      isLeftToRight: boolean;
      isInOddRow: boolean;
      width: number;
      columns: number;
      [key: string]: any;
    };
    [key: string]: any;
  }>;
  layoutEdges: ComputedEdge[];
  actualColumns: number;
  adjustedDimensions: {
    nodeWidth: number;
    nodeHeight: number;
    spacing: number;
    segmentLength: number;
  };
}

// =============================================================================
// 4. 工具函数
// =============================================================================

export interface LayoutUtils {
  getNodeSize(node: ElectrochemicalNode): Size;
  isPositionInNode(position: Position, node: any): boolean;
  calculateDistance(p1: Position, p2: Position): number;
  generateUniqueId(prefix: string): string;
}

export interface IConnectionBindingService {
  convertFromComputedEdges(computedEdges: ComputedEdge[]): ConnectionData[];
  generateCachedConnectionsFromEdges(computedEdges: ComputedEdge[]): CachedConnection[];
  shouldUpdateConnections(prevNodes: ElectrochemicalNode[], currNodes: ElectrochemicalNode[]): boolean;
}

export function calculateDynamicColumns(
  params: ResponsiveParams,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): DynamicCalculationResult {
  const { canvasWidth, zoomLevel, nodeCount } = params;

  // 🔥🔥🔥 核心修正 1：计算逻辑上的可用宽度 🔥🔥🔥
  // 如果缩放是 0.5，逻辑宽度就是原来的 2 倍
  const logicalCanvasWidth = canvasWidth / zoomLevel;

  const effectiveContainerWidth = logicalCanvasWidth - config.containerPadding * 2;
  
  // 1. 基于"逻辑宽度"计算一行能塞下多少个节点
  const maxColumnsByWidth = Math.floor(
    (effectiveContainerWidth + config.spacing) / (config.nodeWidth + config.spacing)
  );

  // 2. 基于节点数量的理想列数 (开方)
  const optimalColumnsByCount = nodeCount <= 4 ? nodeCount : Math.ceil(Math.sqrt(nodeCount));
  
  // 3. 取两者较小值 (既不要撑破屏幕，也不要太扁)
  // 这里可以放宽策略：如果节点很多，优先撑满屏幕宽度
  let optimalColumns = Math.min(maxColumnsByWidth, optimalColumnsByCount);

  // 🎯 优化体验：当缩小很多(zoom < 1)时，往往是想看全局，倾向于让它变得更宽
  if (zoomLevel < 1.0) {
      // 允许列数接近物理极限，展示更宽的视图
      optimalColumns = maxColumnsByWidth;
  }

  // 4. 应用边界限制
  optimalColumns = Math.max(config.minColumns, Math.min(config.maxColumns, optimalColumns));

  // 5. 计算调整后的尺寸
  const adjustedSpacing = config.spacing;
  const adjustedNodeWidth = Math.max(
    config.minNodeWidth,
    (effectiveContainerWidth - (optimalColumns - 1) * adjustedSpacing) / optimalColumns
  );

  return {
    optimalColumns,
    adjustedNodeWidth,
    adjustedSpacing,
    effectiveContainerWidth
  };
}

export function getActualColumns(
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG,
  params?: ResponsiveParams
): number {
  if (config.columns !== undefined) return config.columns;
  if (params) {
    return calculateDynamicColumns(params, config).optimalColumns;
  }
  return config.minColumns;
}

export function isValidZoomLevel(
  zoomLevel: number,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): boolean {
  return zoomLevel >= config.minZoomLevel && zoomLevel <= config.maxZoomLevel;
}