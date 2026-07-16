// ==================== 1. 基础几何类型 ====================
export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

// ==================== 2. 统一布局配置 ====================
export interface StartOffset {
  x: number;
  y: number;
}

export interface ResponsiveParams {
  canvasWidth: number;
  nodeCount: number;
}

export interface DynamicCalculationResult {
  optimalColumns: number;
  adjustedNodeWidth: number;
  adjustedSpacing: number;
  effectiveContainerWidth: number;
}

export interface LayoutConfig {
  columns?: number;
  nodeWidth: number;
  nodeHeight: number;
  rowHeight: number;
  spacing: number;
  segmentLength: number;
  minColumns: number;
  maxColumns: number;
  minNodeWidth: number;
  maxNodeWidth: number;
  containerPadding: number;
  startOffset: StartOffset;
}

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  columns: undefined,
  nodeWidth: 132,
  nodeHeight: 60,
  rowHeight: 70,
  spacing: 22,
  segmentLength: 20,
  minColumns: 1,
  maxColumns: 8,
  minNodeWidth: 108,
  maxNodeWidth: 176,
  containerPadding: 42,
  startOffset: { x: 42, y: 74 }
};

// ==================== 3. 计算结果类型 ====================
export interface ComputedEdge {
  id: string;
  source: string;
  target: string;
  type?: 'straight' | 'smoothstep';
  sourcePosition: Position;
  targetPosition: Position;
  layoutMeta?: {
    sourceIsInOddRow: boolean;
    targetIsInOddRow: boolean;
  };
  sourceDir?: 1 | -1;
  targetDir?: 1 | -1;
  animated?: boolean;
  style?: CSSProperties;
}

// ==================== 4. 逻辑宽度计算函数 (保留你的算法) ====================
export function calculateDynamicColumns(
  params: ResponsiveParams,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): DynamicCalculationResult {
  const { canvasWidth, nodeCount } = params;
  const effectiveContainerWidth = Math.max(0, canvasWidth - config.containerPadding * 2);
  
  const maxColumnsByWidth = Math.max(
    1,
    Math.floor((effectiveContainerWidth + config.spacing) / (config.maxNodeWidth + config.spacing))
  );

  const optimalColumnsByCount = Math.max(1, nodeCount);
  let optimalColumns = Math.min(maxColumnsByWidth, optimalColumnsByCount, config.maxColumns);

  optimalColumns = Math.max(config.minColumns, Math.min(config.maxColumns, optimalColumns));

  const adjustedSpacing = config.spacing;
  const adjustedNodeWidth = Math.min(
    config.maxNodeWidth,
    Math.max(
    config.minNodeWidth,
    (effectiveContainerWidth - (optimalColumns - 1) * adjustedSpacing) / optimalColumns
    )
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
import type { CSSProperties } from 'react';
