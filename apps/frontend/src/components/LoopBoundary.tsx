import React, { useState, useEffect } from 'react';
import { LoopStartNode, LoopEndNode } from '../nodes/types';
import { loopContextManager } from '../services/LoopContextManager';
import { calculateConvexHull, getCenterPoint, generateSVGPath, getBounds, Point } from '../utils/geometry';

interface LoopBoundaryProps {
  startNode: LoopStartNode;
  endNode: LoopEndNode;
  nodesInLoop: any[];
  zoomLevel?: number;
  canvasOffsetY?: number;
  // Optional execution state to drive CSS animations
  state?: 'idle' | 'running' | 'paused' | 'completed' | 'error' | 'cancelled';
}

const LoopBoundaryComponent: React.FC<LoopBoundaryProps> = ({
  startNode,
  endNode,
  nodesInLoop,
  zoomLevel = 1,
  canvasOffsetY = 0,
  state
}) => {
  const [boundaryPath, setBoundaryPath] = useState<string>('');
  const [isValid, setIsValid] = useState<boolean>(true);
  const [currentIteration, setCurrentIteration] = useState<number>(0);
  const [svgBounds, setSvgBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => {
    calculateBoundary();
    validateLoopPair();
  }, [startNode, endNode, nodesInLoop]);

  // 监听循环迭代变化
  useEffect(() => {
    const loopId = startNode.data.parameters.loop_id;
    const pair = loopContextManager.getLoopPair(loopId);
    if (pair) {
      // 这里需要从循环上下文管理器获取当前迭代
      const context = loopContextManager.getCurrentLoop();
      setCurrentIteration(context ? context.currentIteration + 1 : 0);
    }
  }, [startNode]);

  
  const calculateBoundary = () => {
    if (!startNode.position || !endNode.position || nodesInLoop.length === 0) {
      setBoundaryPath('');
      setSvgBounds(null);
      return;
    }

    // 收集所有点 - 简化版本
    const points: Point[] = [];

    // 添加循环路径上的所有节点位置（考虑节点大小和canvas变换）
    console.log('[LoopBoundary] 开始处理节点，原始节点数据:', nodesInLoop);

    nodesInLoop.forEach((node, index) => {
      // 使用 node.position 数据结构
      const nodeX = node.position.x;
      const nodeY = node.position.y;

      if (nodeX !== 0 || nodeY !== 0) {
        // 使用与节点配置一致的默认值
        const nodeWidth = node.style?.width || 140;
        // 考虑CSS盒模型：基础高度60px + padding 16px(8px×2) + border 4px(2px×2)
        const nodeHeight = (node.style?.height || 60) + 20; // 总CSS影响约20px

        // 应用canvas变换：缩放和垂直偏移
        const transformX = nodeX * zoomLevel;
        const transformY = (nodeY + canvasOffsetY) * zoomLevel;
        const transformedWidth = nodeWidth * zoomLevel;
        const transformedHeight = nodeHeight * zoomLevel;
        const transformedPadding = 15 * zoomLevel;

        console.log(`[LoopBoundary] 节点 ${node.id} 变换计算:`, {
          nodeWidth,
          nodeHeight,
          originalCoords: { x: nodeX, y: nodeY },
          transformX,
          transformY,
          transformedWidth,
          transformedHeight,
          transformedPadding
        });

        // 添加节点中心点（用于路径追踪）
        const centerPoint = {
          x: transformX + transformedWidth / 2,
          y: transformY + transformedHeight / 2
        };
        points.push(centerPoint);

        // 添加四个角点（用于边界计算）
        const cornerPoints = [
          { x: transformX - transformedPadding, y: transformY - transformedPadding },
          { x: transformX + transformedWidth + transformedPadding, y: transformY - transformedPadding },
          { x: transformX + transformedWidth + transformedPadding, y: transformY + transformedHeight + transformedPadding },
          { x: transformX - transformedPadding, y: transformY + transformedHeight + transformedPadding }
        ];

        cornerPoints.forEach(point => points.push(point));

        console.log(`[LoopBoundary] 节点 ${node.id} 添加的点:`, { centerPoint, cornerPoints });
      } else {
        console.warn(`[LoopBoundary] 节点 ${node.id} 缺少有效的坐标数据`);
      }
    });

    console.log('[LoopBoundary] 所有收集的点:', points);
    console.log('[LoopBoundary] 点数量:', points.length);

    // 计算凸包
    const hull = calculateConvexHull(points);

    // 生成SVG路径
    const pathData = generateSVGPath(hull);
    setBoundaryPath(pathData);

    // 计算SVG边界
    const bounds = getBounds(hull);
    setSvgBounds(bounds);

    // 调试日志
    console.log('[LoopBoundary] 计算循环边界，节点数量:', nodesInLoop.length);
    console.log('[LoopBoundary] 循环路径:', nodesInLoop.map(n => n.id));
    console.log('[LoopBoundary] Canvas变换参数:', { zoomLevel, canvasOffsetY });
    console.log('[LoopBoundary] 节点详细信息（变换后）:', nodesInLoop.map(n => {
      const configWidth = n.style?.width || 140;
      const configHeight = n.style?.height || 60;
      const actualHeight = configHeight + 20; // 包含CSS影响

      // 原始坐标
      const originalX = n.position.x;
      const originalY = n.position.y;

      // 变换后坐标
      const transformX = originalX * zoomLevel;
      const transformY = (originalY + canvasOffsetY) * zoomLevel;
      const transformedWidth = configWidth * zoomLevel;
      const transformedHeight = actualHeight * zoomLevel;

      return {
        id: n.id,
        originalPosition: { x: originalX, y: originalY },
        transformedPosition: { x: transformX, y: transformY },
        configSize: { width: configWidth, height: configHeight },
        actualSize: { width: configWidth, height: actualHeight },
        transformedSize: { width: transformedWidth, height: transformedHeight },
        centerPoint: {
          x: transformX + transformedWidth / 2,
          y: transformY + transformedHeight / 2
        }
      };
    }));
    console.log('[LoopBoundary] 计算的边界框（变换后）:', bounds);
    console.log('[LoopBoundary] 使用的变换后padding值:', 15 * zoomLevel);
    console.log('[LoopBoundary] 边界是否包含所有变换后节点:', nodesInLoop.every(node => {
      const originalX = node.position.x;
      const originalY = node.position.y;
      const transformX = originalX * zoomLevel;
      const transformY = (originalY + canvasOffsetY) * zoomLevel;
      const width = (node.style?.width || 140) * zoomLevel;
      const height = ((node.style?.height || 60) + 20) * zoomLevel;
      return transformX >= bounds.x - 5 &&
             transformY >= bounds.y - 5 &&
             transformX + width <= bounds.x + bounds.width + 5 &&
             transformY + height <= bounds.y + bounds.height + 5;
    }));
  };

  const validateLoopPair = () => {
    const valid = loopContextManager.validateLoopPair(startNode, endNode);
    setIsValid(valid);
  };

  const getLoopColors = () => {
    const level = loopContextManager.getLoopLevel(startNode.data.parameters.loop_id);
    const colors = [
      { border: '#FF9800', bg: 'rgba(255, 152, 0, 0.1)' },
      { border: '#4CAF50', bg: 'rgba(76, 175, 80, 0.1)' },
      { border: '#2196F3', bg: 'rgba(33, 150, 243, 0.1)' },
      { border: '#9C27B0', bg: 'rgba(156, 39, 176, 0.1)' }
    ];

    const safeLevel = Math.max(0, level);
    const colorIndex = safeLevel % colors.length;
    return colors[colorIndex] || colors[0];
  };

  const getIterationLabel = () => {
    const loopId = startNode.data.parameters.loop_id;
    const pair = loopContextManager.getLoopPair(loopId);
    if (!pair) return '';

    const context = loopContextManager.getCurrentLoop();
    if (!context || context.loopId !== loopId) return '';

    return `${currentIteration}/${context.iterations}`;
  };

  const getVariableValue = () => {
    return startNode.data.parameters.start_value +
      (currentIteration - 1) * startNode.data.parameters.step;
  };

  if (!svgBounds || !isValid || !boundaryPath) {
    return null;
  }

  const colors = getLoopColors();
  const zIndex = Math.max(0, loopContextManager.getLoopLevel(startNode.data.parameters.loop_id)) + 1;

  return (
    <svg
      className={`loop-boundary-svg${state ? ' ' + state : ''}`}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex
      }}
    >
      {/* 循环边界路径 */}
      <path
        d={boundaryPath}
        fill={colors.bg}
        stroke={colors.border}
        strokeWidth="2"
        strokeDasharray="5,3"
        opacity="0.9"
      />

      {/* 循环信息标签 */}
      <g>
        <rect
          x={svgBounds.x + 8}
          y={svgBounds.y + 8}
          width="200"
          height="24"
          rx="4"
          fill="rgba(0, 0, 0, 0.85)"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth="1"
        />

        <text
          x={svgBounds.x + 12}
          y={svgBounds.y + 25}
          fill="#64B5F6"
          fontSize="11"
          fontWeight="600"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {startNode.data.parameters.loop_id}
        </text>

        <text
          x={svgBounds.x + 80}
          y={svgBounds.y + 25}
          fill="#81C784"
          fontSize="11"
          fontWeight="500"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {getIterationLabel()}
        </text>

        <text
          x={svgBounds.x + 120}
          y={svgBounds.y + 25}
          fill="#FFB74D"
          fontSize="11"
          fontWeight="500"
          fontFamily="'Monaco', 'Menlo', 'Consolas', monospace"
        >
          {startNode.data.parameters.loop_variable} = {getVariableValue()}
        </text>
      </g>
    </svg>
  );
};

// 使用 React.memo 优化，只有 props 变化时才重新渲染
export const LoopBoundary = React.memo(LoopBoundaryComponent, (prevProps, nextProps) => {
  // 自定义比较函数，只在关键数据变化时重新渲染
  return (
    prevProps.startNode.id === nextProps.startNode.id &&
    prevProps.endNode.id === nextProps.endNode.id &&
    prevProps.nodesInLoop.length === nextProps.nodesInLoop.length &&
    prevProps.nodesInLoop.every((node, index) =>
      node.id === nextProps.nodesInLoop[index]?.id
    )
  );
});
