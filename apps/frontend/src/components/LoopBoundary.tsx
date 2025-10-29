import React, { useState, useEffect } from 'react';
import { LoopStartNode, LoopEndNode } from '../nodes/types';
import { loopContextManager } from '../services/LoopContextManager';
import { calculateConvexHull, getCenterPoint, generateSVGPath, getBounds, Point } from '../utils/geometry';

interface LoopBoundaryProps {
  startNode: LoopStartNode;
  endNode: LoopEndNode;
  nodesInLoop: any[];
}

const LoopBoundaryComponent: React.FC<LoopBoundaryProps> = ({
  startNode,
  endNode,
  nodesInLoop
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
    if (!startNode.position || !endNode.position) {
      setBoundaryPath('');
      setSvgBounds(null);
      return;
    }

    // 收集所有点
    const points: Point[] = [
      { x: startNode.position.x, y: startNode.position.y },
      { x: endNode.position.x, y: endNode.position.y }
    ];

    // 添加循环内节点位置（考虑节点大小）
    nodesInLoop.forEach(node => {
      if (node.position) {
        const nodeWidth = node.style?.width || 140;
        const nodeHeight = 80;

        // 添加四个角点
        points.push(
          { x: node.position.x - 20, y: node.position.y - 20 },
          { x: node.position.x + nodeWidth + 20, y: node.position.y - 20 },
          { x: node.position.x + nodeWidth + 20, y: node.position.y + nodeHeight + 20 },
          { x: node.position.x - 20, y: node.position.y + nodeHeight + 20 }
        );
      }
    });

    // 计算凸包
    const hull = calculateConvexHull(points);

    // 添加边距
    const padding = 30;
    const center = getCenterPoint(points);
    const expandedHull = hull.map(point => ({
      x: point.x < center.x ? point.x - padding : point.x + padding,
      y: point.y < center.y ? point.y - padding : point.y + padding
    }));

    // 生成SVG路径
    const pathData = generateSVGPath(expandedHull);
    setBoundaryPath(pathData);

    // 计算SVG边界
    const bounds = getBounds(expandedHull);
    setSvgBounds(bounds);
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
      className="loop-boundary-svg"
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
          y={svgBounds.y - 30}
          width="200"
          height="24"
          rx="4"
          fill="rgba(0, 0, 0, 0.85)"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth="1"
        />

        <text
          x={svgBounds.x + 12}
          y={svgBounds.y - 17}
          fill="#64B5F6"
          fontSize="11"
          fontWeight="600"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {startNode.data.parameters.loop_id}
        </text>

        <text
          x={svgBounds.x + 80}
          y={svgBounds.y - 17}
          fill="#81C784"
          fontSize="11"
          fontWeight="500"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {getIterationLabel()}
        </text>

        <text
          x={svgBounds.x + 120}
          y={svgBounds.y - 17}
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