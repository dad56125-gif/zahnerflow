import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ElectrochemicalNode, WorkstationType, NodeType } from '../types/nodes';
import { useCanvasStore } from '../services/stores/canvasStore';
import { NodeRenderer } from './NodeRenderer';
import { ComputedConnectionLines } from './ComputedConnectionLines';
import { Toolbar } from './Toolbar';
import {
  LoopDetector,
  LoopContextManager,
  LoopBoundary,
  LoopInfo,
  LoopExecutionContext,
  LoopSystemController
} from './features/loop';
import { WorkflowManagerUI } from './features/workflow';
import { WorkflowIdDisplay } from './common/WorkflowIdDisplay';
import {
  layout_service,
  LayoutCalculationOptions
} from '../services/layout';
import { useSnakeLayout } from '../hooks/useSnakeLayout';

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
  // ✅ 新增：接收从 App 传入的重置回调
  onResetFlow?: () => void;
  onLoopDetected?: (loops: LoopInfo[]) => void;
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
  onResetFlow, // ✅ 解构出重置回调
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

  // 使用蛇形布局hook生成计算属性的位置和连接线
  const { layoutNodes, layoutEdges } = useSnakeLayout(nodes);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [layoutStable, setLayoutStable] = useState(true);

  // Y轴拖动相关状态
  const [isDragEnabled, setIsDragEnabled] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [canvasOffsetY, setCanvasOffsetY] = useState(0);
  const dragStartScrollY = useRef(0);

  // 循环系统状态
  const [detectedLoops, setDetectedLoops] = useState<LoopInfo[]>([]);
  const [loopContexts, setLoopContexts] = useState<Map<string, LoopExecutionContext>>(new Map());

  // 拖动切换处理
  const toggleDragMode = useCallback(() => {
    setIsDragEnabled(prev => {
      if (prev) setCanvasOffsetY(0); // 关闭时重置偏移
      return !prev;
    });
  }, []);

  // 1. 优化：Canvas 尺寸监听（防抖）
  useEffect(() => {
    if (!canvasRef.current) return;

    let timeoutId: NodeJS.Timeout;
    const DEBOUNCE_DELAY = 50; // 增加防抖时间，减少高频触发

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

  // 2. 优化：布局自动重计算
  // 仅在画布宽度变化或节点数量变化时触发，避免位置微调时的抖动
  useEffect(() => {
    if (canvasSize.width > 0 && nodes.length > 0) {
      setLayoutStable(false);
      
      // 使用 requestAnimationFrame 确保 UI 不卡顿
      requestAnimationFrame(() => {
        const updatedNodes = layout_service.recalculateAllPositions(nodes, canvasSize.width);
        // 只有当位置真正改变时才更新 store，防止死循环
        // 这里假设 setNodes 内部有简单的引用比较或 diff
        setNodes(updatedNodes);
        setLayoutStable(true);
      });
    }
  }, [canvasSize.width, nodes.length, setNodes]); // 移除 canvasSize 整体依赖，只依赖 width

  // 拖放处理
  const handleCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData('nodeType') as NodeType;
    
    if (nodeType && canvasRef.current && selectedWorkstation) {
      const rect = canvasRef.current.getBoundingClientRect();
      const dropX = (e.clientX - rect.left) / zoomLevel;
      const dropY = (e.clientY - rect.top) / zoomLevel;

      const options: LayoutCalculationOptions = {
        canvas_width: canvasSize.width,
        nodes: nodes,
        enable_zigzag: true,
        center_single_node: true
      };
      
      const index = layout_service.calculateNodeIndexFromPosition(
        { x: dropX, y: dropY },
        options
      );

      addNode(nodeType, selectedWorkstation, index);
    }
  }, [canvasSize.width, nodes, zoomLevel, selectedWorkstation, addNode]);

  // 节点交互事件
  const handleNodeClick = useCallback((node: ElectrochemicalNode) => {
    selectNode(node);
  }, [selectNode]);

  const handleNodeDoubleClick = useCallback((node: ElectrochemicalNode) => {
    // 预留双击扩展槽位
  }, []);

  const handleNodeContextMenu = useCallback((node: ElectrochemicalNode, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    // 简化的删除确认，实际项目中建议使用自定义 Modal
    if (window.confirm(`确定要删除节点 "${node.name}" 吗？`)) {
        // 直接操作 store 更新，由于使用计算属性布局，不需要手动管理连接线
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

  const handleNodeDragEndEnhanced = useCallback((_node: ElectrochemicalNode, event: React.DragEvent) => {
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.opacity = '1';
    }

    // 🚫 禁用位置拖拽更新 - 位置现在由useSnakeLayout自动计算
    // 如果需要重新排序，应该实现拖拽重排序逻辑而不是位置更新
    console.log('拖拽结束，但位置由自动布局系统管理');
  }, []);

  // Y轴拖动逻辑
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isDragEnabled || e.button !== 0) return;

    const target = e.target as HTMLElement;
    // 排除特定区域，避免冲突
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

  // 3. 优化：结构指纹计算（Stable Hashing）
  // 用于循环检测的依赖，避免对象引用变化导致的误触发
  const structureHash = useMemo(() => {
    // 仅提取影响循环检测的关键字段
    const nodesIdType = nodes.map(n => `${n.id}:${n.type}`).join('|');
    const edgesId = layoutEdges.map(e => `${e.source}->${e.target}`).join('|');
    return `${nodesIdType}::${edgesId}`;
  }, [nodes, layoutEdges]);

  // 循环检测逻辑
  useEffect(() => {
    if (nodes.length === 0) {
      setDetectedLoops([]);
      setLoopContexts(new Map());
      return;
    }

    // 执行检测 - 将计算生成的edges转换为连接格式供LoopDetector使用
    const convertedConnections = layoutEdges.map(edge => ({
      id: edge.id,
      source_id: edge.source,
      target_id: edge.target
    }));
    const detectionResult = LoopDetector.detectLoops(nodes, convertedConnections);
    
    // 只有当循环结构发生实质变化时才更新状态
    setDetectedLoops(prev => {
        const isSame = JSON.stringify(prev) === JSON.stringify(detectionResult.loops);
        return isSame ? prev : detectionResult.loops;
    });
    
    if (onLoopDetected) onLoopDetected(detectionResult.loops);

    // 更新循环上下文
    LoopSystemController.initialize({
      loops: detectionResult.loops,
      nodes: nodes,
      connections: convertedConnections
    });

    setLoopContexts(prev => {
      const newContexts = new Map(prev);
      // 添加新循环
      detectionResult.loops.forEach(loop => {
        if (!newContexts.has(loop.id)) {
          newContexts.set(loop.id, LoopContextManager.initializeLoop(loop));
        }
      });
      // 清理旧循环
      const currentLoopIds = new Set(detectionResult.loops.map(l => l.id));
      for (const id of newContexts.keys()) {
        if (!currentLoopIds.has(id)) {
          LoopContextManager.cleanupLoop(id);
          newContexts.delete(id);
        }
      }
      return newContexts;
    });

  }, [structureHash]); // ✅ 依赖优化后的 hash，而不是整个 nodes 数组

  // 节点位置映射缓存（用于 LoopBoundary）
  const nodePositions = useMemo(() => {
    return layoutNodes.map(node => ({
        id: node.id,
        name: node.name,
        x: node.position.x,
        y: node.position.y,
        width: node.style.width || 140,
        height: node.style.height || 60
    }));
  }, [layoutNodes]);

  return (
    <div
      className="canvas-container glass"
      ref={canvasRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleCanvasDrop}
    >
      {/* 网格背景 */}
      <div className="canvas-grid"></div>

      {/* Toolbar - 核心操作栏 */}
      {onRunFlow && onStopFlow && (
        <Toolbar
          onRunFlow={onRunFlow}
          onStopFlow={onStopFlow}
          onResetFlow={onResetFlow} // ✅ 透传重置回调
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
        
        {/* ✅ 已移除：此处多余的重置按钮 */}
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
          edges={layoutEdges}
          nodes={layoutNodes}
          layoutStable={layoutStable}
        />

        {detectedLoops.map(loop => (
          <LoopBoundary
            key={loop.id}
            loop={loop}
            nodes={nodePositions}
            context={loopContexts.get(loop.id)}
            layoutStable={layoutStable}
            zoomLevel={zoomLevel}
            canvasOffsetY={canvasOffsetY}
          />
        ))}

        {layoutNodes.map((node, index) => (
          <NodeRenderer
            key={node.id}
            node={node}
            index={index}
            isSelected={selectedNode?.id === node.id}
            isConnecting={false}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            onNodeContextMenu={handleNodeContextMenu}
            onNodeDragStart={handleNodeDragStartEnhanced}
            onNodeDragEnd={handleNodeDragEndEnhanced}
          />
        ))}
      </div>

      {/* 模态框与浮层 */}
      {showWorkflowManager && (
        <WorkflowManagerUI onClose={onToggleWorkflowManager} />
      )}

      {showFilePathManager && (
        <div className="file-path-manager-overlay-container">
           {/* 内容由 Toolbar 控制显示 */}
        </div>
      )}

      <WorkflowIdDisplay />
    </div>
  );
};