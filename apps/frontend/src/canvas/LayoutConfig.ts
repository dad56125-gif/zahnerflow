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
  zoomLevel: number;
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
  containerPadding: number;
  zoomAware: boolean;
  maxZoomLevel: number;
  minZoomLevel: number;
  startOffset: StartOffset;
}

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
  style?: Record<string, any>;
}

export interface LayoutResult {
  // 返回的对象既包含数据也包含注入的布局信息
  layoutNodes: any[]; 
  layoutEdges: ComputedEdge[];
  actualColumns: number;
  adjustedDimensions: {
    nodeWidth: number;
    nodeHeight: number;
    spacing: number;
    segmentLength: number;
  };
}

// ==================== 4. 逻辑宽度计算函数 (保留你的算法) ====================
export function calculateDynamicColumns(
  params: ResponsiveParams,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): DynamicCalculationResult {
  const { canvasWidth, zoomLevel, nodeCount } = params;
  const logicalCanvasWidth = canvasWidth / zoomLevel;
  const effectiveContainerWidth = logicalCanvasWidth - config.containerPadding * 2;
  
  const maxColumnsByWidth = Math.floor(
    (effectiveContainerWidth + config.spacing) / (config.nodeWidth + config.spacing)
  );

  const optimalColumnsByCount = nodeCount <= 4 ? nodeCount : Math.ceil(Math.sqrt(nodeCount));
  let optimalColumns = Math.min(maxColumnsByWidth, optimalColumnsByCount);

  if (zoomLevel < 1.0) {
      optimalColumns = maxColumnsByWidth;
  }

  optimalColumns = Math.max(config.minColumns, Math.min(config.maxColumns, optimalColumns));

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