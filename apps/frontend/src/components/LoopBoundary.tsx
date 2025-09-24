import React, { useState, useEffect } from 'react';
import { LoopStartNode, LoopEndNode } from '../nodes/types';
import { loopContextManager } from '../services/LoopContextManager';

interface LoopBoundaryProps {
  startNode: LoopStartNode;
  endNode: LoopEndNode;
  nodesInLoop: any[];
}

interface BoundaryPosition {
  start: { x: number; y: number };
  end: { x: number; y: number };
  width: number;
  height: number;
}

export const LoopBoundary: React.FC<LoopBoundaryProps> = ({
  startNode,
  endNode,
  nodesInLoop
}) => {
  const [boundaryPos, setBoundaryPos] = useState<BoundaryPosition | null>(null);
  const [isValid, setIsValid] = useState<boolean>(true);
  const [currentIteration, setCurrentIteration] = useState<number>(0);

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
      setBoundaryPos(null);
      return;
    }

    const start = startNode.position;
    const end = endNode.position;

    // 计算包围盒
    let minX = Math.min(start.x, end.x) - 20;
    let maxX = Math.max(start.x, end.x) + 20;
    let minY = Math.min(start.y, end.y) - 40;
    let maxY = Math.max(start.y, end.y) + 40;

    // 考虑循环内节点的位置
    nodesInLoop.forEach(node => {
      if (node.position) {
        minX = Math.min(minX, node.position.x - 10);
        maxX = Math.max(maxX, node.position.x + 10);
        minY = Math.min(minY, node.position.y - 10);
        maxY = Math.max(maxY, node.position.y + 10);
      }
    });

    // 确保宽度和高度为正值
    const width = Math.max(100, maxX - minX);
    const height = Math.max(80, maxY - minY);

    setBoundaryPos({
      start: { x: minX, y: minY },
      end: { x: maxX, y: maxY },
      width,
      height
    });
  };

  const validateLoopPair = () => {
    const valid = loopContextManager.validateLoopPair(startNode, endNode);
    setIsValid(valid);
  };

  const getBracketStyle = () => {
    if (!boundaryPos) {
      return {
        left: '0px',
        top: '0px',
        width: '100px',
        height: '80px',
        borderColor: '#2196F3',
        backgroundColor: 'rgba(33, 150, 243, 0.1)',
        zIndex: 1
      };
    }

    const level = loopContextManager.getLoopLevel(startNode.data.parameters.loop_id);
    const colors = [
      { border: '#FF9800', bg: 'rgba(255, 152, 0, 0.1)' },
      { border: '#4CAF50', bg: 'rgba(76, 175, 80, 0.1)' },
      { border: '#2196F3', bg: 'rgba(33, 150, 243, 0.1)' },
      { border: '#9C27B0', bg: 'rgba(156, 39, 176, 0.1)' }
    ];

    // 确保level在有效范围内
    const safeLevel = Math.max(0, level);
    const colorIndex = safeLevel % colors.length;
    const color = colors[colorIndex];

    // 提供默认颜色以防color未定义
    const defaultColor = { border: '#2196F3', bg: 'rgba(33, 150, 243, 0.1)' };
    const safeColor = color || defaultColor;

    return {
      left: `${boundaryPos.start.x}px`,
      top: `${boundaryPos.start.y}px`,
      width: `${boundaryPos.width}px`,
      height: `${boundaryPos.height}px`,
      borderColor: safeColor.border,
      backgroundColor: safeColor.bg,
      zIndex: safeLevel + 1 // 确保外层循环在内层循环之下
    };
  };

  const getIterationLabel = () => {
    const loopId = startNode.data.parameters.loop_id;
    const pair = loopContextManager.getLoopPair(loopId);
    if (!pair) return '';

    const context = loopContextManager.getCurrentLoop();
    if (!context || context.loopId !== loopId) return '';

    return `${currentIteration}/${context.iterations}`;
  };

  if (!boundaryPos || !isValid) {
    return null;
  }

  return (
    <div className="loop-boundary">
      <div className="bracket-container" style={getBracketStyle()}>
        {/* 左上角括号 */}
        <div className="bracket-corner top-left">
          <div className="bracket-line horizontal"></div>
          <div className="bracket-line vertical"></div>
        </div>

        {/* 右上角括号 */}
        <div className="bracket-corner top-right">
          <div className="bracket-line horizontal"></div>
          <div className="bracket-line vertical"></div>
        </div>

        {/* 左下角括号 */}
        <div className="bracket-corner bottom-left">
          <div className="bracket-line horizontal"></div>
          <div className="bracket-line vertical"></div>
        </div>

        {/* 右下角括号 */}
        <div className="bracket-corner bottom-right">
          <div className="bracket-line horizontal"></div>
          <div className="bracket-line vertical"></div>
        </div>

        {/* 循环信息标签 */}
        <div className="loop-info-label">
          <div className="loop-id">{startNode.data.parameters.loop_id}</div>
          <div className="loop-iteration">{getIterationLabel()}</div>
          <div className="loop-variable">
            {startNode.data.parameters.loop_variable} = {
              startNode.data.parameters.start_value +
              (currentIteration - 1) * startNode.data.parameters.step
            }
          </div>
        </div>
      </div>

      <style>{`
        .loop-boundary {
          position: absolute;
          pointer-events: none;
        }

        .bracket-container {
          position: absolute;
          border-style: solid;
          border-width: 2px;
          border-radius: 8px;
          transition: all 0.3s ease;
        }

        .bracket-corner {
          position: absolute;
          width: 12px;
          height: 12px;
        }

        .bracket-corner.top-left {
          top: -2px;
          left: -2px;
        }

        .bracket-corner.top-right {
          top: -2px;
          right: -2px;
        }

        .bracket-corner.bottom-left {
          bottom: -2px;
          left: -2px;
        }

        .bracket-corner.bottom-right {
          bottom: -2px;
          right: -2px;
        }

        .bracket-line {
          position: absolute;
          background: inherit;
        }

        .bracket-line.horizontal {
          height: 2px;
          width: 12px;
        }

        .bracket-line.vertical {
          width: 2px;
          height: 12px;
        }

        .top-left .bracket-line.horizontal {
          top: 0;
          left: 0;
        }

        .top-left .bracket-line.vertical {
          top: 0;
          left: 0;
        }

        .top-right .bracket-line.horizontal {
          top: 0;
          right: 0;
        }

        .top-right .bracket-line.vertical {
          top: 0;
          right: 0;
        }

        .bottom-left .bracket-line.horizontal {
          bottom: 0;
          left: 0;
        }

        .bottom-left .bracket-line.vertical {
          bottom: 0;
          left: 0;
        }

        .bottom-right .bracket-line.horizontal {
          bottom: 0;
          right: 0;
        }

        .bottom-right .bracket-line.vertical {
          bottom: 0;
          right: 0;
        }

        .loop-info-label {
          position: absolute;
          top: -25px;
          left: 10px;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-family: monospace;
          white-space: nowrap;
          z-index: 10;
        }

        .loop-id {
          font-weight: bold;
          color: #FFD700;
        }

        .loop-iteration {
          color: #90EE90;
          margin-left: 4px;
        }

        .loop-variable {
          color: #87CEEB;
          margin-left: 4px;
        }

        .bracket-container:hover {
          opacity: 0.8;
        }
      `}</style>
    </div>
  );
};