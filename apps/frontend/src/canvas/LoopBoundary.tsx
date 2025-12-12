/**
 * 循环边界组件 (新架构适配版)
 * 文件位置: src/components/canvas/LoopBoundary.tsx
 */

import React, { useMemo } from 'react';
import * as clipper from 'clipper-lib';
import { SimpleLoopInfo } from './useLoopDetection';
import { DisplayNode } from './useLayout';
import { useLoopProgress } from '../state/executionStateBridge';

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

/**
 * ✅ 循环标签子组件 - 使用 hook 获取循环进度
 */
interface LoopLabelProps {
  loop: SimpleLoopInfo;
  position: Point;
  textColor: string;
}

const LoopLabel: React.FC<LoopLabelProps> = ({ loop, position, textColor }) => {
  // 使用 hook 获取当前循环的执行进度
  const loopProgress = useLoopProgress(loop.startIndex);

  // 构建显示文本
  const progressText = loopProgress
    ? ` (${loopProgress.current + 1}/${loopProgress.total})`
    : '';

  return (
    <text
      x={position.x}
      y={position.y - 42}
      fill={textColor}
      fontSize="12"
      fontWeight="600"
      fontFamily="system-ui, -apple-system, sans-serif"
      textAnchor="middle"
      style={{
        textShadow: '1px 1px 2px rgba(0, 0, 0, 0.5)'
      }}
    >
      第{loop.level + 1}级循环 • {loop.iterationCount}次{progressText}
    </text>
  );
};

export const LoopBoundary: React.FC<LoopBoundaryProps> = ({
  loop,
  nodes,
  zoomLevel = 1,
  canvasOffsetY = 0,
  className = '',
  style = {}
}) => {

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

    // 重新构建虚拟头尾节点（根据蛇形布局方向调整）
    const startNode = pathNodes[0];
    const endNode = pathNodes[pathNodes.length - 1];
    const sWidth = startNode.layoutMeta?.width ?? startNode.style?.width ?? 140;
    const eWidth = endNode.layoutMeta?.width ?? endNode.style?.width ?? 140;

    // 根据行方向决定偏移方向
    const startRowIsLeftToRight = (startNode.layoutMeta?.row ?? 0) % 2 === 0;
    const endRowIsLeftToRight = (endNode.layoutMeta?.row ?? 0) % 2 === 0;

    const extendedStart = {
      ...startNode,
      // 偶数行从左到右：起点向左偏移；奇数行从右到左：起点向右偏移
      position: {
        ...startNode.position,
        x: startNode.position.x + (startRowIsLeftToRight ? -(sWidth / 3 + 10) : (sWidth / 3 + 10))
      },
      layoutMeta: { ...startNode.layoutMeta, width: sWidth }
    };

    const extendedEnd = {
      ...endNode,
      // 偶数行从左到右：终点向右偏移；奇数行从右到左：终点向左偏移
      position: {
        ...endNode.position,
        x: endNode.position.x + (endRowIsLeftToRight ? (eWidth / 3 + 10) : -(eWidth / 3 + 10))
      },
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
  }, [nodes, loop.nodeIds]);

  // 优化 2: 路径点计算 (蛇形布局适配)
  const pathPoints = useMemo(() => {
    if (completeLoopNodes.length < 2) return [];

    const finalPoints: Point[] = [];

    for (let i = 0; i < completeLoopNodes.length; i++) {
      const node = completeLoopNodes[i];
      const centerPoint = getNodeCenterPoint(node);
      const nodeWidth = node.layoutMeta?.width ?? node.style?.width ?? 140;
      const nodeHeight = node.style?.height ?? 60;

      // 添加当前节点中心
      finalPoints.push(centerPoint);

      // 如果不是最后一个节点，检查是否需要转折
      if (i < completeLoopNodes.length - 1) {
        const nextNode = completeLoopNodes[i + 1];
        const currentRow = node.layoutMeta?.row ?? 0;
        const nextRow = nextNode.layoutMeta?.row ?? 0;

        // 跨行转折：添加转折点
        if (currentRow !== nextRow) {
          const rowIsLeftToRight = currentRow % 2 === 0;
          const nextCenterPoint = getNodeCenterPoint(nextNode);
          const nextNodeWidth = nextNode.layoutMeta?.width ?? nextNode.style?.width ?? 140;

          // 根据蛇形方向决定转折点
          if (rowIsLeftToRight) {
            // 偶数行从左到右，在右侧转折
            const turnX = Math.max(centerPoint.x + nodeWidth / 2, nextCenterPoint.x + nextNodeWidth / 2) + 20;
            finalPoints.push({ x: turnX, y: centerPoint.y });
            finalPoints.push({ x: turnX, y: nextCenterPoint.y });
          } else {
            // 奇数行从右到左，在左侧转折
            const turnX = Math.min(centerPoint.x - nodeWidth / 2, nextCenterPoint.x - nextNodeWidth / 2) - 20;
            finalPoints.push({ x: turnX, y: centerPoint.y });
            finalPoints.push({ x: turnX, y: nextCenterPoint.y });
          }
        }
      }
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
    const beltWidth = baseHeight * 1.15; // 恢复原来的宽度

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

          // 根据级别选择文字颜色 (与边界颜色同步: 青绿、天蓝、紫罗兰、玫红)
          const levelColors = ['#00E6B4', '#00B4FF', '#8A64FF', '#FF50B4'];
          const textColor = levelColors[loop.level] || levelColors[0];

          return (
            <LoopLabel
              loop={loop}
              position={firstPoint}
              textColor={textColor}
            />
          );
        })()}
      </g>
    </svg>
  );
};

export default LoopBoundary;