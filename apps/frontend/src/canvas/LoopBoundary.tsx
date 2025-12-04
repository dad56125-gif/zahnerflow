/**
 * 循环边界组件 (新架构适配版)
 * 文件位置: src/components/canvas/LoopBoundary.tsx
 */

import React, { useMemo } from 'react';
import * as clipper from 'clipper-lib';
import { SimpleLoopInfo } from './useSimpleLoopDetection';
import { useNodeChangeDetection } from './useNodeChangeDetection';

// =============================================================================
// PART 1: Clipper 算法 (保持不变)
// =============================================================================
// ... (toClipperPath, pathsToSVG, offsetPolyline, unionPolygons, generateBeltPath 代码完全不变) ...
// ... 请直接复用上一版 PART 1 的代码，无需改动 ...

interface ClipperPoint {
  X: number;
  Y: number;
}

interface Point {
  x: number;
  y: number;
}

function toClipperPath(points: Point[]): ClipperPoint[] {
  return points.map(p => ({
    X: Math.round(p.x * 100),
    Y: Math.round(p.y * 100)
  }));
}

function pathsToSVG(paths: ClipperPoint[][]): string {
  if (paths.length === 0) return '';
  return paths.map(path => {
    if (path.length === 0) return '';
    let d = `M ${path[0].X / 100} ${path[0].Y / 100}`;
    for (let i = 1; i < path.length; i++) {
      d += ` L ${path[i].X / 100} ${path[i].Y / 100}`;
    }
    d += ' Z';
    return d;
  }).join(' ');
}

function offsetPolyline(points: Point[], offset: number): ClipperPoint[][] {
  if (points.length < 2) return [];
  const clipperOffset = new clipper.ClipperOffset();
  const path = toClipperPath(points);
  clipperOffset.AddPath(path, clipper.JoinType.jtMiter, clipper.EndType.etOpenRound);
  const offsetPaths = new clipper.Paths();
  clipperOffset.Execute(offsetPaths, Math.round(offset * 100));
  return offsetPaths;
}

function unionPolygons(paths: ClipperPoint[][]): ClipperPoint[][] {
  if (paths.length === 0) return [];
  if (paths.length === 1) return paths;
  const clipperUnion = new clipper.Clipper();
  const unionPaths = new clipper.Paths();
  paths.forEach(path => {
    clipperUnion.AddPath(path, clipper.PolyType.ptSubject, true);
  });
  clipperUnion.Execute(
    clipper.ClipType.ctUnion, 
    unionPaths, 
    clipper.PolyFillType.pftNonZero, 
    clipper.PolyFillType.pftNonZero
  );
  return unionPaths;
}

function generateBeltPath(
  segments: Array<{ start: Point; end: Point }>,
  beltWidth: number
): string {
  if (segments.length === 0) return '';
  const halfWidth = beltWidth / 2;
  const offsetPaths: ClipperPoint[][] = [];
  segments.forEach(segment => {
    const points = [segment.start, segment.end];
    const offset = offsetPolyline(points, halfWidth);
    if (offset.length > 0) offsetPaths.push(...offset);
  });
  const unionPath = unionPolygons(offsetPaths);
  return pathsToSVG(unionPath);
}

// =============================================================================
// PART 2: React 组件部分 (适配新架构)
// =============================================================================

export interface LoopBoundaryProps {
  loop: SimpleLoopInfo;
  // 🔥 核心修改：明确期望标准节点结构
  nodes: Array<{
    id: string;
    position: { x: number; y: number }; // 必须有 position 对象
    style?: { width?: number; height?: number };
    layoutMeta?: { width?: number }; // 支持 layoutMeta
    [key: string]: any;
  }>;
  zoomLevel?: number;
  canvasOffsetY?: number;
  className?: string;
  style?: React.CSSProperties;
}

/** 
 * 辅助函数：计算节点中心点 
 * 🔥 适配：从 node.position 读取坐标
 */
function getNodeCenterPoint(node: any): Point {
  // 1. 优先读取 position 对象 (新架构)
  const nodeX = node.position.x;
  const nodeY = node.position.y;
  
  // 2. 宽度优先读取 layoutMeta (布局计算值)，其次 style
  const nodeWidth = node.layoutMeta?.width ?? node.style?.width ?? 140;
  const nodeHeight = node.style?.height ?? 60;

  return {
    x: nodeX + nodeWidth / 2,
    y: nodeY + nodeHeight / 2
  };
}

export const LoopBoundary: React.FC<LoopBoundaryProps> = ({
  loop,
  nodes,
  zoomLevel = 1,
  canvasOffsetY = 0,
  className = '',
  style = {}
}) => {
  const updateTrigger = useNodeChangeDetection(nodes, {
    layout_stable: true
  });

  // 1. 获取完整的循环路径节点
  const completeLoopNodes = useMemo(() => {
    const startIndex = nodes.findIndex(n => n.id === loop.startNodeId);
    const endIndex = nodes.findIndex(n => n.id === loop.endNodeId);

    if (startIndex === -1 || endIndex === -1) return [];

    let pathNodes: typeof nodes = [];
    if (startIndex <= endIndex) {
      pathNodes = nodes.slice(startIndex, endIndex + 1);
    } else {
      pathNodes = nodes.slice(endIndex, startIndex + 1).reverse();
    }

    if (pathNodes.length === 0) return [];

    const startNode = pathNodes[0];
    const endNode = pathNodes[pathNodes.length - 1];
    
    // 获取宽度用于延伸计算
    const sWidth = startNode.layoutMeta?.width ?? startNode.style?.width ?? 140;
    const eWidth = endNode.layoutMeta?.width ?? endNode.style?.width ?? 140;
    const sX = startNode.position.x;
    const eX = endNode.position.x;

    // 构造虚拟延伸点 (保持数据结构一致，用于 getNodeCenterPoint)
    const extendedStart = { 
      ...startNode, 
      position: { ...startNode.position, x: sX - sWidth / 3 },
      // 确保 getNodeCenterPoint 能读到正确的宽度
      layoutMeta: { ...startNode.layoutMeta, width: sWidth }
    };
    
    const extendedEnd = { 
      ...endNode, 
      position: { ...endNode.position, x: eX + eWidth / 3 },
      layoutMeta: { ...endNode.layoutMeta, width: eWidth }
    };

    return [extendedStart, ...pathNodes, extendedEnd];
  }, [loop.startNodeId, loop.endNodeId, nodes, updateTrigger]);

  // 2. 获取循环内节点
  const loopInnerNodes = useMemo(() => {
    const innerNodes: typeof nodes = [];
    loop.nodeIds.forEach(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      if (node) innerNodes.push(node);
    });
    return innerNodes;
  }, [nodes, loop.nodeIds, updateTrigger]);

  // 3. 计算路径线段
  const pathSegments = useMemo(() => {
    if (completeLoopNodes.length < 2) return [];

    const points = completeLoopNodes.map(node => getNodeCenterPoint(node));

    const segments = [];
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];

      const isLShape = Math.abs(start.y - end.y) > 10 && Math.abs(start.x - end.x) > 10;

      if (isLShape) {
        const horizontalDistance = Math.abs(end.x - start.x);
        const verticalDistance = Math.abs(end.y - start.y);
        if (horizontalDistance < verticalDistance) {
          const mid = { x: end.x, y: start.y };
          segments.push({ start, end: mid });
          segments.push({ start: mid, end });
        } else {
          const mid = { x: start.x, y: end.y };
          segments.push({ start, end: mid });
          segments.push({ start: mid, end });
        }
      } else {
        segments.push({ start, end });
      }
    }
    return segments;
  }, [completeLoopNodes]);

  // 4. 生成背景带形状
  const beltPath = useMemo(() => {
    if (pathSegments.length === 0) return '';
    const firstNode = loopInnerNodes[0] || nodes[0];
    const baseHeight = firstNode?.style?.height ?? 60;
    const beltWidth = baseHeight * 1.15;
    
    return generateBeltPath(pathSegments, beltWidth);
  }, [pathSegments, loopInnerNodes, nodes]);

  if (!beltPath || completeLoopNodes.length === 0) return null;

  const zIndex = Math.max(0, loop.level) + 1;

  return (
    <svg
      className={`loop-boundary-svg ${className} level-${loop.level}`}
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
      <path
        d={beltPath}
        className="loop-boundary-fill loop-boundary-border"
      />
      <g>
        {loopInnerNodes.length > 0 && (() => {
          const firstNode = loopInnerNodes[0];
          const firstPoint = getNodeCenterPoint(firstNode);

          return (
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
              第{loop.level + 1}级循环 • {loop.iterationCount}次
            </text>
          );
        })()}
      </g>
    </svg>
  );
};

export default LoopBoundary;