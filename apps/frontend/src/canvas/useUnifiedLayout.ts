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
  isValidZoomLevel,
  ResponsiveParams
} from './LayoutConfig';

/**
 * 生成连接线的通用函数 (已完全重写以支持蛇形逻辑)
 * 只使用基准尺寸进行几何计算，缩放由渲染层处理
 */
function generateConnectionLines(
  nodesWithPosition: any[],
  columns: number,
  dimensions: { nodeWidth: number; nodeHeight: number; spacing: number; segmentLength: number },
  layoutMode: LayoutMode = 'snake'
): ComputedEdge[] {
  const computedEdges: ComputedEdge[] = [];

  for (let i = 0; i < nodesWithPosition.length - 1; i++) {
    const current = nodesWithPosition[i];
    const next = nodesWithPosition[i + 1];

    if (!current || !next) continue;

    const nodeWidth = current.layoutMeta.width || dimensions.nodeWidth;
    const nodeHeight = current.height || dimensions.nodeHeight; // 使用节点实际高度或默认

    // 垂直中心
    const currentY = current.position.y + nodeHeight / 2;
    const nextY = next.position.y + nodeHeight / 2;

    // 默认坐标和方向 (假设 Grid 模式或 L->R)
    let sourceX = current.position.x + nodeWidth; // 默认右侧出
    let targetX = next.position.x;                // 默认左侧进
    let sourceDir: 1 | -1 = 1;                    // 1 = 向右
    let targetDir: 1 | -1 = 1;                    // 1 = 向右(指箭头方向，实际上通常不仅是方向，而是连接侧。这里定义：1=右侧连接，-1=左侧连接)
    // 修正定义：
    // sourceDir = 1 表示从 Source 的右侧出。 -1 表示从 Source 的左侧出。
    // targetDir = -1 表示从 Target 的左侧进。 1 表示从 Target 的右侧进。

    let connectionType: 'straight' | 'smoothstep' | 'default' = 'straight';

    if (layoutMode === 'snake') {
      const currentRow = current.layoutMeta.row;
      const nextRow = next.layoutMeta.row;

      // 蛇形布局定义：
      // 偶数行 (0, 2...): 从左到右 (L->R)
      // 奇数行 (1, 3...): 从右到左 (R->L)
      const rowIsLeftToRight = currentRow % 2 === 0;

      // 情况 1: 同行连接
      if (currentRow === nextRow) {
        connectionType = 'straight'; // 同行通常直线，除非有障碍（这里简化为直线）

        if (rowIsLeftToRight) {
          // L->R: [Current] -> [Next]
          sourceX = current.position.x + nodeWidth; // 右出
          sourceDir = 1;
          targetX = next.position.x;                // 左进
          targetDir = -1;
        } else {
          // R->L: [Next] <- [Current]
          // 视觉上 Next 在 Current 左边
          sourceX = current.position.x;             // 左出
          sourceDir = -1;
          targetX = next.position.x + nodeWidth;    // 右进
          targetDir = 1;
        }
      }
      // 情况 2: 跨行转折 (Current 是行尾，Next 是下一行行首)
      else {
        connectionType = 'smoothstep'; // 必须是折线

        // 判断是右侧转弯还是左侧转弯
        if (rowIsLeftToRight) {
          // 当前是 L->R (偶数行)，下一行是 R->L。转折点在右侧。
          // [Current] -> ⤵
          //              [Next]
          sourceX = current.position.x + nodeWidth; // 右出
          sourceDir = 1;
          targetX = next.position.x + nodeWidth;    // 下一行的起点在最右边，所以是右进
          targetDir = 1;
        } else {
          // 当前是 R->L (奇数行)，下一行是 L->R。转折点在左侧。
          // ⤵ <- [Current]
          // [Next]
          sourceX = current.position.x;             // 左出
          sourceDir = -1;
          targetX = next.position.x;                // 下一行的起点在最左边，所以是左进
          targetDir = -1;
        }
      }
    } else if (layoutMode === 'grid') {
      // Grid 模式永远是从左连到右，换行直接飞过去
      sourceX = current.position.x + nodeWidth;
      sourceDir = 1;
      targetX = next.position.x;
      targetDir = -1;
      connectionType = 'smoothstep';
    }

    // 压入结果
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
      // ✅ 传递计算好的方向
      sourceDir,
      targetDir
    });
  }

  return computedEdges;
}

// 蛇形布局算法
function calculateSnakeLayout(
  nodes: any[],
  config: LayoutConfig
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
  const baseNodeWidth = nodeWidth;
  const baseNodeHeight = nodeHeight;
  const baseSpacing = spacing;

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

    // 🔍 调试日志：显示节点位置计算详情
    if (process.env.NODE_ENV === 'development' && (index < 5 || index > nodes.length - 5)) {
      console.log(`布局计算 - 节点 ${node.id} (${node.name}):`, {
        数组索引: index,
        计算位置: newPosition,
        行列信息: { row, col: gridCol, isLeftToRight },
        总节点数: nodes.length
      });
    }

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
        columns
        // 移除zoomLevel污染
      },
      // 节点样式使用基础尺寸，实际视觉效果由CSS transform缩放
      style: {
        ...node.style,
        width: baseNodeWidth,
        height: baseNodeHeight
      }
    };

    // 🔍 开发调试：输出位置重写信息（已注释掉）
    // if (process.env.NODE_ENV === 'development') {
    //   console.log(`蛇形布局 - 节点 ${node.id} 位置重写:`, {
    //     index,
    //     row,
    //     gridCol,
    //     oldPosition: node.position || 'undefined',
    //     newPosition,
    //     columns
    //   });
    // }

    return updatedNode;
  });

  // 使用基础尺寸生成连接线
  const baseDimensions = {
    nodeWidth: baseNodeWidth,
    nodeHeight: baseNodeHeight,
    spacing: baseSpacing,
    segmentLength: config.segmentLength
  };
  const computedEdges = generateConnectionLines(nodesWithPosition, columns, baseDimensions, 'snake');

  return {
    layoutNodes: nodesWithPosition,
    layoutEdges: computedEdges,
    actualColumns: columns,
    adjustedDimensions: baseDimensions
  };
}

// 网格布局算法
function calculateGridLayout(
  nodes: any[],
  config: LayoutConfig
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
  const baseNodeWidth = nodeWidth;
  const baseNodeHeight = nodeHeight;
  const baseSpacing = spacing;

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
        columns
        // 移除zoomLevel污染
      },
      // 节点样式使用基础尺寸，实际视觉效果由CSS transform缩放
      style: {
        ...node.style,
        width: baseNodeWidth,
        height: baseNodeHeight
      }
    };

    // 🔍 开发调试：输出位置重写信息（已注释掉）
    // if (process.env.NODE_ENV === 'development') {
    //   console.log(`网格布局 - 节点 ${node.id} 位置重写:`, {
    //     index,
    //     row,
    //     colIndex,
    //     oldPosition: node.position || 'undefined',
    //     newPosition,
    //     columns
    //   });
    // }

    return updatedNode;
  });

  // 使用基础尺寸生成连接线（网格模式）
  const baseDimensions = {
    nodeWidth: baseNodeWidth,
    nodeHeight: baseNodeHeight,
    spacing: baseSpacing,
    segmentLength: config.segmentLength
  };
  const computedEdges = generateConnectionLines(nodesWithPosition, columns, baseDimensions, 'grid');

  return {
    layoutNodes: nodesWithPosition,
    layoutEdges: computedEdges,
    actualColumns: columns,
    adjustedDimensions: baseDimensions
  };
}

// 响应式动态布局算法（根据画布宽度和缩放动态计算列数）
function calculateResponsiveLayout(
  nodes: any[],
  config: LayoutConfig,
  canvasWidth?: number,
  zoomLevel?: number
): LayoutResult {
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
  const baseNodeWidth = nodeWidth;
  const baseNodeHeight = nodeHeight;
  const baseSpacing = spacing;

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
        columns: actualColumns
        // 移除zoomLevel污染
      },
      // 节点样式使用基础尺寸，实际视觉效果由CSS transform缩放
      style: {
        ...node.style,
        width: baseNodeWidth,
        height: baseNodeHeight
      }
    };

    // 🔍 开发调试：输出位置重写信息（已注释掉）
    // if (process.env.NODE_ENV === 'development') {
    //   console.log(`响应式布局 - 节点 ${node.id} 位置重写:`, {
    //     index,
    //     row,
    //     gridCol,
    //     oldPosition: node.position || 'undefined',
    //     newPosition,
    //     actualColumns,
    //     zoomLevel
    //   });
    // }

    return updatedNode;
  });

  // 使用基础尺寸预计算连接线
  const baseDimensions = {
    nodeWidth: baseNodeWidth,
    nodeHeight: baseNodeHeight,
    spacing: baseSpacing,
    segmentLength: config.segmentLength
  };
  const computedEdges = generateConnectionLines(nodesWithPosition, actualColumns, baseDimensions, 'snake');

  return {
    layoutNodes: nodesWithPosition,
    layoutEdges: computedEdges,
    actualColumns,
    adjustedDimensions: baseDimensions
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

  // 🔍 调试：检查输入输出节点数量
  console.log(`[useUnifiedLayout] 输入节点数量: ${nodes.length}`);

  // 完全控制节点在canvas上的显示方式
  const result = useMemo(() => {
    // 根据模式选择布局算法
    switch (finalConfig.mode) {
      case 'snake':
        return calculateSnakeLayout(nodes, finalConfig);
      case 'grid':
        return calculateGridLayout(nodes, finalConfig);
      case 'dynamic-responsive':
        return calculateResponsiveLayout(nodes, finalConfig, canvasWidth, zoomLevel);
      default:
        return calculateSnakeLayout(nodes, finalConfig);
    }
  }, [nodes, finalConfig, canvasWidth, zoomLevel]);

  // 🔍 调试：检查输出节点数量
  console.log(`[useUnifiedLayout] 输出节点数量: ${result.layoutNodes.length}`);

  return result;
};