import React, { useState, useEffect } from 'react';
import { LoopStartNode, LoopEndNode } from '../../../../types/nodes';
import { LoopContextManager } from '../core/LoopContextManager';
import { calculateConvexHull, getCenterPoint, generateSVGPath, getBounds, Point } from '../../../../utils/geometry';

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
    const pair = LoopContextManager.getLoopPair(loopId);
    if (pair) {
      // 这里需要从循环上下文管理器获取当前迭代
      const context = LoopContextManager.getCurrentLoop();
      setCurrentIteration(context ? context.current_iteration + 1 : 0);
    }
  }, [startNode]);

  
  const calculateBoundary = () => {
    if (!startNode || !endNode || !startNode.position || !endNode.position || nodesInLoop.length === 0) {
      setBoundaryPath('');
      setSvgBounds(null);
      return;
    }

    // 收集所有点 - 简化版本
    const points: Point[] = [];

    // 添加循环路径上的所有节点位置（考虑节点大小和canvas变换）
    

    nodesInLoop.forEach((node, index) => {
      // 使用 node.position 数据结构
      const nodeX = node.position?.x || 0;
      const nodeY = node.position?.y || 0;

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

      }
    });

    

    // 计算凸包
    const hull = calculateConvexHull(points);

    // 生成SVG路径
    const pathData = generateSVGPath(hull);
    setBoundaryPath(pathData);

    // 计算SVG边界
    const bounds = getBounds(hull);
    setSvgBounds(bounds);
  };

  const validateLoopPair = () => {
    const valid = LoopContextManager.validateLoopPair(startNode, endNode);
    setIsValid(valid);
  };

  const getLoopColors = () => {
    const level = LoopContextManager.getLoopLevel(startNode.data.parameters.loop_id);
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
    const pair = LoopContextManager.getLoopPair(loopId);
    if (!pair) return '';

    const context = LoopContextManager.getCurrentLoop();
    if (!context || context.loop_id !== loopId) return '';

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
  const zIndex = Math.max(0, LoopContextManager.getLoopLevel(startNode.data.parameters.loop_id)) + 1;

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
