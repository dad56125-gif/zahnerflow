import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ElectrochemicalNode, WorkstationType, validateNodeConnection, NodeType } from '../nodes/types';
import { useCanvasStore } from '../stores/canvasStore';

// Re-defined here for local use, though they originate from the store
interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
}

interface CanvasProps {
  zoomLevel: number;
  selectedWorkstation: WorkstationType | null;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

export const Canvas: React.FC<CanvasProps> = ({
  zoomLevel,
  selectedWorkstation,
  onZoomIn,
  onZoomOut,
  onResetZoom
}) => {
  const {
    nodes,
    connections,
    canvasSize,
    setCanvasSize,
    recalculateNodePositions,
    moveNode,
    selectNode,
    setNodes,
    setConnections,
    addNode,
    validationError,
  } = useCanvasStore();

  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStart, setConnectionStart] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [layoutStable, setLayoutStable] = useState(true);
  const [cachedConnections, setCachedConnections] = useState<Array<{id: string, startX: number, startY: number, endX: number, endY: number, midX?: number, midY?: number, isLShape: boolean}>>([]);

  const NODE_SPACING = 200;
  const CANVAS_ROW_HEIGHT = 150;
  const NODE_START_X = 50;

  useEffect(() => {
    if (!canvasRef.current) return;
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        setCanvasSize(entry.contentRect.width, entry.contentRect.height);
      }
    });
    resizeObserver.observe(canvasRef.current);
    return () => resizeObserver.disconnect();
  }, [setCanvasSize]);

  useEffect(() => {
    if (canvasSize.width > 0) {
        setLayoutStable(false);
        const id = setTimeout(() => {
            recalculateNodePositions();
            setLayoutStable(true);
        }, 50);
        return () => clearTimeout(id);
    }
  }, [canvasSize, recalculateNodePositions]);

  const calculateNodePosition = useCallback((index: number) => {
    const nodesPerRow = Math.max(1, Math.floor((canvasSize.width - 100) / NODE_SPACING));
    const row = Math.floor(index / nodesPerRow);
    const col = index % nodesPerRow;
    const x = NODE_START_X + (row % 2 === 0 ? col : nodesPerRow - 1 - col) * NODE_SPACING;
    const y = 100 + row * CANVAS_ROW_HEIGHT;
    return { x, y };
  }, [canvasSize.width]);

  useEffect(() => {
    if (!layoutStable || nodes.length === 0) return;

    const newConnections = nodes.map((node, index) => {
      if (index >= nodes.length - 1) return null;
      const position = calculateNodePosition(index);
      const nextPosition = calculateNodePosition(index + 1);
      const nodesPerRow = Math.max(1, Math.floor((canvasSize.width - 100) / NODE_SPACING));
      const currentRow = Math.floor(index / nodesPerRow);
      const nextRow = Math.floor((index + 1) / nodesPerRow);

      if (currentRow === nextRow) {
        const isLeftToRight = currentRow % 2 === 0;
        const startX = isLeftToRight ? position.x + (node.style.width || 140) : position.x;
        const endX = isLeftToRight ? nextPosition.x : nextPosition.x + (node.style.width || 140);
        return { id: `line-${index}`, startX, startY: position.y + 30, endX, endY: nextPosition.y + 30, isLShape: false };
      } else {
        const isLeftToRight = currentRow % 2 === 0;
        const startX = isLeftToRight ? position.x + (node.style.width || 140) : position.x;
        const endX = nextRow % 2 === 0 ? nextPosition.x : nextPosition.x + (node.style.width || 140);
        const midX = startX + (isLeftToRight ? 50 : -50);
        return { id: `line-${index}`, startX, startY: position.y + 30, endX, endY: nextPosition.y + 30, midX, midY: nextPosition.y + 30, isLShape: true };
      }
    }).filter(Boolean) as any;

    setCachedConnections(newConnections);
  }, [layoutStable, nodes, canvasSize.width, calculateNodePosition]);

  const startConnection = (nodeId: string) => {
    setIsConnecting(true);
    setConnectionStart(nodeId);
  };

  const completeConnection = (targetNodeId: string) => {
    if (!connectionStart || connectionStart === targetNodeId) {
      setIsConnecting(false);
      setConnectionStart(null);
      return;
    }
    const existing = connections.find(c => c.sourceId === connectionStart && c.targetId === targetNodeId);
    if (!existing) {
      const sourceNode = nodes.find(n => n.id === connectionStart);
      const targetNode = nodes.find(n => n.id === targetNodeId);
      if (sourceNode && targetNode && validateNodeConnection(sourceNode.type, targetNode.type)) {
        const newConnection: Connection = { id: `conn_${Date.now()}`, sourceId: connectionStart, targetId: targetNodeId };
        setConnections([...connections, newConnection]);
      }
    }
    setIsConnecting(false);
    setConnectionStart(null);
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData('nodeType') as NodeType;
    if (nodeType && canvasRef.current && selectedWorkstation) {
      const rect = canvasRef.current.getBoundingClientRect();
      const dropX = (e.clientX - rect.left) / zoomLevel;
      const dropY = (e.clientY - rect.top) / zoomLevel;
      const index = useCanvasStore.getState().calculateNodeIndex({ x: dropX, y: dropY }, canvasSize.width, nodes.length);
      addNode(nodeType, selectedWorkstation, index);
    }
  };

  return (
    <div
      className="canvas-container"
      ref={canvasRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleCanvasDrop}
    >
      {/* 网格背景 - 外层框架，不随缩放变化 */}
      <div className="canvas-grid"></div>

      {/* 缩放控制按钮 - 外层框架，不随缩放变化 */}
      <div className="zoom-controls">
        <button className="btn-zoom" onClick={onZoomOut} title="缩小">
          ➖
        </button>
        <button className="btn-zoom" onClick={onResetZoom} title="重置缩放">
          🎯
        </button>
        <button className="btn-zoom" onClick={onZoomIn} title="放大">
          ➕
        </button>
      </div>

      {/* 可缩放的内容区域 */}
      <div
        className="canvas-inner"
        style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }}
      >
        {/* 渲染连接线 - 随内容缩放 */}
        <svg className="connections-layer" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          {cachedConnections.map((conn) => (
            <g key={conn.id}>
              {conn.isLShape ? (
                <>
                  <line
                    x1={conn.startX}
                    y1={conn.startY}
                    x2={conn.midX}
                    y2={conn.midY}
                    stroke="rgba(255,255,255,0.5)"
                    strokeWidth="2"
                  />
                  <line
                    x1={conn.midX}
                    y1={conn.midY}
                    x2={conn.endX}
                    y2={conn.endY}
                    stroke="rgba(255,255,255,0.5)"
                    strokeWidth="2"
                  />
                </>
              ) : (
                <line
                  x1={conn.startX}
                  y1={conn.startY}
                  x2={conn.endX}
                  y2={conn.endY}
                  stroke="rgba(255,255,255,0.5)"
                  strokeWidth="2"
                />
              )}
            </g>
          ))}
        </svg>

        {/* 渲染画布上的节点 - 随内容缩放 */}
        {nodes.map((node) => (
          <div
            key={node.id}
            className={`node glass status-${node.status}`}
            style={{
              left: node.position.x,
              top: node.position.y,
              width: node.style.width || 140,
              height: node.style.height || 60,
            }}
            onClick={() => selectNode(node)}
          >
            <div className="node-title">{node.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
};