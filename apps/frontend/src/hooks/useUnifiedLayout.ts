/**
 * 统一布局Hook
 *
 * 完全控制节点在canvas上的显示方式
 * 支持动态列数计算和缩放适配
 * 满足"节点显示完全由layout定义，布局也由layout定义，layout明确知道一行有几个节点"
 */

import { useMemo, useCallback } from 'react';
import {
  LayoutConfig,
  LayoutMode,
  ComputedEdge,
  LayoutResult,
  DEFAULT_LAYOUT_CONFIG,
  calculateDynamicColumns,
  getActualColumns,
  getZoomAdjustedDimensions,
  getDynamicSegmentLength,
  isValidZoomLevel,
  ResponsiveParams
} from '../services/layout/LayoutConfig';

/**
 * 生成连接线的通用函数
 *
 * @param nodesWithPosition 带有位置的节点数组
 * @param columns 列数
 * @param dimensions 调整后的尺寸
 * @param layoutMode 布局模式
 * @param zoomLevel 缩放级别
 * @returns 预计算的连接线数组
 */
function generateConnectionLines(
  nodesWithPosition: any[],
  columns: number,
  dimensions: { nodeWidth: number; nodeHeight: number; spacing: number; segmentLength: number },
  layoutMode: LayoutMode = 'snake',
  zoomLevel: number = 1.0
): ComputedEdge[] {
  const computedEdges: ComputedEdge[] = [];

  // 🎯 核心修复：使用动态计算的segmentLength，而不是固定值
  // 确保连接线长度与缩放级别协调，避免60%缩放下变成18px的问题
  const dynamicSegmentLength = getDynamicSegmentLength(DEFAULT_LAYOUT_CONFIG, zoomLevel);

  for (let i = 0; i < nodesWithPosition.length - 1; i++) {
    const current = nodesWithPosition[i];
    const next = nodesWithPosition[i + 1];

    if (!current || !next) continue;

    const nodeWidth = current.layoutMeta.width || dimensions.nodeWidth;
    const nodeHeight = current.height || dimensions.nodeHeight;

    const currentRight = current.position.x + nodeWidth;
    const nextLeft = next.position.x;
    const currentY = current.position.y + nodeHeight / 2;
    const nextY = next.position.y + nodeHeight / 2;

    // 根据布局模式确定连接点位置
    let sourceX = currentRight;  // 默认从右侧连接
    let targetX = nextLeft;      // 默认从左侧连接
    let connectionType: 'straight' | 'smoothstep' | 'default' = 'straight';

    if (layoutMode === 'snake') {
      // 蛇形布局连接逻辑
      const sourceIsInOddRow = Math.floor(current.layoutMeta.index / columns) % 2 === 1;
      const targetIsInOddRow = Math.floor(next.layoutMeta.index / columns) % 2 === 1;

      // 同行内的连接（优先处理）
      if (current.layoutMeta.row === next.layoutMeta.row) {
        if (current.layoutMeta.index < next.layoutMeta.index) {
          sourceX = current.position.x + nodeWidth;
        } else {
          targetX = next.position.x + (next.layoutMeta.width || dimensions.nodeWidth);
        }
      }
      // 奇数行连接到偶数行的跨行连接（奇数行最后一列 → 偶数行第一列）
      else if (sourceIsInOddRow && !targetIsInOddRow) {
        // 🎯 核心修复：奇数行从左到右，最后一列的节点应该从右侧连接
        // 偶数行从右到左，第一列的节点应该从右侧连接
        if (current.layoutMeta.isLastInRow && next.layoutMeta.isFirstInRow) {
          // 源节点从右侧连接（因为奇数行从左到右，最后一列在右侧）
          sourceX = current.position.x + nodeWidth;
          // 目标节点从右侧连接（因为偶数行从右到左，第一列在右侧）
          targetX = next.position.x + (next.layoutMeta.width || dimensions.nodeWidth);
        }
      }
      // 偶数行连接到奇数行的跨行连接（偶数行最后一列 → 奇数行第一列）
      else if (!sourceIsInOddRow && targetIsInOddRow) {
        // 🎯 核心修复：偶数行从右到左，最后一列的节点应该从左侧连接
        // 奇数行从左到右，第一列的节点应该从左侧连接
        if (current.layoutMeta.isLastInRow && next.layoutMeta.isFirstInRow) {
          // 源节点从左侧连接（因为偶数行从右到左，最后一列在左侧）
          sourceX = current.position.x;
          // 目标节点从左侧连接（因为奇数行从左到右，第一列在左侧）
          targetX = next.position.x;
        }
      }
      // 其他跨行连接情况的处理
      else {
        // 奇数行内部的其他连接
        if (sourceIsInOddRow && targetIsInOddRow) {
          if (current.layoutMeta.isLastInRow && !next.layoutMeta.isFirstInRow) {
            targetX = next.position.x + (next.layoutMeta.width || dimensions.nodeWidth);
          }
        }
        // 偶数行内部的其他连接
        else if (!sourceIsInOddRow && !targetIsInOddRow) {
          if (!current.layoutMeta.isFirstInRow && next.layoutMeta.isLastInRow) {
            sourceX = current.position.x;
          }
        }
      }

      // 判断连接类型：跨行使用L形，同行使用直线
      const isSameRow = current.layoutMeta.row === next.layoutMeta.row;
      connectionType = isSameRow ? 'straight' : 'smoothstep';
    } else if (layoutMode === 'grid') {
      // 网格布局使用直线连接
      sourceX = current.position.x + nodeWidth;
      targetX = next.position.x;
      connectionType = 'straight';
    }

    // 连接点位置验证：确保连接点不会超出节点边界
    const sourceNodeWidth = current.layoutMeta.width || dimensions.nodeWidth;
    const targetNodeWidth = next.layoutMeta.width || dimensions.nodeWidth;

    // 验证源连接点
    if (sourceX < current.position.x) {
      console.warn(`连接点超出源节点左边界: 节点${current.id}, sourceX=${sourceX}, nodeLeft=${current.position.x}`);
      sourceX = current.position.x;
    } else if (sourceX > current.position.x + sourceNodeWidth) {
      console.warn(`连接点超出源节点右边界: 节点${current.id}, sourceX=${sourceX}, nodeRight=${current.position.x + sourceNodeWidth}`);
      sourceX = current.position.x + sourceNodeWidth;
    }

    // 验证目标连接点
    if (targetX < next.position.x) {
      console.warn(`连接点超出目标节点左边界: 节点${next.id}, targetX=${targetX}, nodeLeft=${next.position.x}`);
      targetX = next.position.x;
    } else if (targetX > next.position.x + targetNodeWidth) {
      console.warn(`连接点超出目标节点右边界: 节点${next.id}, targetX=${targetX}, nodeRight=${next.position.x + targetNodeWidth}`);
      targetX = next.position.x + targetNodeWidth;
    }

    // 开发环境下的详细调试信息
    if (process.env.NODE_ENV === 'development') {
      // 计算奇偶行信息（用于调试）
      const sourceIsInOddRow = Math.floor(current.layoutMeta.index / columns) % 2 === 1;
      const targetIsInOddRow = Math.floor(next.layoutMeta.index / columns) % 2 === 1;

      // 🎯 专门针对60%缩放7列布局的验证调试
      const is60PercentZoom = Math.abs((zoomLevel || 1.0) - 0.6) < 0.01;
      const is7Columns = columns === 7;
      const isTargetScenario = is60PercentZoom && is7Columns;

      if (isTargetScenario) {
        console.log(`🎯 60%缩放7列布局调试 - ${current.id} → ${next.id}:`, {
          缩放级别: zoomLevel,
          列数: columns,
          源节点: {
            id: current.id,
            index: current.layoutMeta.index,
            row: current.layoutMeta.row,
            col: current.layoutMeta.col,
            isLeftToRight: current.layoutMeta.isLeftToRight,
            isFirstInRow: current.layoutMeta.isFirstInRow,
            isLastInRow: current.layoutMeta.isLastInRow,
            isInOddRow: sourceIsInOddRow,
            position: current.position,
            sourceX,
            sourceY: currentY
          },
          目标节点: {
            id: next.id,
            index: next.layoutMeta.index,
            row: next.layoutMeta.row,
            col: next.layoutMeta.col,
            isLeftToRight: next.layoutMeta.isLeftToRight,
            isFirstInRow: next.layoutMeta.isFirstInRow,
            isLastInRow: next.layoutMeta.isLastInRow,
            isInOddRow: targetIsInOddRow,
            position: next.position,
            targetX,
            targetY: nextY
          },
          连接信息: {
            connectionType,
            isSameRow: current.layoutMeta.row === next.layoutMeta.row,
            columns,
            segmentLength: dynamicSegmentLength || dimensions.segmentLength  // 🎯 使用动态segmentLength
          },
          修复验证: {
            跨行连接: current.layoutMeta.row !== next.layoutMeta.row,
            偶数行到奇数行: !sourceIsInOddRow && targetIsInOddRow,
            奇数行到偶数行: sourceIsInOddRow && !targetIsInOddRow,
            源是否使用左侧连接: sourceX === current.position.x,
            源是否使用右侧连接: sourceX === current.position.x + nodeWidth,
            目标是否使用左侧连接: targetX === next.position.x,
            目标是否使用右侧连接: targetX === next.position.x + (next.layoutMeta.width || dimensions.nodeWidth)
          }
        });
      } else {
        // 标准调试信息
        console.log(`连接线生成 - ${current.id} → ${next.id}:`, {
          源节点: {
            id: current.id,
            index: current.layoutMeta.index,
            row: current.layoutMeta.row,
            col: current.layoutMeta.col,
            isLeftToRight: current.layoutMeta.isLeftToRight,
            isFirstInRow: current.layoutMeta.isFirstInRow,
            isLastInRow: current.layoutMeta.isLastInRow,
            isInOddRow: sourceIsInOddRow,
            position: current.position,
            sourceX,
            sourceY: currentY
          },
          目标节点: {
            id: next.id,
            index: next.layoutMeta.index,
            row: next.layoutMeta.row,
            col: next.layoutMeta.col,
            isLeftToRight: next.layoutMeta.isLeftToRight,
            isFirstInRow: next.layoutMeta.isFirstInRow,
            isLastInRow: next.layoutMeta.isLastInRow,
            isInOddRow: targetIsInOddRow,
            position: next.position,
            targetX,
            targetY: nextY
          },
          连接信息: {
            connectionType,
            isSameRow: current.layoutMeta.row === next.layoutMeta.row,
            columns
          }
        });
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
        sourceIsInOddRow: current.layoutMeta.isInOddRow || false,
        targetIsInOddRow: next.layoutMeta.isInOddRow || false
      }
    });
  }

  return computedEdges;
}

// 蛇形布局算法
function calculateSnakeLayout(
  nodes: any[],
  config: LayoutConfig,
  zoomLevel?: number
): LayoutResult {
  const {
    columns = 4,  // 默认4列
    nodeWidth,
    nodeHeight,
    rowHeight,
    spacing,
    startOffset
  } = config;

  // 布局计算使用基础尺寸，缩放由CSS transform处理
  // 这样避免双重缩放冲突，确保布局层和渲染层职责分离
  const baseDimensions = getZoomAdjustedDimensions(config, zoomLevel);
  const baseNodeWidth = baseDimensions.nodeWidth;
  const baseNodeHeight = baseDimensions.nodeHeight;
  const baseSpacing = baseDimensions.spacing;

  const nodesWithPosition = nodes.map((node, index) => {
    const row = Math.floor(index / columns);
    const colIndex = index % columns;
    const isLeftToRight = row % 2 === 0;
    const gridCol = isLeftToRight ? colIndex : (columns - 1) - colIndex;

    const isFirstInRow = colIndex === 0;
    const isLastInRow = colIndex === columns - 1;

    // 🎯 核心修复：强制重写所有节点位置，解决缩放时现有节点位置不更新的问题
    // 无论原有position是什么，完全覆盖为新计算的位置
    const newPosition = {
      x: startOffset.x + gridCol * (baseNodeWidth + baseSpacing),
      y: startOffset.y + row * (baseNodeHeight + baseSpacing),
    };

    const updatedNode = {
      ...node, // 保留原始ElectrochemicalNode的所有属性
      // 🚫 关键修复：强制覆盖position，不允许任何原有position干扰
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
        columns,
        zoomLevel, // 保留zoomLevel信息供渲染层使用
        // 🎯 添加位置重写标记，确保Canvas能识别这是强制重写的位置
        forcePositionRewrite: true
      },
      // 节点样式使用基础尺寸，实际视觉效果由CSS transform缩放
      style: {
        ...node.style,
        width: baseNodeWidth,
        height: baseNodeHeight
      }
    };

    // 🔍 开发调试：输出位置重写信息
    if (process.env.NODE_ENV === 'development') {
      console.log(`蛇形布局 - 节点 ${node.id} 位置重写:`, {
        index,
        row,
        gridCol,
        oldPosition: node.position || 'undefined',
        newPosition,
        columns,
        zoomLevel
      });
    }

    return updatedNode;
  });

  // 使用基础尺寸生成连接线
  const computedEdges = generateConnectionLines(nodesWithPosition, columns, baseDimensions, 'snake', zoomLevel);

  return {
    layoutNodes: nodesWithPosition,
    layoutEdges: computedEdges,
    actualColumns: columns,
    adjustedDimensions: {
      nodeWidth: baseNodeWidth,
      nodeHeight: baseNodeHeight,
      spacing: baseSpacing,
      segmentLength: getDynamicSegmentLength(DEFAULT_LAYOUT_CONFIG, zoomLevel)  // 🎯 使用动态segmentLength
    }
  };
}

// 网格布局算法
function calculateGridLayout(
  nodes: any[],
  config: LayoutConfig,
  zoomLevel?: number
): LayoutResult {
  const {
    columns = 4,  // 默认4列
    nodeWidth,
    nodeHeight,
    rowHeight,
    spacing,
    startOffset
  } = config;

  // 布局计算使用基础尺寸，缩放由CSS transform处理
  // 这样避免双重缩放冲突，确保布局层和渲染层职责分离
  const baseDimensions = getZoomAdjustedDimensions(config, zoomLevel);
  const baseNodeWidth = baseDimensions.nodeWidth;
  const baseNodeHeight = baseDimensions.nodeHeight;
  const baseSpacing = baseDimensions.spacing;

  const nodesWithPosition = nodes.map((node, index) => {
    const row = Math.floor(index / columns);
    const colIndex = index % columns;

    const isFirstInRow = colIndex === 0;
    const isLastInRow = colIndex === columns - 1;

    // 🎯 核心修复：强制重写所有节点位置，解决缩放时现有节点位置不更新的问题
    // 无论原有position是什么，完全覆盖为新计算的位置
    const newPosition = {
      x: startOffset.x + colIndex * (baseNodeWidth + baseSpacing),
      y: startOffset.y + row * (baseNodeHeight + baseSpacing),
    };

    const updatedNode = {
      ...node, // 保留原始ElectrochemicalNode的所有属性
      // 🚫 关键修复：强制覆盖position，不允许任何原有position干扰
      position: newPosition,
      layoutMeta: {
        index,
        row,
        col: colIndex,
        isLeftToRight: true,  // 网格布局都是从左到右
        isFirstInRow,
        isLastInRow,
        isInOddRow: row % 2 === 1,
        width: baseNodeWidth,
        columns,
        zoomLevel, // 保留zoomLevel信息供渲染层使用
        // 🎯 添加位置重写标记，确保Canvas能识别这是强制重写的位置
        forcePositionRewrite: true
      },
      // 节点样式使用基础尺寸，实际视觉效果由CSS transform缩放
      style: {
        ...node.style,
        width: baseNodeWidth,
        height: baseNodeHeight
      }
    };

    // 🔍 开发调试：输出位置重写信息
    if (process.env.NODE_ENV === 'development') {
      console.log(`网格布局 - 节点 ${node.id} 位置重写:`, {
        index,
        row,
        colIndex,
        oldPosition: node.position || 'undefined',
        newPosition,
        columns,
        zoomLevel
      });
    }

    return updatedNode;
  });

  // 使用基础尺寸生成连接线（网格模式）
  const computedEdges = generateConnectionLines(nodesWithPosition, columns, baseDimensions, 'grid', zoomLevel);

  return {
    layoutNodes: nodesWithPosition,
    layoutEdges: computedEdges,
    actualColumns: columns,
    adjustedDimensions: {
      nodeWidth: baseNodeWidth,
      nodeHeight: baseNodeHeight,
      spacing: baseSpacing,
      segmentLength: getDynamicSegmentLength(DEFAULT_LAYOUT_CONFIG, zoomLevel)  // 🎯 使用动态segmentLength
    }
  };
}

// 响应式动态布局算法（根据画布宽度和缩放动态计算列数）
function calculateResponsiveLayout(
  nodes: any[],
  config: LayoutConfig,
  canvasWidth?: number,
  zoomLevel?: number
): LayoutResult {
  // 布局计算使用基础尺寸，缩放由CSS transform处理
  // 这样避免双重缩放冲突，确保布局层和渲染层职责分离
  const baseDimensions = getZoomAdjustedDimensions(config, zoomLevel);

  // 计算实际列数（传递正确的canvasWidth和zoomLevel）
  const actualColumns = getActualColumns(config, canvasWidth ? {
    canvasWidth,
    zoomLevel: zoomLevel || 1.0,
    nodeCount: nodes.length
  } : undefined);

  const {
    nodeWidth,
    nodeHeight,
    rowHeight,
    spacing,
    startOffset
  } = config;

  // 使用基础尺寸进行布局计算
  const baseNodeWidth = baseDimensions.nodeWidth;
  const baseNodeHeight = baseDimensions.nodeHeight;
  const baseSpacing = baseDimensions.spacing;

  const nodesWithPosition = nodes.map((node, index) => {
    const row = Math.floor(index / actualColumns);
    const colIndex = index % actualColumns;
    const isLeftToRight = row % 2 === 0;
    const gridCol = isLeftToRight ? colIndex : (actualColumns - 1) - colIndex;

    const isFirstInRow = colIndex === 0;
    const isLastInRow = colIndex === actualColumns - 1;

    // 🎯 核心修复：强制重写所有节点位置，解决缩放时现有节点位置不更新的问题
    // 无论原有position是什么，完全覆盖为新计算的位置
    const newPosition = {
      x: startOffset.x + gridCol * (baseNodeWidth + baseSpacing),
      y: startOffset.y + row * (baseNodeHeight + baseSpacing),
    };

    const updatedNode = {
      ...node, // 保留原始ElectrochemicalNode的所有属性
      // 🚫 关键修复：强制覆盖position，不允许任何原有position干扰
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
        columns: actualColumns,
        zoomLevel, // 保留zoomLevel信息供渲染层使用
        // 🎯 添加位置重写标记，确保Canvas能识别这是强制重写的位置
        forcePositionRewrite: true
      },
      // 节点样式使用基础尺寸，实际视觉效果由CSS transform缩放
      style: {
        ...node.style,
        width: baseNodeWidth,
        height: baseNodeHeight
      }
    };

    // 🔍 开发调试：输出位置重写信息
    if (process.env.NODE_ENV === 'development') {
      console.log(`响应式布局 - 节点 ${node.id} 位置重写:`, {
        index,
        row,
        gridCol,
        oldPosition: node.position || 'undefined',
        newPosition,
        actualColumns,
        zoomLevel
      });
    }

    return updatedNode;
  });

  // 使用基础尺寸预计算连接线
  const computedEdges = generateConnectionLines(nodesWithPosition, actualColumns, baseDimensions, 'snake', zoomLevel);

  return {
    layoutNodes: nodesWithPosition,
    layoutEdges: computedEdges,
    actualColumns,
    adjustedDimensions: {
      nodeWidth: baseNodeWidth,
      nodeHeight: baseNodeHeight,
      spacing: baseSpacing,
      segmentLength: getDynamicSegmentLength(DEFAULT_LAYOUT_CONFIG, zoomLevel)  // 🎯 使用动态segmentLength
    }
  };
}

/**
 * 统一布局Hook
 *
 * 完全控制节点在canvas上的显示方式
 * 支持动态列数计算和缩放适配
 *
 * @param nodes 节点数据数组
 * @param config 布局配置（可选）
 * @param canvasWidth 画布宽度（用于响应式布局）
 * @param zoomLevel 缩放级别（用于适配）
 * @returns 布局结果，包含layoutNodes、layoutEdges、actualColumns和adjustedDimensions
 */
export const useUnifiedLayout = (
  nodes: any[],
  config?: Partial<LayoutConfig>,
  canvasWidth?: number,
  zoomLevel?: number
) => {
  // 合并配置
  const finalConfig = useMemo(() => ({
    ...DEFAULT_LAYOUT_CONFIG,
    ...config
  }), [config]);

  // 完全控制节点在canvas上的显示方式
  return useMemo(() => {
    // 根据模式选择布局算法
    switch (finalConfig.mode) {
      case 'snake':
        return calculateSnakeLayout(nodes, finalConfig, zoomLevel);
      case 'grid':
        return calculateGridLayout(nodes, finalConfig, zoomLevel);
      case 'dynamic-responsive':
        return calculateResponsiveLayout(nodes, finalConfig, canvasWidth, zoomLevel);
      default:
        return calculateSnakeLayout(nodes, finalConfig, zoomLevel);
    }
  }, [nodes, finalConfig, canvasWidth, zoomLevel]);
};