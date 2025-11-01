import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ElectrochemicalNode, WorkstationType, NodeType } from '../nodes/types';
import { useCanvasStore } from '../stores/canvasStore';
import { NodeListRenderer } from './NodeRenderer';
import { ConnectionLines } from './ConnectionLines';
import {
  LoopDetector,
  LoopContextManager,
  LoopVisualizer,
  LoopStatusIndicator,
  LoopInfo,
  LoopExecutionContext
} from './loops';
import { WorkflowManagerUI } from './workflow';
import {
  layout_service,
  Position,
  LayoutCalculationOptions
} from '../services/layout';


interface CanvasProps {
  zoomLevel: number;
  selectedWorkstation: WorkstationType | null;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  showWorkflowManager?: boolean;
  onToggleWorkflowManager?: () => void;
  showFilePathManager?: boolean;
  onLoopDetected?: (loops: LoopInfo[]) => void;
}

export const Canvas: React.FC<CanvasProps> = ({
  zoomLevel,
  selectedWorkstation,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  showWorkflowManager = false,
  onToggleWorkflowManager,
  showFilePathManager = false,
  onLoopDetected
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
  } = useCanvasStore();

    const canvasRef = useRef<HTMLDivElement>(null);
  const [layoutStable, setLayoutStable] = useState(true);

  // Y轴拖动相关状态
  const [isDragEnabled, setIsDragEnabled] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [canvasOffsetY, setCanvasOffsetY] = useState(0);
  const dragStartScrollY = useRef(0);

  
  
  
  // 新增：循环系统状态
  const [detectedLoops, setDetectedLoops] = useState<LoopInfo[]>([]);
  const [loopContexts, setLoopContexts] = useState<Map<string, LoopExecutionContext>>(new Map());
  const [loopDetectionEnabled, setLoopDetectionEnabled] = useState(true);
  const [loopVisualizationEnabled, setLoopVisualizationEnabled] = useState(true);

  
  // 拖动切换处理
  const toggleDragMode = () => {
    setIsDragEnabled(!isDragEnabled);
    // 如果取消拖动模式，重置偏移量
    if (isDragEnabled) {
      setCanvasOffsetY(0);
    }
  };

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

  // 使用统一布局服务更新节点位置
  useEffect(() => {
    if (canvasSize.width > 0 && nodes.length > 0) {
      setLayoutStable(false);

      // 使用统一布局服务重新计算所有节点位置
      const updatedNodes = layout_service.recalculateAllPositions(nodes, canvasSize.width);
      setNodes(updatedNodes);
      setLayoutStable(true);
    }
  }, [canvasSize, nodes.length, setNodes]);

  
  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData('nodeType') as NodeType;
    if (nodeType && canvasRef.current && selectedWorkstation) {
      const rect = canvasRef.current.getBoundingClientRect();
      const dropX = (e.clientX - rect.left) / zoomLevel;
      const dropY = (e.clientY - rect.top) / zoomLevel;

      // 使用统一布局服务计算节点索引
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
  };

  
  // 新增：节点事件处理函数（用于新的渲染器）
  const handleNodeClick = (node: ElectrochemicalNode) => {
    selectNode(node);
  };

  const handleNodeDoubleClick = (node: ElectrochemicalNode) => {
    console.log('双击节点:', node.name);
    // 可以在这里添加双击节点的高级功能，如打开详细配置
  };

  const handleNodeContextMenu = (node: ElectrochemicalNode, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (confirm(`确定要删除节点 "${node.name}" 吗？`)) {
      // 使用CanvasStore的deleteNode方法（如果存在）
      const currentState = useCanvasStore.getState();
      if (currentState.deleteNode) {
        currentState.deleteNode(node.id);
      } else {
        // 如果没有deleteNode方法，手动实现
        setNodes(nodes.filter(n => n.id !== node.id));
        setConnections(connections.filter(
          conn => conn.sourceId !== node.id && conn.targetId !== node.id
        ));
      }
    }
  };

  const handleNodeDragStartEnhanced = (node: ElectrochemicalNode, event: React.DragEvent) => {
    console.log(`节点拖拽开始：${node.name}`);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('nodeId', node.id);
    (event.currentTarget as HTMLElement).style.opacity = '0.5';
  };

  const handleNodeDragEndEnhanced = (node: ElectrochemicalNode, event: React.DragEvent) => {
    console.log('节点拖拽结束');
    (event.currentTarget as HTMLElement).style.opacity = '1';

    // 获取拖拽结束位置
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const newX = (event.clientX - rect.left) / zoomLevel;
      const newY = (event.clientY - rect.top) / zoomLevel;

      // 调用moveNode函数来处理节点位置交换
      moveNode(node.id, { x: newX, y: newY });
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

  // 循环检测和管理逻辑
  useEffect(() => {
    if (!loopDetectionEnabled) return;

    // 检测循环
    const detectionResult = LoopDetector.detectLoops(nodes, connections);

    // 调试日志
    console.log('[Canvas Debug] 检测到的循环数量:', detectionResult.loops.length);
    console.log('[Canvas Debug] 检测到的循环:', detectionResult.loops);
    console.log('[Canvas Debug] 节点数量:', nodes.length);
    console.log('[Canvas Debug] 连接数量:', connections.length);

    setDetectedLoops(detectionResult.loops);

    // 更新循环上下文
    const newContexts = new Map<string, LoopExecutionContext>();
    detectionResult.loops.forEach(loop => {
      const existingContext = loopContexts.get(loop.id);
      if (existingContext) {
        newContexts.set(loop.id, existingContext);
      } else {
        const context = LoopContextManager.initializeLoop(loop);
        newContexts.set(loop.id, context);
      }
    });

    // 清理已删除的循环上下文
    loopContexts.forEach((context, loopId) => {
      if (!detectionResult.loops.some(loop => loop.id === loopId)) {
        LoopContextManager.cleanupLoop(loopId);
      } else {
        newContexts.set(loopId, context);
      }
    });

    setLoopContexts(newContexts);
  }, [nodes, connections, loopDetectionEnabled]);

  // 循环控制事件处理函数
  const handleLoopStart = async (loopId: string) => {
    const loop = detectedLoops.find(l => l.id === loopId);
    if (!loop) return;

    try {
      const context = LoopContextManager.getLoopContext(loopId);
      if (context) {
        await LoopContextManager.startLoop(loopId, nodes, async (nodeId, iteration) => {
          // 模拟节点执行
          console.log(`执行节点 ${nodeId}，迭代 ${iteration}`);
          await new Promise(resolve => setTimeout(resolve, 100));
        });
      }
    } catch (error) {
      console.error('循环执行错误:', error);
    }
  };

  const handleLoopPause = (loopId: string) => {
    LoopContextManager.pauseLoop(loopId);
  };

  const handleLoopResume = (loopId: string) => {
    LoopContextManager.resumeLoop(loopId);
  };

  const handleLoopCancel = (loopId: string) => {
    LoopContextManager.cancelLoop(loopId);
  };

  const handleLoopReset = (loopId: string) => {
    LoopContextManager.resetLoop(loopId);
  };

  // 更新循环上下文状态
  useEffect(() => {
    const updateInterval = setInterval(() => {
      const updatedContexts = new Map<string, LoopExecutionContext>();

      loopContexts.forEach((context, loopId) => {
        const currentContext = LoopContextManager.getLoopContext(loopId);
        if (currentContext) {
          updatedContexts.set(loopId, currentContext);
        }
      });

      setLoopContexts(updatedContexts);
    }, 500); // 每500ms更新一次

    return () => clearInterval(updateInterval);
  }, [loopContexts]);

  // 获取节点位置信息（用于循环可视化）
  const getNodePosition = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return null;

    return {
      id: node.id,
      name: node.name,
      x: node.position.x,
      y: node.position.y,
      width: node.style.width || 140,
      height: node.style.height || 60
    };
  };

  const nodePositions = nodes.map(node => getNodePosition(node.id)).filter(Boolean) as Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;

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

        
        
  
        {/* 循环检测切换按钮 - 新增 */}
        <button
          className={`btn-zoom btn-loop-detection ${loopDetectionEnabled ? 'active' : ''}`}
          onClick={() => setLoopDetectionEnabled(!loopDetectionEnabled)}
          title={loopDetectionEnabled ? "关闭循环检测" : "开启循环检测"}
        >
          {loopDetectionEnabled ? '🔄' : '⏸️'}
        </button>

        {/* 循环可视化切换按钮 - 新增 */}
        <button
          className={`btn-zoom btn-loop-visualization ${loopVisualizationEnabled ? 'active' : ''}`}
          onClick={() => setLoopVisualizationEnabled(!loopVisualizationEnabled)}
          title={loopVisualizationEnabled ? "关闭循环可视化" : "开启循环可视化"}
        >
          {loopVisualizationEnabled ? '👁️' : '🙈'}
        </button>

        {/* 循环状态指示器 - 新增 */}
        {detectedLoops.length > 0 && (
          <div className="loop-status-wrapper">
            <LoopStatusIndicator
              loops={detectedLoops}
              contexts={loopContexts}
              className="loop-status-indicator-inline"
            />
          </div>
        )}

        
        
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
        {/* 渲染工作流执行顺序连接线 */}
        <ConnectionLines
          nodes={nodes}
          canvasWidth={canvasSize.width}
          layoutStable={layoutStable}
        />

        
        {/* 循环可视化组件 - 新增 */}
        {loopVisualizationEnabled && detectedLoops.map(loop => {
          const context = loopContexts.get(loop.id);
          return (
            <LoopVisualizer
              key={loop.id}
              loop={loop}
              nodes={nodePositions}
              context={context}
              onLoopStart={handleLoopStart}
              onLoopPause={handleLoopPause}
              onLoopResume={handleLoopResume}
              onLoopCancel={handleLoopCancel}
              onLoopReset={handleLoopReset}
            />
          );
        })}

        {/* 渲染画布上的节点 - 使用统一的增强渲染系统 */}
        <NodeListRenderer
          nodes={nodes}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onNodeContextMenu={handleNodeContextMenu}
          onNodeDragStart={handleNodeDragStartEnhanced}
          onNodeDragEnd={handleNodeDragEndEnhanced}
        />
      </div>

      {/* 工作流管理面板 - 新增 */}
      {showWorkflowManager && (
        <div className="workflow-manager-overlay">
          <div className="workflow-manager-panel">
            <WorkflowManagerUI />
          </div>
        </div>
      )}

      {/* 文件路径管理器覆盖层 - 新增 */}
      {showFilePathManager && (
        <div className="file-path-manager-overlay-container">
          {/* FilePathManagerUI will be rendered by Toolbar */}
        </div>
      )}
    </div>
  );
};