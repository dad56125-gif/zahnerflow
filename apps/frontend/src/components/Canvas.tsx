import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ElectrochemicalNode, WorkstationType, NodeType } from '../nodes/types';
import { useCanvasStore } from '../stores/canvasStore';
import { NodeRenderer, NodeListRenderer } from './node-renderer';
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
  } = useCanvasStore();

    const canvasRef = useRef<HTMLDivElement>(null);
  const [layoutStable, setLayoutStable] = useState(true);

  // Y轴拖动相关状态
  const [isDragEnabled, setIsDragEnabled] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [canvasOffsetY, setCanvasOffsetY] = useState(0);
  const dragStartScrollY = useRef(0);

  // 节点拖拽交换相关状态
  const [draggedNode, setDraggedNode] = useState<ElectrochemicalNode | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isNodeDragging, setIsNodeDragging] = useState(false);

  // 新增：节点渲染模式状态
  const [nodeRenderMode, setNodeRenderMode] = useState<'default' | 'enhanced'>('default');

  
  // 新增：循环系统状态
  const [detectedLoops, setDetectedLoops] = useState<LoopInfo[]>([]);
  const [loopContexts, setLoopContexts] = useState<Map<string, LoopExecutionContext>>(new Map());
  const [loopDetectionEnabled, setLoopDetectionEnabled] = useState(true);
  const [loopVisualizationEnabled, setLoopVisualizationEnabled] = useState(true);

  // 新增：工作流管理状态
  const [showWorkflowManager, setShowWorkflowManager] = useState(false);

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
  }, [canvasSize, nodes.length, calculateNodePosition, setNodes]); // 恢复nodes.length依赖避免无限循环

  
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

  // 节点拖拽交换处理函数
  const handleNodeDragStart = (e: React.DragEvent, node: ElectrochemicalNode, index: number) => {
    console.log(`开始拖拽节点：${node.name}，当前索引：${index}`);
    setDraggedNode(node);
    setIsNodeDragging(true);

    // 设置拖拽图像（可选）
    e.dataTransfer.effectAllowed = 'move';

    // 立即设置透明度，避免异步执行时DOM元素为null
    (e.currentTarget as HTMLElement).style.opacity = '0.5';
  };

  const handleNodeDragEnd = (e: React.DragEvent) => {
    console.log('拖拽结束');
    setIsNodeDragging(false);
    setDraggedNode(null);
    setDragOverIndex(null);
    (e.currentTarget as HTMLElement).style.opacity = '1';
  };

  const handleNodeDragOver = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (draggedNode && dragOverIndex !== targetIndex) {
      setDragOverIndex(targetIndex);
    }
  };

  const handleNodeDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleNodeDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedNode) return;

    const draggedIndex = nodes.findIndex(n => n.id === draggedNode.id);
    if (draggedIndex === targetIndex || draggedIndex === -1) {
      console.log('拖拽操作无效：源索引和目标索引相同或未找到节点');
      setDraggedNode(null);
      setDragOverIndex(null);
      return;
    }

    console.log(`拖拽交换：节点 "${draggedNode.name}" 从位置 ${draggedIndex} 移动到位置 ${targetIndex}`);

    // 创建新的节点数组，交换位置
    const newNodes = [...nodes];
    const [removedNode] = newNodes.splice(draggedIndex, 1);
    newNodes.splice(targetIndex, 0, removedNode);

    console.log('交换后的节点顺序：', newNodes.map(n => n.name));

    // 更新节点状态，触发重新计算位置
    setNodes(newNodes);

    // 清理状态
    setDraggedNode(null);
    setDragOverIndex(null);
    (e.currentTarget as HTMLElement).style.opacity = '1';
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
        setNodes(prev => prev.filter(n => n.id !== node.id));
        setConnections(prev => prev.filter(
          conn => conn.sourceId !== node.id && conn.targetId !== node.id
        ));
      }
    }
  };

  const handleNodeDragStartEnhanced = (node: ElectrochemicalNode, event: React.DragEvent) => {
    console.log(`增强拖拽开始：${node.name}`);
    setDraggedNode(node);
    setIsNodeDragging(true);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('nodeId', node.id);
    (event.currentTarget as HTMLElement).style.opacity = '0.5';
  };

  const handleNodeDragEndEnhanced = (node: ElectrochemicalNode, event: React.DragEvent) => {
    console.log('增强拖拽结束');
    setIsNodeDragging(false);
    setDraggedNode(null);
    setDragOverIndex(null);
    (event.currentTarget as HTMLElement).style.opacity = '1';
  };

  
  
  const handleClearAllConnections = () => {
    if (connections.length > 0 && confirm('确定要清除所有连接吗？')) {
      setConnections([]);
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

        {/* 节点渲染模式切换按钮 - 新增 */}
        <button
          className={`btn-zoom btn-render-mode ${nodeRenderMode === 'enhanced' ? 'active' : ''}`}
          onClick={() => setNodeRenderMode(nodeRenderMode === 'default' ? 'enhanced' : 'default')}
          title={nodeRenderMode === 'default' ? "切换到增强渲染模式" : "切换到默认渲染模式"}
        >
          {nodeRenderMode === 'default' ? '🔧' : '⚡'}
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

        {/* 工作流管理按钮 - 新增 */}
        <button
          className={`btn-zoom btn-workflow-manager ${showWorkflowManager ? 'active' : ''}`}
          onClick={() => setShowWorkflowManager(!showWorkflowManager)}
          title={showWorkflowManager ? "关闭工作流管理" : "打开工作流管理"}
        >
          {showWorkflowManager ? '📋' : '📄'}
        </button>

        {/* 清除所有连接按钮 - 新增 */}
        {connections.length > 0 && (
          <button
            className="btn-zoom btn-clear-connections"
            onClick={handleClearAllConnections}
            title={`清除所有连接 (${connections.length}个)`}
          >
            🗑️
          </button>
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
        {/* 渲染连接线 - 使用ConnectionLines */}
        <ConnectionLines
          nodes={nodes}
          connections={connections}
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

        {/* 渲染画布上的节点 - 随内容缩放 */}
        {nodeRenderMode === 'enhanced' ? (
          /* 增强渲染模式 - 使用新的节点渲染系统 */
          <NodeListRenderer
            nodes={nodes}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            onNodeContextMenu={handleNodeContextMenu}
            onNodeDragStart={handleNodeDragStartEnhanced}
            onNodeDragEnd={handleNodeDragEndEnhanced}
          />
        ) : (
          /* 默认渲染模式 - 保留原有功能，确保向后兼容 */
          nodes.map((node, index) => (
            <div
              key={node.id}
              className={`node glass status-${node.status} ${
                isNodeDragging && draggedNode?.id === node.id ? 'dragging' : ''
              } ${
                dragOverIndex === index ? 'drag-over' : ''
              }`}
              style={{
                left: node.position.x,
                top: node.position.y,
                width: node.style.width || 140,
                height: node.style.height || 60,
                cursor: 'grab',
              }}
              draggable
              onDragStart={(e) => handleNodeDragStart(e, node, index)}
              onDragEnd={handleNodeDragEnd}
              onDragOver={(e) => handleNodeDragOver(e, index)}
              onDragLeave={handleNodeDragLeave}
              onDrop={(e) => handleNodeDrop(e, index)}
              onClick={() => selectNode(node)}
            >
              <div className="node-title">{node.name}</div>
            </div>
          ))
        )}
      </div>

      {/* 工作流管理面板 - 新增 */}
      {showWorkflowManager && (
        <div className="workflow-manager-overlay">
          <div className="workflow-manager-panel">
            <WorkflowManagerUI />
          </div>
        </div>
      )}
    </div>
  );
};