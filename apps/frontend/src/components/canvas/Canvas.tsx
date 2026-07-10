import React, { useState, useRef, useEffect, useCallback } from 'react';
// 导入新的类型
import type { NodeType, WorkstationType } from '@zahnerflow/types';
import { useCanvasStore } from '../../state/canvasStore';
import { useExecutionStore } from '../../state/executionStateBridge'; // 新增：读取执行状态
import { NodeRenderer } from './NodeRenderer';
import { ConnectionLines } from './ConnectionLines';
import { Toolbar } from '../Toolbar';
import { LoopBoundary } from './LoopBoundary';
import { useLayout, DisplayNode } from './useLayout';
import { useLoopDetection, SimpleLoopInfo } from './useLoopDetection';
import type { RunFlowHandler } from '../../types/executionControl';

interface CanvasProps {
  selectedWorkstation: WorkstationType | null;
  isRunning: boolean;
  isCancelling?: boolean;
  hasError: boolean;
  workflowBlockRunBlocked?: boolean;
  onRunFlow?: RunFlowHandler;
  onResetFlow?: () => void;
  onLoopDetected?: (loops: SimpleLoopInfo[]) => void;
  onGenerateReport?: () => void;
  onUnrollViewOpenChange?: (open: boolean) => void;
  autoStartupConfig?: Record<string, any>;
  runMetadataWarning?: string | null;
}

export const Canvas: React.FC<CanvasProps> = ({
  selectedWorkstation,
  isRunning,
  isCancelling = false,
  hasError,
  workflowBlockRunBlocked = false,
  onRunFlow,
  onResetFlow,
  onLoopDetected,
  onGenerateReport,
  onUnrollViewOpenChange,
  autoStartupConfig,
  runMetadataWarning,
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
      minColumns: 1,
      maxColumns: 8,
      nodeWidth: 132,
      nodeHeight: 48,
      spacing: 22,
      segmentLength: 20,
      minNodeWidth: 108,
      maxNodeWidth: 176,
      containerPadding: 42,
      startOffset: {
        x: 42,
        y: 74
      }
    },
    canvasSize.width
  );

  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [layoutStable, setLayoutStable] = useState(true);

  // 3. 循环检测
  const detectedLoops = useLoopDetection(nodes);

  // 循环检测回调
  useEffect(() => {
    if (onLoopDetected) {
      onLoopDetected(detectedLoops);
    }
  }, [detectedLoops, onLoopDetected]);

  // Canvas 尺寸监听（防抖）
  useEffect(() => {
    if (!viewportRef.current) return;

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

    resizeObserver.observe(viewportRef.current);
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
  }, [canvasSize.width, nodes.length]);

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
    const viewport = viewportRef.current;
    if (!viewport) return;

    const viewportRect = viewport.getBoundingClientRect();
    const dropPosition = {
      x: event.clientX - viewportRect.left + viewport.scrollLeft,
      y: event.clientY - viewportRect.top + viewport.scrollTop
    };

    const nearestNode = layoutNodes.reduce<DisplayNode | null>((nearest, node) => {
      const nodeCenter = {
        x: node.position.x + node.style.width / 2,
        y: node.position.y + node.style.height / 2
      };
      const distance = Math.hypot(dropPosition.x - nodeCenter.x, dropPosition.y - nodeCenter.y);
      const nearestDistance = nearest
        ? Math.hypot(
          dropPosition.x - (nearest.position.x + nearest.style.width / 2),
          dropPosition.y - (nearest.position.y + nearest.style.height / 2)
        )
        : Number.POSITIVE_INFINITY;
      return distance < nearestDistance ? node : nearest;
    }, null);

    if (!nearestNode) return;

    const fromIndex = currentNodes.findIndex(n => n.id === draggedNode.id);
    const targetIndex = currentNodes.findIndex(n => n.id === nearestNode.id);

    if (targetIndex !== -1 && fromIndex !== -1 && targetIndex !== fromIndex) {
      reorderNode(fromIndex, targetIndex);
    }
  }, [layoutNodes, reorderNode]);

  return (
    <div
      className="canvas glass-layout"
      ref={canvasRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleCanvasDrop}
    >
      {/* 网格背景 */}
      <div className="canvas__grid"></div>

      {/* Toolbar */}
      {onRunFlow && (
        <Toolbar
          onRunFlow={onRunFlow}
          onResetFlow={onResetFlow}
          selectedWorkstation={selectedWorkstation}
          isRunning={isRunning}
          isCancelling={isCancelling}
          hasError={hasError}
          workflowBlockRunBlocked={workflowBlockRunBlocked}
          onGenerateReport={onGenerateReport}
          onUnrollViewOpenChange={onUnrollViewOpenChange}
          autoStartupConfig={autoStartupConfig}
          runMetadataWarning={runMetadataWarning}
        />
      )}

      <div
        className="canvas__viewport"
        ref={viewportRef}
      >
        <div
          className="canvas__inner"
          style={{
            width: Math.max(canvasSize.width, adjustedDimensions.contentWidth),
            height: Math.max(canvasSize.height, adjustedDimensions.contentHeight),
          }}
        >
          <ConnectionLines
            layoutEdges={layoutEdges}
            layoutStable={layoutStable}
          />

          {detectedLoops.map(loop => (
            <LoopBoundary
              key={loop.id}
              loop={loop}
              nodes={layoutNodes}
            />
          ))}

          {layoutNodes.map((node, index) => {
            const dragEnabled = !isRunning;

            return (
              <NodeRenderer
                key={node.id}
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
      </div>
    </div>
  );
};
