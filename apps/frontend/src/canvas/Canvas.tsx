import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ElectrochemicalNode, WorkstationType, NodeType } from '../types/nodes';
import { useCanvasStore } from './canvasStore';
import { NodeRenderer } from './NodeRenderer';
import { ComputedConnectionLines } from './ComputedConnectionLines';
import { Toolbar } from '../components/Toolbar';
import { LoopBoundary } from './LoopBoundary';
import { WorkflowManagerUI } from '../components/features/workflow';
import { WorkflowIdDisplay } from '../components/common/WorkflowIdDisplay';
import { useUnifiedLayout } from './useUnifiedLayout';
import { useSimpleLoopDetection, type SimpleLoopInfo } from './useSimpleLoopDetection';

interface CanvasProps {
  zoomLevel: number;
  selectedWorkstation: WorkstationType | null;
  isRunning: boolean;
  hasError: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  showWorkflowManager?: boolean;
  onToggleWorkflowManager?: () => void;
  showFilePathManager?: boolean;
  onToggleFilePathManager?: () => void;
  onFilePathSave?: (config: any) => void;
  onRunFlow?: () => void;
  onStopFlow?: () => void;
  onResetFlow?: () => void;
  onLoopDetected?: (loops: SimpleLoopInfo[]) => void;
}

export const Canvas: React.FC<CanvasProps> = ({
  zoomLevel,
  selectedWorkstation,
  isRunning,
  hasError,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  showWorkflowManager = false,
  onToggleWorkflowManager,
  showFilePathManager = false,
  onToggleFilePathManager,
  onFilePathSave,
  onRunFlow,
  onStopFlow,
  onResetFlow,
  onLoopDetected
}) => {
    const {
    nodes,
    selectedNode,
    canvasSize,
    setCanvasSize,
    selectNode,
    setNodes,
    addNode,
  } = useCanvasStore();

  // 使用统一布局hook生成计算属性的位置和连接线
  const { layoutNodes, layoutEdges, actualColumns, adjustedDimensions } = useUnifiedLayout(
    nodes,
    {
      mode: 'dynamic-responsive',
      zoomAware: true,
      minColumns: 2,
      maxColumns: 8,
      minNodeWidth: 140,
      containerPadding: 50
    },
    canvasSize.width,
    zoomLevel
  );

  const canvasRef = useRef<HTMLDivElement>(null);
  const [layoutStable, setLayoutStable] = useState(true);

  // Y轴拖动相关状态
  const [isDragEnabled, setIsDragEnabled] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [canvasOffsetY, setCanvasOffsetY] = useState(0);
  const dragStartScrollY = useRef(0);

  // 循环系统状态
  const detectedLoops = useSimpleLoopDetection(nodes);

  // 循环检测回调
  useEffect(() => {
    if (onLoopDetected) {
      onLoopDetected(detectedLoops);
    }
  }, [detectedLoops, onLoopDetected]);

  // 拖动切换处理
  const toggleDragMode = useCallback(() => {
    setIsDragEnabled(prev => {
      if (prev) setCanvasOffsetY(0); // 关闭时重置偏移
      return !prev;
    });
  }, []);

  // Canvas 尺寸监听（防抖）
  useEffect(() => {
    if (!canvasRef.current) return;

    let timeoutId: NodeJS.Timeout;
    const DEBOUNCE_DELAY = 50;

    const resizeObserver = new ResizeObserver(entries => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        for (const entry of entries) {
          setCanvasSize(entry.contentRect.width, entry.contentRect.height);
        }
      }, DEBOUNCE_DELAY);
    });

    resizeObserver.observe(canvasRef.current);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      resizeObserver.disconnect();
    };
  }, [setCanvasSize]);

  // 布局状态管理
  useEffect(() => {
    if (canvasSize.width > 0 && nodes.length > 0) {
      setLayoutStable(false);
      requestAnimationFrame(() => {
        setLayoutStable(true);
      });
    }
  }, [canvasSize.width, nodes.length, zoomLevel]);

  // 拖放处理（从工具栏拖入）
  const handleCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData('nodeType') as NodeType;

    if (nodeType && canvasRef.current && selectedWorkstation) {
      const rect = canvasRef.current.getBoundingClientRect();
      const dropX = (e.clientX - rect.left) / zoomLevel;
      const dropY = (e.clientY - rect.top) / zoomLevel;

      // 使用统一布局的实际列数和调整后尺寸进行估算
      const estimatedColumns = actualColumns || 4;
      const estimatedRow = Math.floor(dropY / ((adjustedDimensions?.nodeHeight || 60) + (adjustedDimensions?.spacing || 40)));
      const estimatedCol = Math.floor(dropX / ((adjustedDimensions?.nodeWidth || 200) + (adjustedDimensions?.spacing || 40)));
      const estimatedIndex = Math.min(estimatedRow * estimatedColumns + estimatedCol, nodes.length);

      addNode(nodeType, selectedWorkstation, estimatedIndex);
    }
  }, [canvasSize.width, nodes, zoomLevel, selectedWorkstation, addNode, actualColumns, adjustedDimensions]);

  // 节点交互事件
  const handleNodeClick = useCallback((node: ElectrochemicalNode) => {
    selectNode(node);
  }, [selectNode]);

  const handleNodeDoubleClick = useCallback((_node: ElectrochemicalNode) => {
    // 预留双击扩展槽位
  }, []);

  const handleNodeContextMenu = useCallback((node: ElectrochemicalNode, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    // 简化的删除确认
    if (window.confirm(`确定要删除节点 "${node.name}" 吗？`)) {
        const newNodes = nodes.filter(n => n.id !== node.id);
        setNodes(newNodes);
    }
  }, [nodes, setNodes]);

  const handleNodeDragStartEnhanced = useCallback((node: ElectrochemicalNode, event: React.DragEvent) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('nodeId', node.id);
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.opacity = '0.5';
    }
  }, []);

  // 🔥 核心修复：解决拖拽导致节点丢失的问题
  const handleNodeDragEndEnhanced = useCallback((draggedNode: ElectrochemicalNode, event: React.DragEvent) => {
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.opacity = '1';
    }

    // ✅ 关键点：直接从 Store 获取最新的节点列表，而不是依赖闭包中的 nodes
    // 这避免了因 NodeRenderer Memoization 导致闭包过期而引用旧数据的问题
    const currentNodes = useCanvasStore.getState().nodes;

    const target = event.target as HTMLElement;
    const canvasRect = target.closest('.canvas-container')?.getBoundingClientRect();

    if (!canvasRect) return;

    // 计算相对于画布的鼠标位置
    const mousePosition = {
      x: event.clientX - canvasRect.left,
      y: event.clientY - canvasRect.top
    };

    // 找到被拖拽节点的当前索引
    const fromIndex = currentNodes.findIndex(n => n.id === draggedNode.id);
    if (fromIndex === -1) return;

    // 根据鼠标位置计算目标索引
    const { calculateNodeIndex } = useCanvasStore.getState();
    const canvasWidth = canvasSize.width;
    const rawTargetIndex = calculateNodeIndex(mousePosition, canvasWidth, currentNodes.length);
    const toIndex = Math.min(
      Math.max(0, rawTargetIndex),
      currentNodes.length - 1
    );

    // 如果不是同一个索引，重新排序数组
    if (fromIndex !== toIndex) {
      const newNodes = [...currentNodes];
      const [movedNode] = newNodes.splice(fromIndex, 1);
      newNodes.splice(toIndex, 0, movedNode);
      setNodes(newNodes);
    }
  }, [canvasSize.width, setNodes]); // 移除 'nodes' 依赖

  // Y轴拖动逻辑
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isDragEnabled || e.button !== 0) return;

    const target = e.target as HTMLElement;
    if (target.closest('.node') || target.closest('.zoom-controls') || target.closest('.toolbar')) {
      return;
    }

    setIsDragging(true);
    setDragStartY(e.clientY);
    dragStartScrollY.current = canvasOffsetY;
    e.preventDefault();
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const deltaY = e.clientY - dragStartY;
    setCanvasOffsetY(dragStartScrollY.current + deltaY);
  }, [isDragging, dragStartY]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

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

  // 节点位置映射缓存（用于 LoopBoundary）
  const nodePositions = useMemo(() => {
    return layoutNodes.map(node => ({
      id: node.id,
      name: node.name,
      x: node.position.x,
      y: node.position.y,
      width: node.style?.width || adjustedDimensions?.nodeWidth || 140,
      height: node.style?.height || adjustedDimensions?.nodeHeight || 60
    }));
  }, [layoutNodes, adjustedDimensions]);

  return (
    <div
      className="canvas-container glass"
      ref={canvasRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleCanvasDrop}
    >
      {/* 网格背景 */}
      <div className="canvas-grid"></div>

      {/* Toolbar */}
      {onRunFlow && onStopFlow && (
        <Toolbar
          onRunFlow={onRunFlow}
          onStopFlow={onStopFlow}
          onResetFlow={onResetFlow}
          selectedWorkstation={selectedWorkstation}
          isRunning={isRunning}
          hasError={hasError}
          onToggleWorkflowManager={onToggleWorkflowManager}
          showWorkflowManager={showWorkflowManager}
          showFilePathManager={showFilePathManager}
          onToggleFilePathManager={onToggleFilePathManager}
          onFilePathSave={onFilePathSave}
        />
      )}

      {/* 缩放控制区域 */}
      <div className="zoom-controls">
        <button
          className={`btn-zoom btn-drag-toggle ${isDragEnabled ? 'active' : ''}`}
          onClick={toggleDragMode}
          title={isDragEnabled ? "关闭拖动模式" : "开启拖动模式"}
        >
          ✋
        </button>
        <button className="btn-zoom" onClick={onZoomOut} title="缩小">➖</button>
        <button className="btn-zoom" onClick={onResetZoom} title="重置缩放">🎯</button>
        <button className="btn-zoom" onClick={onZoomIn} title="放大">➕</button>
      </div>

      {/* 可缩放画布内容 */}
      <div
        className="canvas-inner"
        style={{
          transform: `scale(${zoomLevel}) translateY(${canvasOffsetY}px)`,
          transformOrigin: 'top left',
          cursor: isDragEnabled ? (isDragging ? 'grabbing' : 'grab') : 'default',
          minHeight: '300vh'
        }}
        onMouseDown={handleMouseDown}
      >
        <ComputedConnectionLines
          layoutEdges={layoutEdges}
          layoutStable={layoutStable}
          zoomLevel={zoomLevel}
        />

        {detectedLoops.map(loop => (
          <LoopBoundary
            key={loop.id}
            loop={loop}
            nodes={nodePositions}
            zoomLevel={zoomLevel}
            canvasOffsetY={canvasOffsetY}
          />
        ))}

        {layoutNodes.map((node, index) => {
          const nodeKey = `${node.id}-${node.position.x}-${node.position.y}-${actualColumns}`;
          const dragEnabled = !isRunning;

          return (
            <NodeRenderer
              key={nodeKey}
              node={node}
              index={index}
              isSelected={selectedNode?.id === node.id}
              isConnecting={false}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={handleNodeDoubleClick}
              onNodeContextMenu={handleNodeContextMenu}
              onNodeDragStart={dragEnabled ? handleNodeDragStartEnhanced : undefined}
              onNodeDragEnd={dragEnabled ? handleNodeDragEndEnhanced : undefined}
            />
          );
        })}
      </div>

      {/* 模态框与浮层 */}
      {showWorkflowManager && (
        <WorkflowManagerUI onClose={onToggleWorkflowManager} />
      )}
      {showFilePathManager && (
        <div className="file-path-manager-overlay-container"></div>
      )}
      <WorkflowIdDisplay />
    </div>
  );
};