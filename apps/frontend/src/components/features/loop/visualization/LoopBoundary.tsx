/**
 * 循环边界组件
 *
 * 合并了 LoopConnector、LoopVisualizer 和 LoopStatusIndicator 的功能
 * 负责渲染循环边界带和循环级别显示
 * 使用 useNodeChangeDetection Hook 进行节点变化检测
 */

import React from 'react';
import { type SimpleLoopInfo } from '../../../../hooks/useSimpleLoopDetection';
import { useNodeChangeDetection } from '../../../../services/hooks/useNodeChangeDetection';
import { generateBeltPath } from '../../../../utils/clipper';

/**
 * 循环边界组件属性接口
 */
export interface LoopBoundaryProps {
  loop: SimpleLoopInfo;
  nodes: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    position?: { x: number; y: number };
    style?: { width?: number; height?: number };
  }>;
  layoutMode?: 'snake' | 'grid';
  zoomLevel?: number;
  canvasOffsetY?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 计算节点中心点
 */
function getNodeCenterPoint(
  node: any,
  zoomLevel: number,
  canvasOffsetY: number
): { x: number; y: number } {
  const nodeX = node.position?.x || node.x || 0;
  const nodeY = node.position?.y || node.y || 0;

  const nodeWidth = node.style?.width || node.width || 140;
  const nodeHeight = node.style?.height || node.height || 60;

  const transformX = nodeX * zoomLevel;
  const transformY = (nodeY + canvasOffsetY) * zoomLevel;
  const transformedWidth = nodeWidth * zoomLevel;
  const transformedHeight = nodeHeight * zoomLevel;

  return {
    x: transformX + transformedWidth / 2,
    y: transformY + transformedHeight / 2
  };
}

/**
 * 循环边界主组件
 */
export const LoopBoundary: React.FC<LoopBoundaryProps> = ({
  loop,
  nodes,
  layoutMode = 'snake',
  zoomLevel = 1,
  canvasOffsetY = 0,
  className = '',
  style = {}
}) => {
  // 使用 useNodeChangeDetection Hook 进行节点变化检测
  const updateTrigger = useNodeChangeDetection(nodes, {
    enable_delay: false,
    layout_stable: true
  });

  /**
   * 查找从 start_node 到 end_node 的完整路径
   * 包括路径上所有的中间节点
   */
  const findCompleteLoopPath = React.useCallback((
    startNodeId: string,
    endNodeId: string,
    allNodes: LoopBoundaryProps['nodes']
  ) => {
    const startIndex = allNodes.findIndex(n => n.id === startNodeId);
    const endIndex = allNodes.findIndex(n => n.id === endNodeId);

    if (startIndex === -1 || endIndex === -1) {
      return [];
    }

    // 获取从 start_node 到 end_node 的完整节点序列
    if (startIndex <= endIndex) {
      const pathNodes = allNodes.slice(startIndex, endIndex + 1);

      // 在开始节点左侧添加宽度一半的扩展点
      const startNode = pathNodes[0];
      const nodeWidth = startNode.style?.width || startNode.width || 140;
      const extendedStart = {
        ...startNode,
        x: startNode.x - nodeWidth / 3
      };

      // 在结束节点右侧添加宽度三分之一的扩展点
      const endNode = pathNodes[pathNodes.length - 1];
      const endNodeWidth = endNode.style?.width || endNode.width || 140;
      const extendedEnd = {
        ...endNode,
        x: endNode.x + endNodeWidth / 3
      };

      return [extendedStart, ...pathNodes, extendedEnd];
    } else {
      const pathNodes = allNodes.slice(endIndex, startIndex + 1).reverse();

      // 在开始节点（原endNode）左侧添加宽度一半的扩展点
      const startNode = pathNodes[0];
      const nodeWidth = startNode.style?.width || startNode.width || 140;
      const extendedStart = {
        ...startNode,
        x: startNode.x - nodeWidth / 3
      };

      // 在结束节点右侧添加宽度三分之一的扩展点
      const endNode = pathNodes[pathNodes.length - 1];
      const endNodeWidth = endNode.style?.width || endNode.width || 140;
      const extendedEnd = {
        ...endNode,
        x: endNode.x + endNodeWidth / 3
      };

      return [extendedStart, ...pathNodes, extendedEnd];
    }
  }, []);

  // 获取完整的循环路径节点（包括循环间节点）
  const completeLoopNodes = React.useMemo(() => {
    return findCompleteLoopPath(loop.startNodeId, loop.endNodeId, nodes);
  }, [loop.startNodeId, loop.endNodeId, nodes, findCompleteLoopPath, updateTrigger]);

  // 获取循环内的节点（用于特殊标记和显示）
  const loopInnerNodes = React.useMemo(() => {
    const innerNodes: typeof nodes = [];
    loop.nodeIds.forEach(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        innerNodes.push(node);
      }
    });
    return innerNodes;
  }, [nodes, loop.nodeIds, updateTrigger]);

  // 计算路径段
  const pathSegments = React.useMemo(() => {
    if (completeLoopNodes.length === 0) return [];

    const points = completeLoopNodes.map(node =>
      getNodeCenterPoint(node, zoomLevel, canvasOffsetY)
    );

    const segments: Array<{
      start: { x: number; y: number };
      end: { x: number; y: number };
    }> = [];

    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];

      // 判断是否需要L形路径
      const isLShape = Math.abs(start.y - end.y) > 10 && Math.abs(start.x - end.x) > 10;

      if (isLShape) {
        // L形路径：先根据相对位置确定转折点
        const horizontalDistance = Math.abs(end.x - start.x);
        const verticalDistance = Math.abs(end.y - start.y);

        if (horizontalDistance < verticalDistance) {
          // 先水平转折
          const mid1 = { x: end.x, y: start.y };
          segments.push({ start, end: mid1 });
          segments.push({ start: mid1, end });
        } else {
          // 先垂直转折
          const mid1 = { x: start.x, y: end.y };
          segments.push({ start, end: mid1 });
          segments.push({ start: mid1, end });
        }
      } else {
        // 直线
        segments.push({ start, end });
      }
    }

    return segments;
  }, [completeLoopNodes, zoomLevel, canvasOffsetY, updateTrigger]);

  // 从传入的 loop 对象直接获取层级（不再调用 LoopMetadataManager）
  const loopLevel = loop.level;

  // 计算带状宽度（基于循环内节点）
  const nodeHeight = loopInnerNodes[0]?.style?.height || loopInnerNodes[0]?.height || 60;
  const beltWidth = nodeHeight * 1.15;

  // 生成 SVG path（单个路径，同时用于填充和边框）
  const beltPath = React.useMemo(() => {
    if (pathSegments.length === 0) return '';
    return generateBeltPath(pathSegments, beltWidth);
  }, [pathSegments, beltWidth, updateTrigger]);

  // 如果没有节点或路径段，不渲染
  if (completeLoopNodes.length === 0 || pathSegments.length === 0) {
    return null;
  }

  const zIndex = Math.max(0, loopLevel) + 1;

  return (
    <svg
      className={`loop-boundary-svg ${className} level-${loopLevel}`}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex,
        ...style
      }}
    >
      {/* 循环边界带（单个路径，同时用于填充和边框） */}
      {beltPath && (
        <path
          d={beltPath}
          className="loop-boundary-fill loop-boundary-border"
        />
      )}

      {/* 循环级别和信息标签 */}
      <g>
        {loopInnerNodes.length > 0 && (() => {
          const firstNode = loopInnerNodes[0];
          const firstPoint = getNodeCenterPoint(firstNode, zoomLevel, canvasOffsetY);

          return (
            <>
              {/* 循环级别文本 */}
              <text
                x={firstPoint.x}
                y={firstPoint.y - 50}
                fill="#64B5F6"
                fontSize="12"
                fontWeight="600"
                fontFamily="system-ui, -apple-system, sans-serif"
                textAnchor="middle"
                style={{
                  textShadow: '1px 1px 2px rgba(0, 0, 0, 0.5)'
                }}
              >
                第{loopLevel + 1}级循环 • {loop.iterationCount}次
              </text>

              </>
          );
        })()}
      </g>
    </svg>
  );
};

export default LoopBoundary;
