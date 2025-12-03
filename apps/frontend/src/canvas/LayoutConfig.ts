/**
 * 统一布局配置
 *
 * 作为ZAHNERFLOW项目布局配置的唯一真实来源
 * 明确定义一行有几个节点以及所有布局相关的参数
 * 支持动态计算和缩放适配
 */

// 布局模式枚举
export type LayoutMode = 'snake' | 'grid' | 'dynamic-responsive';

// 缩放级别范围
export interface ZoomLevelRange {
  min: number;
  max: number;
}

// 位置偏移配置
export interface StartOffset {
  x: number;
  y: number;
}

// 响应式计算参数
export interface ResponsiveParams {
  canvasWidth: number;
  zoomLevel: number;
  nodeCount: number;
}

// 动态计算结果
export interface DynamicCalculationResult {
  optimalColumns: number;
  adjustedNodeWidth: number;
  adjustedSpacing: number;
  effectiveContainerWidth: number;
}

/**
 * 统一布局配置接口
 * 作为整个项目布局配置的唯一真实来源
 */
export interface LayoutConfig {
  /**
   * 布局模式
   * - snake: 蛇形布局（交替方向）
   * - grid: 网格布局（固定方向）
   * - dynamic-responsive: 动态响应式布局（根据容器和缩放自动调整）
   */
  mode: LayoutMode;

  /**
   * 固定列数配置
   * - undefined: 表示不固定列数，使用动态计算
   * - number: 固定列数，优先于动态计算
   *
   * 明确"一行有几个节点"的核心配置
   */
  columns?: number;

  // 节点基础尺寸配置
  nodeWidth: number;          // 节点默认宽度
  nodeHeight: number;         // 节点默认高度
  rowHeight: number;          // 行高（包含间距）
  spacing: number;            // 节点间距
  segmentLength: number;      // L形连接线的固定长度段

  // 响应式布局边界配置
  minColumns: number;         // 最小列数限制
  maxColumns: number;         // 最大列数限制
  minNodeWidth: number;       // 最小节点宽度限制
  containerPadding: number;   // 容器内边距

  // 缩放适配配置
  zoomAware: boolean;         // 是否启用缩放感知
  maxZoomLevel: number;       // 最大缩放级别
  minZoomLevel: number;       // 最小缩放级别

  // 起始偏移配置
  startOffset: StartOffset;   // 布局起始位置偏移
}

/**
 * 默认布局配置
 *
 * 特点：
 * - 使用动态响应式模式
 * - 不固定列数，支持动态计算
 * - 合理的默认尺寸和边界设置
 * - 完整的缩放适配支持
 */
export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  // 核心模式配置
  mode: 'dynamic-responsive',  // 启用动态响应式布局
  columns: undefined,           // 不固定列数，由动态计算决定

  // 基础尺寸配置（基于实际UI设计）
  nodeWidth: 200,              // 节点默认宽度
  nodeHeight: 60,               // 节点默认高度
  rowHeight: 100,               // 行高（节点高度+间距）
  spacing: 40,                  // 节点间距
  segmentLength: 30,            // L形连接线的固定长度段（基础值）

  // 响应式边界配置
  minColumns: 2,               // 最少2列，确保布局合理性
  maxColumns: 8,               // 最多8列，避免节点过小
  minNodeWidth: 140,           // 最小节点宽度，保证可读性
  containerPadding: 50,         // 容器内边距

  // 缩放适配配置（与Canvas组件保持一致）
  zoomAware: true,             // 启用缩放感知
  maxZoomLevel: 3.0,           // 最大缩放级别
  minZoomLevel: 0.2,           // 最小缩放级别

  // 起始偏移配置
  startOffset: { x: 50, y: 50 }  // 布局起始位置
};

/**
 * 计算动态列数
 *
 * 根据容器宽度、缩放级别和节点数量计算最优列数
 * 🎯 核心修复：canvasWidth是实际可用宽度，不是缩放后的视觉宽度
 *
 * @param params 响应式计算参数
 * @param config 布局配置
 * @returns 动态计算结果
 */
export function calculateDynamicColumns(
  params: ResponsiveParams,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): DynamicCalculationResult {
  const { canvasWidth, zoomLevel, nodeCount } = params;

  // 🎯 核心修复：canvasWidth是实际可用宽度，直接使用，不需要缩放补偿
  // 缩放影响的是节点显示密度，而不是容器宽度
  const effectiveContainerWidth = canvasWidth - config.containerPadding * 2;

  // 🎯 基于实际容器宽度计算最大可能列数
  const maxColumnsByWidth = Math.floor(
    (effectiveContainerWidth + config.spacing) / (config.nodeWidth + config.spacing)
  );

  // 考虑节点数量的合理列数
  const optimalColumnsByCount = nodeCount <= 4 ? nodeCount : Math.ceil(Math.sqrt(nodeCount));

  // 🎯 核心修复：移除错误的缩放补偿，直接基于容器宽度计算
  // 缩放较小时，节点在视觉上变小，可以容纳更多列；缩放较大时，节点变大，减少列数
  let optimalColumns = Math.min(maxColumnsByWidth, optimalColumnsByCount);

  // 🎯 新增：基于缩放级别的智能调整
  // 缩放级别 < 1.0 时，可以适度增加列数；> 1.0 时，适度减少列数
  if (zoomLevel < 1.0) {
    // 缩小时：节点视觉尺寸变小，可以适当增加列数
    const scaleFactor = 1.0 / zoomLevel; // e.g., 0.6 -> 1.67
    const zoomAdjustment = Math.min(1.5, scaleFactor * 0.3); // 最多增加50%
    optimalColumns = Math.min(config.maxColumns, Math.floor(optimalColumns * (1 + zoomAdjustment)));
  } else if (zoomLevel > 1.0) {
    // 放大时：节点视觉尺寸变大，需要适当减少列数
    const scaleFactor = zoomLevel; // e.g., 1.5 -> 1.5
    const zoomAdjustment = Math.min(0.5, (scaleFactor - 1.0) * 0.5); // 最多减少50%
    optimalColumns = Math.max(config.minColumns, Math.floor(optimalColumns * (1 - zoomAdjustment)));
  }

  // 🔍 调试信息：输出列数计算过程
  if (process.env.NODE_ENV === 'development') {
    console.log('calculateDynamicColumns - 响应式列数计算 (核心修复版本):', {
      canvasWidth,
      zoomLevel,
      effectiveContainerWidth,
      maxColumnsByWidth,
      optimalColumnsByCount,
      optimalColumns_before_boundaries: optimalColumns,
      nodeWidth: config.nodeWidth,
      minColumns: config.minColumns,
      maxColumns: config.maxColumns,
      // 🎯 显示缩放调整信息
      zoomAdjustment: zoomLevel < 1.0 ? `增加 ${Math.floor((1.0 / zoomLevel) * 0.3 * 100)}%` :
                     zoomLevel > 1.0 ? `减少 ${Math.floor((zoomLevel - 1.0) * 0.5 * 100)}%` : '无调整'
    });
  }

  // 应用边界限制
  optimalColumns = Math.max(config.minColumns, Math.min(config.maxColumns, optimalColumns));

  // 根据实际列数调整节点宽度和间距（返回基础尺寸）
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

/**
 * 获取实际使用的列数
 *
 * @param config 布局配置
 * @param params 响应式参数（可选）
 * @returns 实际列数
 */
export function getActualColumns(
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG,
  params?: ResponsiveParams
): number {
  // 如果配置了固定列数，直接使用
  if (config.columns !== undefined) {
    return config.columns;
  }

  // 动态响应式模式需要参数计算
  if (config.mode === 'dynamic-responsive' && params) {
    const result = calculateDynamicColumns(params, config);
    return result.optimalColumns;
  }

  // 其他模式使用最小列数作为默认值
  return config.minColumns;
}

/**
 * 检查缩放级别是否在有效范围内
 *
 * @param zoomLevel 缩放级别
 * @param config 布局配置
 * @returns 是否在有效范围内
 */
export function isValidZoomLevel(
  zoomLevel: number,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): boolean {
  return zoomLevel >= config.minZoomLevel && zoomLevel <= config.maxZoomLevel;
}


// 布局结果接口
export interface LayoutResult {
  layoutNodes: Array<{
    // 完整的ElectrochemicalNode属性
    id: string;
    type: any; // NodeType
    name: string;
    category: any; // NodeCategory
    data: any; // NodeData
    status: any; // NodeStatus
    input: any; // Port
    output: any; // Port
    style: {
      width?: number;
      height?: number;
      background?: string;
      borderColor?: string;
      borderRadius?: string;
      textColor?: string;
      icon?: string;
      [key: string]: any;
    };

    // 布局相关属性
    position: { x: number; y: number };
    layoutMeta?: {
      index: number;
      row: number;
      col: number;
      isLeftToRight: boolean;
      isFirstInRow: boolean;
      isLastInRow: boolean;
      isInOddRow: boolean;
      width: number;
      columns: number;
      [key: string]: any;
    };
    [key: string]: any; // 允许其他属性
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

// 连接线数据接口（与ComputedConnectionLines组件匹配）
export interface ComputedEdge {
  id: string;
  source: string;
  target: string;
  type?: 'straight' | 'smoothstep' | 'default';
  sourcePosition: { x: number; y: number };
  targetPosition: { x: number; y: number };
  layoutMeta?: {
    sourceIsInOddRow: boolean;
    targetIsInOddRow: boolean;
  };
  // ✅ 新增：明确连线的出入方向 (1: 向右, -1: 向左)
  sourceDir?: 1 | -1;
  targetDir?: 1 | -1;

  animated?: boolean;
  style?: React.CSSProperties;
  label?: string;
}