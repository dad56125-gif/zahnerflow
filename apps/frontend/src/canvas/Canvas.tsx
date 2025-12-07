import React, { useState, useRef, useEffect, useCallback } from 'react';
// 导入新的类型
import { NodeType, WorkstationType } from '../types/Interfaces';
import { useCanvasStore } from './canvasStore';
import { NodeRenderer } from './NodeRenderer';
import { ComputedConnectionLines } from './ComputedConnectionLines';
import { Toolbar } from '../components/Toolbar';
import { LoopBoundary } from './LoopBoundary';
import { WorkflowManagerUI } from '../workflow/WorkflowManagerUI';
import { WorkflowIdDisplay } from '../workflow/WorkflowIdDisplay';
import { useUnifiedLayout, DisplayNode } from './useUnifiedLayout';
import { useSimpleLoopDetection, SimpleLoopInfo } from './useSimpleLoopDetection';

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

  // 2. 生成渲染视图 (View Model)
  const { layoutNodes, layoutEdges, actualColumns, adjustedDimensions } = useUnifiedLayout(
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

  // Y轴拖动相关状态
  const [isDragEnabled, setIsDragEnabled] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [canvasOffsetY, setCanvasOffsetY] = useState(0);
  const dragStartScrollY = useRef(0);

  // 3. 循环检测 (传入渲染节点，需要提取原始类型)
  // 适配：SimpleLoopDetection 需要知道类型是 'loop_start' 等
  // 我们传入 layoutNodes，它们的 data._nodeType 存储了原始类型
  // 但为了兼容旧Hook，我们需要构造一个兼容对象或修改 Hook
  // 这里选择传入 raw nodes 给 Hook
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
    const estRow = Math.floor(((mousePosition.y / zoomLevel) - 100/zoomLevel) / rowHeight);

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

        {/* 🔥 修改：达到 0.6 时禁用缩小按钮 */}
        <button
          className="btn-zoom"
          onClick={onZoomOut}
          title="缩小"
          disabled={zoomLevel <= 0.601} // 加一点点容差处理浮点数精度
          style={{ opacity: zoomLevel <= 0.601 ? 0.5 : 1, cursor: zoomLevel <= 0.601 ? 'not-allowed' : 'pointer' }}
        >
          ➖
        </button>

        <button className="btn-zoom" onClick={onResetZoom} title="重置缩放">🎯</button>

        {/* 🔥 修改：达到 1.2 时禁用放大按钮 */}
        <button
          className="btn-zoom"
          onClick={onZoomIn}
          title="放大"
          disabled={zoomLevel >= 1.199} // 加一点点容差
          style={{ opacity: zoomLevel >= 1.199 ? 0.5 : 1, cursor: zoomLevel >= 1.199 ? 'not-allowed' : 'pointer' }}
        >
          ➕
        </button>
      </div>

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
        <ComputedConnectionLines
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