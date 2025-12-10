// --- START OF FILE apps/frontend/src/hooks/useUnifiedLayout.ts ---

import { useMemo } from 'react';
import { useCanvasStore } from '../state/canvasStore';
// 注意：请确保路径与你实际文件结构一致
import { NODE_CONFIGS } from '../types/NodeConfiguration';
import {
  LayoutConfig,
  ComputedEdge,
  LayoutResult,
  DEFAULT_LAYOUT_CONFIG,
  getActualColumns
} from './LayoutConfig';

// =============================================================================
// 1. 类型导出 (修复缺失部分)
// =============================================================================

export interface DisplayNode {
  id: string;
  type: string; // 通常为 'custom'
  position: { x: number; y: number };
  data: Record<string, any>; // 包含 config, label, icon, _nodeType 等
  style: { width: number; height: number };
  draggable: boolean;
  connectable: boolean;
  // 布局元数据，NodeRenderer 需要用到
  layoutMeta: {
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
}

// 直接重导出 LayoutConfig 中的 ComputedEdge 作为 DisplayEdge，或者定义别名
export type DisplayEdge = ComputedEdge;

// =============================================================================
// 2. 辅助函数
// =============================================================================

/**
 * 辅助函数：生成连接线 (完全保留原本的蛇形逻辑)
 */
function generateConnectionLines(
  nodesWithPosition: DisplayNode[],
  dimensions: { nodeWidth: number; nodeHeight: number; segmentLength: number }
): ComputedEdge[] {
  const computedEdges: ComputedEdge[] = [];

  for (let i = 0; i < nodesWithPosition.length - 1; i++) {
    const current = nodesWithPosition[i];
    const next = nodesWithPosition[i + 1];

    if (!current || !next) continue;

    const nodeWidth = current.layoutMeta.width || dimensions.nodeWidth;
    const nodeHeight = dimensions.nodeHeight;

    // 计算连接点的 Y 坐标 (垂直居中)
    const currentY = current.position.y + nodeHeight / 2;
    const nextY = next.position.y + nodeHeight / 2;

    const currentRow = current.layoutMeta.row;
    const nextRow = next.layoutMeta.row;

    // 蛇形布局特征
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
        sourceX = current.position.x + nodeWidth;
        sourceDir = 1;
        targetX = next.position.x;
        targetDir = -1;
      } else {
        sourceX = current.position.x;
        sourceDir = -1;
        targetX = next.position.x + nodeWidth;
        targetDir = 1;
      }
    }
    // 情况 2: 跨行转折
    else {
      connectionType = 'smoothstep';
      if (rowIsLeftToRight) {
        sourceX = current.position.x + nodeWidth;
        sourceDir = 1;
        targetX = next.position.x + nodeWidth;
        targetDir = 1;
      } else {
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

// =============================================================================
// 3. 核心逻辑
// =============================================================================

/**
 * 核心计算函数 (保留原本的计算流程，适配 WorkflowNode)
 */
function calculateLayout(
  rawNodes: any[], // 来自 Store 的 WorkflowNode[]
  config: LayoutConfig,
  canvasWidth?: number,
  zoomLevel?: number,
  selectedNodeId?: string | null
): {
  layoutNodes: DisplayNode[];
  layoutEdges: DisplayEdge[];
  actualColumns: number;
  adjustedDimensions: any;
} {
  const currentZoom = zoomLevel || 1.0;

  // 1. 计算实际列数
  const actualColumns = getActualColumns(config, canvasWidth ? {
    canvasWidth,
    zoomLevel: currentZoom,
    nodeCount: rawNodes.length
  } : undefined);

  const {
    nodeWidth,
    nodeHeight,
    spacing,
    startOffset,
    segmentLength,
    containerPadding
  } = config;

  // 使用基础尺寸
  const baseNodeWidth = nodeWidth;
  const baseNodeHeight = nodeHeight;
  const baseSpacing = spacing;

  // 2. 居中计算
  let dynamicStartX = startOffset.x;
  if (canvasWidth) {
    const logicalCanvasWidth = canvasWidth / currentZoom;
    const totalContentWidth = actualColumns * baseNodeWidth + (actualColumns - 1) * baseSpacing;
    const centeredOffsetX = (logicalCanvasWidth - totalContentWidth) / 2;
    dynamicStartX = Math.max(containerPadding, centeredOffsetX);
  }

  // 3. 映射节点位置 + 注入静态配置 (图标/名称)
  const nodesWithPosition: DisplayNode[] = rawNodes.map((node, index) => {
    // [关键适配] 获取静态配置
    const staticConfig = NODE_CONFIGS[node.type];

    const row = Math.floor(index / actualColumns);
    const colIndex = index % actualColumns;

    const isLeftToRight = row % 2 === 0;
    const gridCol = isLeftToRight ? colIndex : (actualColumns - 1) - colIndex;

    const isFirstInRow = colIndex === 0;
    const isLastInRow = colIndex === actualColumns - 1;

    const newPosition = {
      x: dynamicStartX + gridCol * (baseNodeWidth + baseSpacing),
      y: startOffset.y + row * (baseNodeHeight + baseSpacing),
    };

    return {
      id: node.id,
      type: 'custom', // 统一指向自定义组件

      // 注入视图属性 (兼容 React Flow data 结构)
      data: {
        ...node.config,
        label: staticConfig?.name,
        icon: staticConfig?.icon,
        _nodeType: node.type, // 供组件逻辑判断
        isSelected: node.id === selectedNodeId
      },

      // 注入坐标
      position: newPosition,

      // 注入样式尺寸
      style: {
        width: baseNodeWidth,
        height: baseNodeHeight
      },

      // 锁定
      draggable: false,
      connectable: false,

      // 保留原本的 Layout Meta
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
      }
    };
  });

  // 4. 生成连线
  const baseDimensions = {
    nodeWidth: baseNodeWidth,
    nodeHeight: baseNodeHeight,
    segmentLength: segmentLength
  };

  const computedEdges = generateConnectionLines(nodesWithPosition, baseDimensions);

  return {
    layoutNodes: nodesWithPosition,
    layoutEdges: computedEdges,
    actualColumns,
    adjustedDimensions: { ...baseDimensions, spacing: baseSpacing }
  };
}

// =============================================================================
// 4. Hook 入口
// =============================================================================

export const useLayout = (
  nodes?: any[], // 可选参数，如果没传就从 Store 取
  config?: Partial<LayoutConfig>,
  canvasWidth?: number,
  zoomLevel?: number
) => {
  // 从 Store 获取数据 (如果没有通过参数传入)
  const storeNodes = useCanvasStore((state) => state.nodes);
  const storeCanvasSize = useCanvasStore((state) => state.canvasSize);
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);

  const targetNodes = nodes || storeNodes;
  const targetWidth = canvasWidth || storeCanvasSize.width;

  // 合并配置
  const finalConfig = useMemo(() => ({
    ...DEFAULT_LAYOUT_CONFIG,
    ...config
  }), [config]);

  // 执行计算
  const result = useMemo(() => {
    return calculateLayout(
      targetNodes,
      finalConfig,
      targetWidth,
      zoomLevel,
      selectedNodeId
    );
  }, [targetNodes, finalConfig, targetWidth, zoomLevel, selectedNodeId]);

  return result;
};