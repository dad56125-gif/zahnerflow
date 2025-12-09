/**
 * 循环边界组件 (新架构适配版)
 * 文件位置: src/components/canvas/LoopBoundary.tsx
 */

import React, { useMemo } from 'react';
import * as clipper from 'clipper-lib';
import { SimpleLoopInfo } from './useSimpleLoopDetection';
import { useNodeChangeDetection } from './useNodeChangeDetection';
import { DisplayNode } from './useUnifiedLayout';

// =============================================================================
// PART 1: Clipper 算法 (优化版)
// =============================================================================

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

// 修改 generateBeltPath，改为直接对整条路径进行 Offset
function generateBeltPath(
  points: Point[], // 接收点数组，而不是线段数组
  beltWidth: number
): string {
  if (points.length < 2) return '';

  const halfWidth = beltWidth / 2;
  const clipperOffset = new clipper.ClipperOffset();

  // 将整个点序列作为一个路径添加
  const path = toClipperPath(points);

  // jtRound: 圆角连接 (性能最好且视觉最平滑)
  // etOpenRound:以此为中心向外扩散，两头圆角
  clipperOffset.AddPath(path, clipper.JoinType.jtRound, clipper.EndType.etOpenRound);

  const offsetPaths = new clipper.Paths();
  // 执行一次计算即可，无需循环 union
  clipperOffset.Execute(offsetPaths, Math.round(halfWidth * 100));

  return pathsToSVG(offsetPaths);
}

// =============================================================================
// PART 2: React 组件部分 (适配新架构)
// =============================================================================

export interface LoopBoundaryProps {
  loop: SimpleLoopInfo;
  // 使用布局系统生成的 DisplayNode（包含 position/style/layoutMeta）
  nodes: DisplayNode[];
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
  const updateTrigger = useNodeChangeDetection(nodes);

  // 优化 1: 提取关键数据指纹，避免无关节点更新导致重算
  // 我们只关心在这个循环里的节点 ID，以及它们的位置
  const loopNodeFingerprint = useMemo(() => {
    // 找到循环范围内的节点索引
    const startIndex = nodes.findIndex(n => n.id === loop.startNodeId);
    const endIndex = nodes.findIndex(n => n.id === loop.endNodeId);

    if (startIndex === -1 || endIndex === -1) return '';

    // 确定范围
    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);

    // 生成指纹字符串：ID-X-Y-Width
    // 这样只有循环内的节点移动时，指纹才会变
    let fingerprint = '';
    for (let i = start; i <= end; i++) {
      const n = nodes[i];
      fingerprint += `${n.id}:${Math.round(n.position.x)}:${Math.round(n.position.y)}|`;
    }
    return fingerprint;
  }, [nodes, loop.startNodeId, loop.endNodeId]); // 依赖 nodes，但计算很快

  // 将 completeLoopNodes 的 useMemo 依赖改为 loopNodeFingerprint
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

    // 重新构建虚拟头尾节点（保持原逻辑）
    const startNode = pathNodes[0];
    const endNode = pathNodes[pathNodes.length - 1];
    const sWidth = startNode.layoutMeta?.width ?? startNode.style?.width ?? 140;
    const eWidth = endNode.layoutMeta?.width ?? endNode.style?.width ?? 140;

    const extendedStart = {
      ...startNode,
      position: { ...startNode.position, x: startNode.position.x - sWidth / 3 },
      layoutMeta: { ...startNode.layoutMeta, width: sWidth }
    };

    const extendedEnd = {
      ...endNode,
      position: { ...endNode.position, x: endNode.position.x + eWidth / 3 },
      layoutMeta: { ...endNode.layoutMeta, width: eWidth }
    };

    return [extendedStart, ...pathNodes, extendedEnd];
  }, [loopNodeFingerprint, nodes]); // 🔥 核心：依赖指纹

  // 获取循环内节点
  const loopInnerNodes = useMemo(() => {
    const innerNodes: typeof nodes = [];
    loop.nodeIds.forEach(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      if (node) innerNodes.push(node);
    });
    return innerNodes;
  }, [nodes, loop.nodeIds, updateTrigger]);

  // 优化 2: 简化路径点计算 (不再生成 segments，直接生成点序列)
  const pathPoints = useMemo(() => {
    if (completeLoopNodes.length < 2) return [];

    const rawPoints = completeLoopNodes.map(node => getNodeCenterPoint(node));
    const finalPoints: Point[] = [];

    // 添加第一个点
    finalPoints.push(rawPoints[0]);

    // 处理中间的折线逻辑 (L-Shape)
    for (let i = 0; i < rawPoints.length - 1; i++) {
      const start = rawPoints[i];
      const end = rawPoints[i + 1];

      // 判断是否需要拐弯 (阈值可以适当调大)
      const isLShape = Math.abs(start.y - end.y) > 10 && Math.abs(start.x - end.x) > 10;

      if (isLShape) {
        // 简单的 L 型插值
        const horizontalDistance = Math.abs(end.x - start.x);
        const verticalDistance = Math.abs(end.y - start.y);

        // 这里的逻辑与原来 segments 的逻辑一致，只是变成了加点
        if (horizontalDistance < verticalDistance) {
          finalPoints.push({ x: end.x, y: start.y });
        } else {
          finalPoints.push({ x: start.x, y: end.y });
        }
      }
      finalPoints.push(end);
    }
    return finalPoints;
  }, [completeLoopNodes]);

  // 优化 3: 仅在点变化时计算 Clipper
  const beltPath = useMemo(() => {
    if (pathPoints.length === 0) return '';

    // 获取宽度基准
    // 注意：这里我们不再去根据 pathSegments 循环
    // 而是只取第一个节点的高度做基准即可，无需放在循环里算
    const firstNode = completeLoopNodes[1] || nodes[0]; // 取真实的第一个节点
    const baseHeight = firstNode?.style?.height ?? 60;
    const beltWidth = baseHeight * 1.15; // 稍微宽一点

    // 🔥 调用优化后的 generateBeltPath
    return generateBeltPath(pathPoints, beltWidth);
  }, [pathPoints, completeLoopNodes]);

  if (!beltPath) return null;

  // ... 渲染 JSX 保持不变 ...
  const zIndex = Math.max(0, loop.level) + 1;

  // 计算文字位置 (取路径中间的点)
  const labelPoint = pathPoints.length > 0 ? pathPoints[0] : { x: 0, y: 0 };

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