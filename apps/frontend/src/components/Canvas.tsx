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

  // Y轴拖动相关状态
  const [isDragEnabled, setIsDragEnabled] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [canvasOffsetY, setCanvasOffsetY] = useState(0);
  const dragStartScrollY = useRef(0);

  // 拖动切换处理
  const toggleDragMode = () => {
    setIsDragEnabled(!isDragEnabled);
    // 如果取消拖动模式，重置偏移量
    if (isDragEnabled) {
      setCanvasOffsetY(0);
    }
  };

  const CANVAS_ROW_HEIGHT = 150;
  const NODE_WIDTH = 140; // 节点默认宽度

  useEffect(() => {
    if (!canvasRef.current) return;

    let timeoutId: NodeJS.Timeout;
    const DEBOUNCE_DELAY = 16; // 约60fps的微小防抖窗口

    const resizeObserver = new ResizeObserver(entries => {
      // 清除之前的定时器
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // 设置新的定时器
      timeoutId = setTimeout(() => {
        for (const entry of entries) {
          setCanvasSize(entry.contentRect.width, entry.contentRect.height);
        }
      }, DEBOUNCE_DELAY);
    });

    resizeObserver.observe(canvasRef.current);

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resizeObserver.disconnect();
    };
  }, [setCanvasSize]);


  // 动态计算节点布局配置 - 安全的动态宽度计算
  const calculateDynamicLayout = useCallback(() => {
    const padding = 100; // canvas左右预留边距
    const availableWidth = canvasSize.width - (padding * 2); // 可用宽度

    // 计算在最小间距下能容纳的最大节点数
    const maxNodesPerRow = Math.max(1, Math.floor(availableWidth / (NODE_WIDTH + 60)));

    // 根据当前节点总数决定每行实际节点数
    const totalNodes = nodes.length;
    const actualNodesPerRow = Math.min(maxNodesPerRow, totalNodes);

    let spacing = 0;
    let startX = padding;

    if (actualNodesPerRow === 1) {
      // 单个节点在可用范围内完全居中 - 安全访问节点
      const firstNode = nodes[0];
      const firstNodeWidth = firstNode?.style?.width || NODE_WIDTH;
      startX = padding + (availableWidth - firstNodeWidth) / 2;
      spacing = 0;
    } else {
      // 每行真正的两端对齐：
      // 第一个节点左边缘距离左边框 = 最后一个节点右边缘距离右边框
      // 节点之间间隔相等
      // 安全计算前actualNodesPerRow个节点的实际宽度总和
      let totalNodesWidth = 0;
      for (let i = 0; i < actualNodesPerRow && i < nodes.length; i++) {
        const node = nodes[i];
        totalNodesWidth += node?.style?.width || NODE_WIDTH;
      }

      const totalSpacingWidth = availableWidth - totalNodesWidth;
      spacing = totalSpacingWidth / (actualNodesPerRow - 1);

      // 起始位置就是左padding，确保第一个节点左边缘距离canvas左边框正好是padding
      startX = padding;
    }

    return {
      nodesPerRow: actualNodesPerRow,
      spacing: spacing,
      startX: startX,
      connectionLength: spacing
    };
  }, [canvasSize.width, nodes.length]);

  // 重构：将节点位置计算移到 useEffect 内部，避免循环依赖
  const calculateNodePosition = useCallback((index: number, nodesArray: ElectrochemicalNode[]) => {
    const padding = 100; // canvas左右预留边距
    const availableWidth = canvasSize.width - (padding * 2); // 可用宽度

    const { nodesPerRow } = calculateDynamicLayout();
    const row = Math.floor(index / nodesPerRow);
    const col = index % nodesPerRow;

    // 获取当前行的节点
    const rowStartIndex = row * nodesPerRow;
    const rowEndIndex = Math.min(rowStartIndex + nodesPerRow, nodesArray.length);
    const nodesInThisRow = nodesArray.slice(rowStartIndex, rowEndIndex);

    let x, spacing, startX;

    if (nodesInThisRow.length === 1 && row === 0) {
      // 第一行的单个节点在可用范围内完全居中
      const nodeWidth = nodesInThisRow[0]?.style?.width || NODE_WIDTH;
      startX = padding + (availableWidth - nodeWidth) / 2;
      spacing = 0;
      x = startX;
    } else {
      // 每行独立计算间距，实现真正的两端对齐
      let totalNodesWidth = 0;
      for (const node of nodesInThisRow) {
        totalNodesWidth += node?.style?.width || NODE_WIDTH;
      }

      const totalSpacingWidth = availableWidth - totalNodesWidth;
      spacing = totalSpacingWidth / (nodesInThisRow.length - 1);
      startX = padding; // 第一个节点左边缘距离左边框 = padding

      // 计算当前节点的X位置，考虑Z字形排列
      if (row % 2 === 0) {
        // 奇数行：从左到右（正常顺序）
        x = startX;
        for (let i = 0; i < col; i++) {
          const nodeWidth = nodesInThisRow[i]?.style?.width || NODE_WIDTH;
          x += nodeWidth + spacing;
        }
      } else {
        // 偶数行：从右到左（反向顺序）
        x = startX;
        for (let i = 0; i < nodesInThisRow.length - 1 - col; i++) {
          const nodeWidth = nodesInThisRow[i]?.style?.width || NODE_WIDTH;
          x += nodeWidth + spacing;
        }
      }
    }

    const y = 100 + row * CANVAS_ROW_HEIGHT;
    return { x, y };
  }, [calculateDynamicLayout, canvasSize.width]);

  // 使用两端对齐算法更新节点位置 - 移除延迟，立即计算避免抽搐
  useEffect(() => {
    if (canvasSize.width > 0 && nodes.length > 0) {
        setLayoutStable(false);
        // 立即计算并设置最终位置，移除setTimeout避免视觉抽搐
        const updatedNodes = nodes.map((node, index) => {
            const newPosition = calculateNodePosition(index, nodes);
            return {
                ...node,
                position: newPosition
            };
        });
        setNodes(updatedNodes);
        setLayoutStable(true);
    }
  }, [canvasSize, nodes.length, calculateNodePosition, setNodes]); // 恢复nodes.length依赖，移除延迟

  useEffect(() => {
    if (!layoutStable || nodes.length === 0) return;

    const newConnections = nodes.map((node, index) => {
      if (index >= nodes.length - 1) return null;
      const position = calculateNodePosition(index, nodes);
      const nextPosition = calculateNodePosition(index + 1, nodes);
      const { nodesPerRow, connectionLength } = calculateDynamicLayout();
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
        const midX = startX + (isLeftToRight ? connectionLength : -connectionLength);
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

  // Y轴拖动事件处理
  const handleMouseDown = (e: React.MouseEvent) => {
    // 只有在拖动激活状态下才能拖动
    if (!isDragEnabled) return;

    // 只响应左键点击
    if (e.button !== 0) return;

    // 检查点击的是否为canvas-inner区域（而不是节点或其他元素）
    const target = e.target as HTMLElement;
    if (target.closest('.node') || target.closest('.zoom-controls') || target.closest('.btn-zoom')) {
      return;
    }

    setIsDragging(true);
    setDragStartY(e.clientY);
    dragStartScrollY.current = canvasOffsetY;

    // 防止选中文字
    e.preventDefault();
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    // 计算Y轴移动距离
    const deltaY = e.clientY - dragStartY;
    const newOffsetY = dragStartScrollY.current + deltaY;

    setCanvasOffsetY(newOffsetY);
  }, [isDragging, dragStartY]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
    }
  }, [isDragging]);

  // 全局鼠标事件监听
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

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
        {/* 拖动切换按钮 */}
        <button
          className={`btn-zoom btn-drag-toggle ${isDragEnabled ? 'active' : ''}`}
          onClick={toggleDragMode}
          title={isDragEnabled ? "关闭拖动模式" : "开启拖动模式"}
        >
          ✋
        </button>

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
        style={{
          transform: `scale(${zoomLevel}) translateY(${canvasOffsetY}px)`,
          transformOrigin: 'top left',
          cursor: isDragEnabled ? (isDragging ? 'grabbing' : 'grab') : 'default',
          minHeight: '300vh' // 扩大内容区域以实现无限画板效果
        }}
        onMouseDown={handleMouseDown}
      >
        {/* 渲染连接线 - 临时屏蔽 */}
        {/* <svg className="connections-layer" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
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
        </svg> */}

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