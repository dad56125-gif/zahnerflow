import React, { useState, useRef, useEffect, useCallback } from 'react';
// 导入新的类型
import { NodeType, WorkstationType } from '../types/Interfaces';
import { useCanvasStore } from '../state/canvasStore';
import { useExecutionStore } from '../state/executionStateBridge'; // 新增：读取执行状态
import { NodeRenderer } from './NodeRenderer';
import { ConnectionLines } from './ConnectionLines';
import { Toolbar } from '../components/Toolbar';
import { LoopBoundary } from './LoopBoundary';
import { WorkflowManagerUI } from '../components/WorkflowManagerUI';
import { WorkflowIdDisplay } from '../components/WorkflowIdDisplay';
import { useLayout, DisplayNode } from './useLayout';
import { useLoopDetection, SimpleLoopInfo } from './useLoopDetection';
import { useCanvasDrag } from './useCanvasDrag';
import { ZoomControls } from './ZoomControls';

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
  // 报告相关
  onGenerateReport?: () => void;
  canGenerateReport?: boolean;
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
  onLoopDetected,
  onGenerateReport,
  canGenerateReport = false
}) => {
  // 1. 从 Store 获取纯数据和 Actions
  const {
    nodes, // WorkflowNode[]
    selectedNodeId,
    canvasSize,
    setCanvasSize,
    selectNode,
    setNodes, // 用于重排序
    addNode,
    reorderNode // 假设你在 Store 中实现了这个 Action
  } = useCanvasStore();

  // 🔥 新增：从执行状态桥读取节点状态
  const nodeStatuses = useExecutionStore(state => state.nodeStatuses);

  // 2. 生成渲染视图 (View Model)
  const { layoutNodes, layoutEdges, actualColumns, adjustedDimensions } = useLayout(
    nodes, // 显式传入，触发更新
    {
      zoomAware: true,
      minColumns: 2,
      maxColumns: 8,
      minNodeWidth: 140,
      containerPadding: 50,
      startOffset: {
        x: 50,
        y: 100 / zoomLevel
      }
    },
    canvasSize.width,
    zoomLevel
  );

  const canvasRef = useRef<HTMLDivElement>(null);
  const [layoutStable, setLayoutStable] = useState(true);

  // 使用拖动 Hook
  const {
    isDragEnabled,
    isDragging,
    canvasOffsetY,
    toggleDragMode,
    handleMouseDown
  } = useCanvasDrag();

  // 3. 循环检测
  const detectedLoops = useLoopDetection(nodes);

  // 循环检测回调
  useEffect(() => {
    if (onLoopDetected) {
      onLoopDetected(detectedLoops);
    }
  }, [detectedLoops, onLoopDetected]);

  // 拖动切换处理已移至 useCanvasDrag hook

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

  // 从 Toolbar 拖入添加
  const handleCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData('nodeType') as NodeType;
    if (nodeType) {
      addNode(nodeType); // 默认添加到末尾，如需插入特定位置需计算索引
    }
  }, [addNode]);

  // 节点交互事件
  const handleNodeClick = useCallback((node) => {
    selectNode(node.id);
  }, [selectNode]);

  const handleNodeDoubleClick = useCallback((_node) => {
    // 预留双击扩展槽位
  }, []);

  const handleNodeContextMenu = useCallback((node, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    // 简化的删除确认
    if (window.confirm(`确定要删除节点 "${node.name}" 吗？`)) {
      const newNodes = nodes.filter(n => n.id !== node.id);
      setNodes(newNodes);
    }
  }, [nodes, setNodes]);

  const handleNodeDragStartEnhanced = useCallback((node, event: React.DragEvent) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('nodeId', node.id);
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.opacity = '0.5';
    }
  }, []);

  // 节点拖拽重排序逻辑 (核心修改)
  const handleNodeDragEndEnhanced = useCallback((draggedNode: DisplayNode, event: React.DragEvent) => {
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.opacity = '1';
    }

    const currentNodes = useCanvasStore.getState().nodes;
    const target = event.target as HTMLElement;
    const canvasRect = target.closest('.canvas-container')?.getBoundingClientRect();
    if (!canvasRect) return;

    const mousePosition = {
      x: event.clientX - canvasRect.left,
      y: event.clientY - canvasRect.top
    };

    // 简单估算目标索引 (基于网格)
    const colWidth = (adjustedDimensions.nodeWidth + adjustedDimensions.spacing);
    const rowHeight = (adjustedDimensions.nodeHeight + adjustedDimensions.spacing);

    // 考虑 Canvas 偏移和缩放
    const effectiveX = (mousePosition.x) / zoomLevel;
    // 简化处理，实际应该反算 layout 逻辑，这里做一个简单的网格映射近似
    const estCol = Math.floor((effectiveX - 50) / colWidth);
    const estRow = Math.floor(((mousePosition.y / zoomLevel) - 100 / zoomLevel) / rowHeight);

    // 需要知道当前是几列
    const cols = actualColumns;
    // 蛇形布局索引反算
    let targetIndex = -1;
    if (estRow >= 0 && estCol >= 0 && estCol < cols) {
      const isLeftToRight = estRow % 2 === 0;
      const visualCol = isLeftToRight ? estCol : (cols - 1 - estCol);
      targetIndex = estRow * cols + visualCol;
    }

    const fromIndex = currentNodes.findIndex(n => n.id === draggedNode.id);

    if (targetIndex !== -1 && fromIndex !== -1 && targetIndex !== fromIndex) {
      // 调用 Store 进行重排序
      // 修正越界
      targetIndex = Math.min(Math.max(0, targetIndex), currentNodes.length - 1);

      reorderNode(fromIndex, targetIndex);
    }
  }, [actualColumns, adjustedDimensions, zoomLevel, reorderNode]);

  // Y轴拖动逻辑已移至 useCanvasDrag hook


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
          onGenerateReport={onGenerateReport}
          canGenerateReport={canGenerateReport}
        />
      )}

      {/* 缩放控制区域 */}
      <ZoomControls
        zoomLevel={zoomLevel}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onResetZoom={onResetZoom}
        isDragEnabled={isDragEnabled}
        onToggleDrag={toggleDragMode}
      />

      {/* 可缩放画布内容 */}
      <div
        className="canvas-inner"
        style={{
          // 🔥 核心修改 1: 将变换原点改回左上角
          transformOrigin: '0 0',

          // 🔥 核心修改 2: 容器宽度设为"逻辑宽度" (100% 除以缩放比例)
          // 例如：缩放 0.5 时，容器宽度变成 200%，缩放后刚好填满屏幕
          width: `${100 / zoomLevel}%`,

          // 🔥 核心修改 3: 高度也同步调整，保证拖拽区域足够大
          minHeight: `${100 / zoomLevel}vh`,

          transform: `scale(${zoomLevel}) translateY(${canvasOffsetY}px)`,
          cursor: isDragEnabled ? (isDragging ? 'grabbing' : 'grab') : 'default',
        }}
        onMouseDown={handleMouseDown}
      >
        <ConnectionLines
          layoutEdges={layoutEdges}
          layoutStable={layoutStable}
          zoomLevel={zoomLevel}
        />

        {detectedLoops.map(loop => (
          <LoopBoundary
            key={loop.id}
            loop={loop}
            nodes={layoutNodes}
            // ⚠️ 注意：这里传入 zoomLevel 仅用于线宽/字号的视觉微调，
            // 坐标计算不应再乘 zoomLevel (见下文 LoopBoundary 修改)
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
              isSelected={selectedNodeId === node.id}
              isConnecting={false}
              nodeStatus={nodeStatuses[index] || 'idle'} // 🔥 传递真实节点状态
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