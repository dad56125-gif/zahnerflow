/**
 * 连接线组件
 *
 * 从Canvas.tsx中解耦出来的传统连接线功能
 * 提供S形布局的连接线渲染，包括自动连接线和手动连接线
 */

import React from 'react';
import { ElectrochemicalNode } from '../nodes/types';

export interface ConnectionLinesProps {
  nodes: ElectrochemicalNode[];
  connections: Array<{
    id: string;
    sourceId: string;
    targetId: string;
  }>;
  canvasWidth: number;
  layoutStable: boolean;
  className?: string;
}

export interface CachedConnection {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  midX?: number;
  midY?: number;
  isLShape: boolean;
}

export const ConnectionLines: React.FC<ConnectionLinesProps> = ({
  nodes,
  connections,
  canvasWidth,
  layoutStable,
  className = ''
}) => {
  const [cachedConnections, setCachedConnections] = React.useState<CachedConnection[]>([]);

  // 节点默认宽度
  const NODE_WIDTH = 140;
  const CANVAS_ROW_HEIGHT = 150;

  // 动态计算节点布局配置
  const calculateDynamicLayout = React.useCallback(() => {
    const padding = 100;
    const availableWidth = canvasWidth - (padding * 2);

    const maxNodesPerRow = Math.max(1, Math.floor(availableWidth / (NODE_WIDTH + 60)));
    const totalNodes = nodes.length;
    const actualNodesPerRow = Math.min(maxNodesPerRow, totalNodes);

    let spacing = 0;
    let startX = padding;

    if (actualNodesPerRow === 1) {
      const firstNode = nodes[0];
      const firstNodeWidth = firstNode?.style?.width || NODE_WIDTH;
      startX = padding + (availableWidth - firstNodeWidth) / 2;
      spacing = 0;
    } else {
      let totalNodesWidth = 0;
      for (let i = 0; i < actualNodesPerRow && i < nodes.length; i++) {
        const node = nodes[i];
        totalNodesWidth += node?.style?.width || NODE_WIDTH;
      }

      const totalSpacingWidth = availableWidth - totalNodesWidth;
      spacing = totalSpacingWidth / (actualNodesPerRow - 1);
      startX = padding;
    }

    return {
      nodesPerRow: actualNodesPerRow,
      spacing: spacing,
      startX: startX,
      connectionLength: spacing
    };
  }, [canvasWidth, nodes.length]);

  // 计算节点位置
  const calculateNodePosition = React.useCallback((index: number, nodesArray: ElectrochemicalNode[]) => {
    const padding = 100;
    const availableWidth = canvasWidth - (padding * 2);

    const { nodesPerRow } = calculateDynamicLayout();
    const row = Math.floor(index / nodesPerRow);
    const col = index % nodesPerRow;

    const rowStartIndex = row * nodesPerRow;
    const rowEndIndex = Math.min(rowStartIndex + nodesPerRow, nodesArray.length);
    const nodesInThisRow = nodesArray.slice(rowStartIndex, rowEndIndex);

    let x, spacing, startX;

    if (nodesInThisRow.length === 1 && row === 0) {
      const nodeWidth = nodesInThisRow[0]?.style?.width || NODE_WIDTH;
      startX = padding + (availableWidth - nodeWidth) / 2;
      spacing = 0;
      x = startX;
    } else {
      let totalNodesWidth = 0;
      for (const node of nodesInThisRow) {
        totalNodesWidth += node?.style?.width || NODE_WIDTH;
      }

      const totalSpacingWidth = availableWidth - totalNodesWidth;
      spacing = totalSpacingWidth / (nodesInThisRow.length - 1);
      startX = padding;

      if (row % 2 === 0) {
        x = startX;
        for (let i = 0; i < col; i++) {
          const nodeWidth = nodesInThisRow[i]?.style?.width || NODE_WIDTH;
          x += nodeWidth + spacing;
        }
      } else {
        x = startX;
        for (let i = 0; i < nodesInThisRow.length - 1 - col; i++) {
          const nodeWidth = nodesInThisRow[i]?.style?.width || NODE_WIDTH;
          x += nodeWidth + spacing;
        }
      }
    }

    const y = 100 + row * CANVAS_ROW_HEIGHT;
    return { x, y };
  }, [calculateDynamicLayout, canvasWidth]);

  // 计算连接线
  React.useEffect(() => {
    if (!layoutStable || nodes.length === 0) {
      setCachedConnections([]);
      return;
    }

    const newConnections = nodes.map((node, index) => {
      if (index >= nodes.length - 1) return null;
      const position = calculateNodePosition(index, nodes);
      const nextPosition = calculateNodePosition(index + 1, nodes);
      const { nodesPerRow, connectionLength } = calculateDynamicLayout();
      const currentRow = Math.floor(index / nodesPerRow);
      const nextRow = Math.floor((index + 1) / nodesPerRow);

      if (currentRow === nextRow) {
        const isLeftToRight = currentRow % 2 === 0;
        const startX = isLeftToRight ? position.x + (node.style.width || NODE_WIDTH) : position.x;
        const endX = isLeftToRight ? nextPosition.x : nextPosition.x + (node.style.width || NODE_WIDTH);
        return {
          id: `line-${index}`,
          startX,
          startY: position.y + 30,
          endX,
          endY: nextPosition.y + 30,
          isLShape: false
        };
      } else {
        const isLeftToRight = currentRow % 2 === 0;
        const startX = isLeftToRight ? position.x + (node.style.width || NODE_WIDTH) : position.x;
        const endX = nextRow % 2 === 0 ? nextPosition.x : nextPosition.x + (node.style.width || NODE_WIDTH);
        const midX = startX + (isLeftToRight ? connectionLength : -connectionLength);
        return {
          id: `line-${index}`,
          startX,
          startY: position.y + 30,
          endX,
          endY: nextPosition.y + 30,
          midX,
          midY: nextPosition.y + 30,
          isLShape: true
        };
      }
    }).filter(Boolean) as CachedConnection[];

    setCachedConnections(newConnections);
  }, [layoutStable, nodes, calculateNodePosition]);

  return (
    <svg
      className={`connections-layer ${className}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1
      }}
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            className="connection-arrow"
            fill="rgba(255,255,255,0.8)"
          />
        </marker>
      </defs>

      {/* 渲染自动连接线 */}
      {layoutStable && cachedConnections.map((conn) => (
        <g key={conn.id}>
          {conn.isLShape ? (
            <>
              <line
                x1={conn.startX}
                y1={conn.startY}
                x2={conn.midX}
                y2={conn.startY}
                className="connection-line"
                stroke="rgba(255,255,255,0.6)"
                strokeWidth="2"
              />
              <line
                x1={conn.midX}
                y1={conn.startY}
                x2={conn.midX}
                y2={conn.midY}
                className="connection-line"
                stroke="rgba(255,255,255,0.6)"
                strokeWidth="2"
              />
              <line
                x1={conn.midX}
                y1={conn.midY}
                x2={conn.endX}
                y2={conn.endY}
                className="connection-line"
                stroke="rgba(255,255,255,0.6)"
                strokeWidth="2"
                markerEnd="url(#arrowhead)"
              />
            </>
          ) : (
            <line
              x1={conn.startX}
              y1={conn.startY}
              x2={conn.endX}
              y2={conn.endY}
              className="connection-line"
              stroke="rgba(255,255,255,0.6)"
              strokeWidth="2"
              markerEnd="url(#arrowhead)"
            />
          )}
        </g>
      ))}

      {/* 渲染用户自定义连接线 */}
      {connections.map(connection => {
        const sourceNode = nodes.find(n => n.id === connection.sourceId);
        const targetNode = nodes.find(n => n.id === connection.targetId);

        if (!sourceNode || !targetNode) return null;

        const sourcePosition = calculateNodePosition(
          nodes.findIndex(n => n.id === connection.sourceId),
          nodes
        );
        const targetPosition = calculateNodePosition(
          nodes.findIndex(n => n.id === connection.targetId),
          nodes
        );

        const sourceX = sourcePosition.x + (sourceNode.style.width || NODE_WIDTH);
        const sourceY = sourcePosition.y + 30;
        const targetX = targetPosition.x;
        const targetY = targetPosition.y + 30;

        return (
          <g key={connection.id}>
            <line
              x1={sourceX}
              y1={sourceY}
              x2={targetX}
              y2={targetY}
              className="manual-connection-line"
              stroke="rgba(100, 200, 255, 0.8)"
              strokeWidth="2"
              strokeDasharray="5,5"
              markerEnd="url(#arrowhead)"
            />
            <circle
              cx={sourceX}
              cy={sourceY}
              r="4"
              fill="#64C8FF"
            />
            <circle
              cx={targetX}
              cy={targetY}
              r="4"
              fill="#4CAF50"
            />
          </g>
        );
      })}
    </svg>
  );
};

export default ConnectionLines;