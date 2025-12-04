/**
 * 统一布局 Hook (完整最终版)
 * 文件位置: src/services/layout/useUnifiedLayout.ts
 *
 * 职责：
 * 1. 动态计算列数 (基于逻辑宽度)
 * 2. 计算水平居中偏移量 (Center Offset)
 * 3. 执行蛇形布局 (Snake Layout) 并生成连线
 */

import { useMemo } from 'react';
import {
  LayoutConfig,
  ComputedEdge,
  LayoutResult,
  DEFAULT_LAYOUT_CONFIG,
  getActualColumns
} from './LayoutConfig';

/**
 * 辅助函数：生成连接线 (蛇形逻辑)
 * 处理同行直线连接和跨行折线连接
 */
function generateConnectionLines(
  nodesWithPosition: any[],
  dimensions: { nodeWidth: number; nodeHeight: number; segmentLength: number }
): ComputedEdge[] {
  const computedEdges: ComputedEdge[] = [];

  for (let i = 0; i < nodesWithPosition.length - 1; i++) {
    const current = nodesWithPosition[i];
    const next = nodesWithPosition[i + 1];

    if (!current || !next) continue;

    const nodeWidth = current.layoutMeta.width || dimensions.nodeWidth;
    const nodeHeight = current.height || dimensions.nodeHeight;

    // 计算连接点的 Y 坐标 (垂直居中)
    const currentY = current.position.y + nodeHeight / 2;
    const nextY = next.position.y + nodeHeight / 2;

    const currentRow = current.layoutMeta.row;
    const nextRow = next.layoutMeta.row;
    
    // 蛇形布局特征：偶数行从左到右，奇数行从右到左
    const rowIsLeftToRight = currentRow % 2 === 0;

    let sourceX: number;
    let targetX: number;
    let sourceDir: 1 | -1;
    let targetDir: 1 | -1;
    let connectionType: 'straight' | 'smoothstep';

    // 情况 1: 同行连接
    if (currentRow === nextRow) {
      connectionType = 'straight';
      if (rowIsLeftToRight) {
        // L->R: [Current] -> [Next]
        sourceX = current.position.x + nodeWidth; 
        sourceDir = 1; // 向右
        targetX = next.position.x;                
        targetDir = -1; // 向左
      } else {
        // R->L: [Next] <- [Current]
        sourceX = current.position.x;             
        sourceDir = -1; // 向左
        targetX = next.position.x + nodeWidth;    
        targetDir = 1; // 向右
      }
    }
    // 情况 2: 跨行转折 (Current 是行尾，Next 是下一行行首)
    else {
      connectionType = 'smoothstep';
      if (rowIsLeftToRight) {
        // 当前 L->R, 下一行 R->L。转折点在右侧。
        sourceX = current.position.x + nodeWidth; 
        sourceDir = 1;
        targetX = next.position.x + nodeWidth;    
        targetDir = 1;
      } else {
        // 当前 R->L, 下一行 L->R。转折点在左侧。
        sourceX = current.position.x;             
        sourceDir = -1;
        targetX = next.position.x;                
        targetDir = -1;
      }
    }

    computedEdges.push({
      id: `edge-${current.id}-${next.id}`,
      source: current.id,
      target: next.id,
      type: connectionType,
      sourcePosition: { x: sourceX, y: currentY },
      targetPosition: { x: targetX, y: nextY },
      layoutMeta: {
        sourceIsInOddRow: current.layoutMeta.isInOddRow,
        targetIsInOddRow: next.layoutMeta.isInOddRow
      },
      sourceDir,
      targetDir
    });
  }

  return computedEdges;
}

/**
 * 核心计算函数：执行动态响应式蛇形布局 + 逻辑宽度自动居中
 */
function calculateLayout(
  nodes: any[],
  config: LayoutConfig,
  canvasWidth?: number,
  zoomLevel?: number
): LayoutResult {
  const currentZoom = zoomLevel || 1.0;

  // 1. 计算实际列数 (使用 LayoutConfig 中的逻辑宽度计算)
  const actualColumns = getActualColumns(config, canvasWidth ? {
    canvasWidth,
    zoomLevel: currentZoom,
    nodeCount: nodes.length
  } : undefined);

  const {
    nodeWidth,
    nodeHeight,
    spacing,
    startOffset,
    segmentLength,
    containerPadding
  } = config;

  // 使用基础尺寸进行计算 (缩放由 CSS transform 处理)
  const baseNodeWidth = nodeWidth;
  const baseNodeHeight = nodeHeight;
  const baseSpacing = spacing;

  // ---------------------------------------------------------------------------
  // 🎯 核心逻辑：基于逻辑宽度的水平居中计算
  // ---------------------------------------------------------------------------
  let dynamicStartX = startOffset.x;

  if (canvasWidth) {
    // 1. 计算逻辑可用宽度 = 物理宽度 / 缩放比例
    // 这解决了缩小时居中偏移量计算错误的问题
    const logicalCanvasWidth = canvasWidth / currentZoom;

    // 2. 计算内容区的总宽度 = (列数 * 节点宽) + (间隙数量 * 间隙宽)
    const totalContentWidth = actualColumns * baseNodeWidth + (actualColumns - 1) * baseSpacing;
    
    // 3. 计算居中偏移 = (逻辑总宽 - 内容总宽) / 2
    const centeredOffsetX = (logicalCanvasWidth - totalContentWidth) / 2;

    // 4. 应用偏移，但不小于最小内边距
    dynamicStartX = Math.max(containerPadding, centeredOffsetX);
  }

  // 2. 计算每个节点的位置 (蛇形排列)
  const nodesWithPosition = nodes.map((node, index) => {
    const row = Math.floor(index / actualColumns);
    const colIndex = index % actualColumns;
    
    // 蛇形逻辑：偶数行从左到右(0,1,2,3)，奇数行从右到左(3,2,1,0)
    const isLeftToRight = row % 2 === 0;
    const gridCol = isLeftToRight ? colIndex : (actualColumns - 1) - colIndex;

    const isFirstInRow = colIndex === 0;
    const isLastInRow = colIndex === actualColumns - 1;

    // 使用动态计算的 dynamicStartX 确定 X 坐标
    const newPosition = {
      x: dynamicStartX + gridCol * (baseNodeWidth + baseSpacing),
      y: startOffset.y + row * (baseNodeHeight + baseSpacing),
    };

    return {
      ...node,
      position: newPosition,
      layoutMeta: {
        index,
        row,
        col: gridCol,
        isLeftToRight,
        isFirstInRow,
        isLastInRow,
        isInOddRow: row % 2 === 1,
        width: baseNodeWidth,
        columns: actualColumns
      },
      style: {
        ...node.style,
        width: baseNodeWidth,
        height: baseNodeHeight
      }
    };
  });

  // 3. 生成连接线
  const baseDimensions = {
    nodeWidth: baseNodeWidth,
    nodeHeight: baseNodeHeight,
    segmentLength: segmentLength,
    spacing: baseSpacing
  };
  
  const computedEdges = generateConnectionLines(nodesWithPosition, baseDimensions);

  return {
    layoutNodes: nodesWithPosition,
    layoutEdges: computedEdges,
    actualColumns,
    adjustedDimensions: baseDimensions
  };
}

/**
 * 统一布局 Hook (主入口)
 * @param nodes 节点数据数组
 * @param config 布局配置（可选覆盖）
 * @param canvasWidth 画布物理宽度
 * @param zoomLevel 当前缩放级别
 */
export const useUnifiedLayout = (
  nodes: any[],
  config?: Partial<LayoutConfig>,
  canvasWidth?: number,
  zoomLevel?: number
) => {
  // 合并默认配置
  const finalConfig = useMemo(() => ({
    ...DEFAULT_LAYOUT_CONFIG,
    ...config
  }), [config]);

  // 执行计算 (Memoized)
  const result = useMemo(() => {
    return calculateLayout(nodes, finalConfig, canvasWidth, zoomLevel);
  }, [nodes, finalConfig, canvasWidth, zoomLevel]);

  return result;
};