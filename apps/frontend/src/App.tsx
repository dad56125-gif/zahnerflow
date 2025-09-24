import React, { useState, useRef, useEffect } from 'react';
import {
  ElectrochemicalNode,
  NodeType,
  WorkstationType,
  NodeCategory,
  LoopStartNode,
  LoopEndNode,
  getNodeGroupsByWorkstation,
  getNodeConfigByWorkstation,
  createDefaultNodeDataWithWorkstation,
  validateNodeConnection
} from './nodes/types';
import { Toolbar } from './components/Toolbar';
import { TopNavbar } from './components/TopNavbar';
import { Sidebar } from './components/Sidebar';
import { PropertyPanel } from './components/PropertyPanel';
import { StatusBar } from './components/StatusBar';
import { LoopBoundary } from './components/LoopBoundary';
import { setupAutoGlassEffect } from './utils/glassEffect';
import { stateLinkageManager } from './managers/state-linkage.manager';
import { loopContextManager } from './services/LoopContextManager';
import './styles/globals.css';
import './styles/glass-ui.css';

interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
}

interface Position {
  x: number;
  y: number;
}

const ZahnerFlowApp: React.FC = () => {
  const [selectedNode, setSelectedNode] = useState<ElectrochemicalNode | null>(null);
  const [activePanel, setActivePanel] = useState<'nodes'>('nodes');
  const [selectedWorkstation, setSelectedWorkstation] = useState<WorkstationType | null>(null);
  const [workstationNodeGroups, setWorkstationNodeGroups] = useState<Record<NodeCategory, string[]>>({} as Record<NodeCategory, string[]>);

  const handleWorkstationSelect = (workstation: any) => {
    const workstationType = workstation.id as WorkstationType;
    setSelectedWorkstation(workstationType);
    setWorkstationNodeGroups(getNodeGroupsByWorkstation(workstationType));
    
    // 切换工作站时清空当前画布
    setNodes([]);
    setConnections([]);
    setSelectedNode(null);
    
  };
  const [nodes, setNodes] = useState<ElectrochemicalNode[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStart, setConnectionStart] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [zoomLevel, setZoomLevel] = useState(1); // 缩放级别
  const [layoutStable, setLayoutStable] = useState(true); // 布局是否稳定
  const [cachedConnections, setCachedConnections] = useState<Array<{id: string, startX: number, startY: number, endX: number, endY: number, midX?: number, midY?: number, isLShape: boolean}>>([]); // 缓存的连接线数据
  const [isRunning, setIsRunning] = useState(false); // 流程是否正在运行
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false); // 通知面板是否打开
  const [loopPairs, setLoopPairs] = useState<Map<string, { startNode: LoopStartNode; endNode: LoopEndNode; nodesInLoop: ElectrochemicalNode[] }>>(new Map()); // 循环配对信息

  // 一维画布参数 - 自适应尺寸
  const NODE_SPACING = 200; // 节点间距
  const NODE_START_X = 50; // 起始X坐标
  const CANVAS_ROW_HEIGHT = 150; // 行间距

  // 监听画布容器大小变化 - 优化版，避免重复计算
  useEffect(() => {
    if (!canvasRef.current) return;

    let lastWidth = 0;
    let lastHeight = 0;
    let resizeTimeout: number;

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        
        // 避免微小变化导致的重复计算
        if (Math.abs(width - lastWidth) > 10 || Math.abs(height - lastHeight) > 10) {
          lastWidth = width;
          lastHeight = height;
          
          // 防抖处理，避免频繁触发
          clearTimeout(resizeTimeout);
          resizeTimeout = setTimeout(() => {
            setCanvasSize({ width, height });
          }, 100);
        }
      }
    });

    resizeObserver.observe(canvasRef.current);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(resizeTimeout);
    };
  }, []);

  // 初始化玻璃效果
  useEffect(() => {
    const observer = setupAutoGlassEffect();
    return () => {
      observer?.disconnect();
    };
  }, []);

  // 初始化状态联动管理器
  useEffect(() => {
    // 初始化WebSocket连接
    stateLinkageManager.initialize().catch(error => {
      console.error('初始化状态联动管理器失败:', error);
    });

    // 设置节点更新回调
    stateLinkageManager.setNodesUpdateCallback((updatedNodes) => {
      setNodes(updatedNodes);
    });

    // 设置执行状态更新回调
    stateLinkageManager.setExecutionUpdateCallback((executionState) => {
      setIsRunning(executionState.status === 'running');
      
      if (executionState.status === 'completed') {
      } else if (executionState.status === 'failed') {
        setIsNotificationPanelOpen(true);
      }
    });

    // 清理函数 - 只有在页面真正卸载时才清理WebSocket连接
    return () => {
      // 延迟清理，避免在开发模式热更新时断开连接
      setTimeout(() => {
        // 检查页面是否真的在卸载
        if (document.visibilityState === 'hidden') {
          stateLinkageManager.cleanup();
        }
      }, 100);
    };
  }, []);

  // 循环检测和管理
  useEffect(() => {
    detectAndManageLoops();
  }, [nodes]);

  // 循环检测和管理函数
  const detectAndManageLoops = () => {
    const loopStartNodes = nodes.filter(node => node.type === 'loop_start') as LoopStartNode[];
    const loopEndNodes = nodes.filter(node => node.type === 'loop_end') as LoopEndNode[];

    const newLoopPairs = new Map<string, { startNode: LoopStartNode; endNode: LoopEndNode; nodesInLoop: ElectrochemicalNode[] }>();

    // 清空旧的循环管理器状态
    loopContextManager.clear();

    // 为每个循环开始节点查找对应的结束节点
    loopStartNodes.forEach(startNode => {
      const loopId = startNode.data.parameters.loop_id;
      const endNode = loopEndNodes.find(node => node.data.parameters.loop_id === loopId);

      if (endNode) {
        // 找到开始和结束节点之间的所有节点
        const startIndex = nodes.findIndex(node => node.id === startNode.id);
        const endIndex = nodes.findIndex(node => node.id === endNode.id);

        if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
          const nodesInLoop = nodes.slice(startIndex + 1, endIndex);

          // 注册循环到管理器
          const level = Array.from(newLoopPairs.values()).length;
          loopContextManager.enterLoop(startNode, endNode, level);

          newLoopPairs.set(loopId, {
            startNode,
            endNode,
            nodesInLoop
          });
        }
      }
    });

    setLoopPairs(newLoopPairs);
  };

  // 监听页面卸载事件，确保WebSocket连接被正确清理
  useEffect(() => {
    const handleBeforeUnload = () => {
      stateLinkageManager.cleanup();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // 当画布尺寸变化时，重新计算节点位置（带防抖）
  useEffect(() => {
    if (canvasSize.width === 0 || canvasSize.height === 0) return;
    
    setLayoutStable(false); // 标记布局不稳定
    
    const timeoutId = setTimeout(() => {
      // 重新计算所有节点位置
      setNodes(prev => prev.map((node, index) => ({
        ...node,
        position: calculateNodePosition(index)
      })));
      
      // 延迟标记布局稳定，确保渲染完成
      setTimeout(() => {
        setLayoutStable(true);
      }, 50);
    }, 150);
    
    return () => clearTimeout(timeoutId);
  }, [canvasSize]);

  // 当布局稳定时，计算并缓存连接线数据
  useEffect(() => {
    if (!layoutStable || nodes.length === 0) return;
    
    const newConnections = nodes.map((node, index) => {
      const position = calculateNodePosition(index);
      const nextPosition = calculateNodePosition(index + 1);
      const nodesPerRow = Math.max(1, Math.floor((canvasSize.width - 100) / NODE_SPACING));
      
      if (index < nodes.length - 1) {
        const currentRow = Math.floor(index / nodesPerRow);
        const nextRow = Math.floor((index + 1) / nodesPerRow);
        
        if (currentRow === nextRow) {
          // 同一行内的连接线
          const isLeftToRight = currentRow % 2 === 0;
          const startX = isLeftToRight ? position.x + (node.style.width || 140) : position.x;
          const endX = isLeftToRight ? nextPosition.x : nextPosition.x + (node.style.width || 140);
          
          return {
            id: `line-${index}`,
            startX,
            startY: position.y + 30,
            endX,
            endY: nextPosition.y + 30,
            isLShape: false
          };
        } else {
          // 换行时的连接线（L形）
          const isLeftToRight = currentRow % 2 === 0;
          const startX = isLeftToRight ? position.x + (node.style.width || 140) : position.x;
          const endX = nextRow % 2 === 0 ? nextPosition.x : nextPosition.x + (node.style.width || 140);
          const midX = startX + (isLeftToRight ? 50 : -50);
          
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
      }
      return null;
    }).filter(Boolean) as Array<{id: string, startX: number, startY: number, endX: number, endY: number, midX?: number, midY?: number, isLShape: boolean}>;
    
    setCachedConnections(newConnections);
  }, [layoutStable, nodes, canvasSize]);

  // 计算节点位置 - S形多行布局
  const calculateNodePosition = (index: number): { x: number; y: number } => {
    const nodesPerRow = Math.max(1, Math.floor((canvasSize.width - 100) / NODE_SPACING));
    const row = Math.floor(index / nodesPerRow);
    const col = index % nodesPerRow;
    
    // S形布局：偶数行从左到右，奇数行从右到左
    const x = NODE_START_X + (row % 2 === 0 ? col : nodesPerRow - 1 - col) * NODE_SPACING;
    const y = 100 + row * CANVAS_ROW_HEIGHT; // 100px顶部留白
    
    return { x, y };
  };

  // 计算节点索引 - 根据位置（S形布局）
  const calculateNodeIndex = (position: { x: number; y: number }): number => {
    const row = Math.round((position.y - 100) / CANVAS_ROW_HEIGHT);
    const nodesPerRow = Math.max(1, Math.floor((canvasSize.width - 100) / NODE_SPACING));
    
    if (row < 0) return 0;
    
    const col = Math.round((position.x - NODE_START_X) / NODE_SPACING);
    
    // S形布局的索引计算
    let actualCol = col;
    if (row % 2 === 1) {
      actualCol = nodesPerRow - 1 - col;
    }
    
    const index = row * nodesPerRow + actualCol;
    return Math.max(0, Math.min(nodes.length - 1, index));
  };

  // 创建节点 - 多行布局，带工作站支持
  const createNode = (type: string, index?: number) => {
    try {
      if (!selectedWorkstation) {
        return null;
      }

      const config = getNodeConfigByWorkstation(type, selectedWorkstation);
      if (!config) return null;

      let targetIndex: number;
      if (index !== undefined && index >= 0 && index <= nodes.length) {
        targetIndex = index;
      } else {
        targetIndex = nodes.length;
      }

      const position = calculateNodePosition(targetIndex);

      const newNode: ElectrochemicalNode = {
        id: `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: type as NodeType,
        name: config.name,
        category: config.category,
        position: position,
        data: createDefaultNodeDataWithWorkstation(type, selectedWorkstation),
        status: 'ready',
        input: config.input,
        output: config.output,
        style: config.style
      };

      setNodes(prev => {
        const newNodes = targetIndex >= 0 && targetIndex <= prev.length
          ? [...prev.slice(0, targetIndex), newNode, ...prev.slice(targetIndex)]
          : [...prev, newNode];
        
        // 重新排列所有节点位置（多行布局）
        return newNodes.map((node, i) => ({
          ...node,
          position: calculateNodePosition(i)
        }));
      });

      return newNode.id;
    } catch (error) {
      console.error('创建节点失败:', error);
      return null;
    }
  };

  // 删除节点
  const deleteNode = (nodeId: string) => {
    try {
      // 删除相关连接
      setConnections(prev => prev.filter(
        conn => conn.sourceId !== nodeId && conn.targetId !== nodeId
      ));

      // 更新节点列表
      setNodes(prev => {
        const newNodes = prev.filter(node => node.id !== nodeId);
        
        // 重新排列剩余节点位置（多行布局）
        return newNodes.map((node, i) => ({
          ...node,
          position: calculateNodePosition(i)
        }));
      });

      if (selectedNode?.id === nodeId) {
        setSelectedNode(null);
      }

    } catch (error) {
      console.error('删除节点失败:', error);
    }
  };

  // 移动节点 - 多行布局，支持拖拽到不同行
  const moveNode = (nodeId: string, newPosition: Position) => {
    try {
      setNodes(prev => {
        const nodeIndex = prev.findIndex(node => node.id === nodeId);
        if (nodeIndex === -1) return prev;

        // 计算目标位置索引
        const targetIndex = calculateNodeIndex(newPosition);

        // 如果位置没有变化，直接返回
        if (targetIndex === nodeIndex) return prev;

        // 重新排序节点
        const newNodes = [...prev];
        const [movedNode] = newNodes.splice(nodeIndex, 1);
        newNodes.splice(targetIndex, 0, movedNode);

        // 重新计算所有节点位置（多行布局）
        return newNodes.map((node, i) => ({
          ...node,
          position: calculateNodePosition(i)
        }));
      });

    } catch (error) {
      console.error('移动节点失败:', error);
    }
  };

  // 开始连接
  const startConnection = (nodeId: string) => {
    setIsConnecting(true);
    setConnectionStart(nodeId);
  };

  // 完成连接
  const completeConnection = (targetNodeId: string) => {
    if (!connectionStart || connectionStart === targetNodeId) {
      setIsConnecting(false);
      setConnectionStart(null);
      return;
    }

    // 检查是否已存在连接
    const existingConnection = connections.find(
      conn => conn.sourceId === connectionStart && conn.targetId === targetNodeId
    );

    if (!existingConnection) {
      // 验证连接类型
      const sourceNode = nodes.find(n => n.id === connectionStart);
      const targetNode = nodes.find(n => n.id === targetNodeId);
      
      if (sourceNode && targetNode && validateNodeConnection(sourceNode.type, targetNode.type)) {
        try {
          const newConnection: Connection = {
            id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            sourceId: connectionStart,
            targetId: targetNodeId
          };

          setConnections(prev => [...prev, newConnection]);
        } catch (error) {
          console.error('创建连接失败:', error);
        }
      } else {
      }
    }

    setIsConnecting(false);
    setConnectionStart(null);
  };

  // 删除连接函数暂时保留但未使用

  // 导出流程数据 - 带工作站标识
  const exportFlow = () => {
    try {
      return {
        nodes,
        connections,
        metadata: {
          version: '2.0.0',
          layout: '1d', // 一维布局
          workstation: selectedWorkstation,
          workstationName: selectedWorkstation === 'zahner-zennium' ? 'Zahner Zennium' : 'PP242',
          createdAt: new Date(),
          exportedAt: new Date()
        }
      };
    } catch (error) {
      console.error('导出流程失败:', error);
      return null;
    }
  };

  // 导入流程数据 - 带工作站验证
  const importFlow = (data: any) => {
    try {
      setNodes([]);
      setConnections([]);
      setSelectedNode(null);

      // 验证工作站匹配
      if (data.metadata && data.metadata.workstation) {
        if (data.metadata.workstation !== selectedWorkstation) {
          return;
        }
      }

      if (data.nodes) {
        setNodes(data.nodes);
      }
      if (data.connections) {
        setConnections(data.connections);
      }

    } catch (error) {
      console.error('导入流程失败:', error);
    }
  };

  // 画布点击事件
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      setSelectedNode(null);
      setIsConnecting(false);
      setConnectionStart(null);
    }
  };

  // 检查工作站连接状态
  const checkWorkstationConnection = (workstationId: string): boolean => {
    // 这里应该有实际的工作站连接检查逻辑
    // 目前先检查是否选择了工作站
    if (!workstationId) return false;
    
    // 模拟工作站连接状态检查
    // 在实际应用中，这里应该调用实际的硬件检查API
    
    // 目前默认返回 true，实际应该根据工作站真实状态
    // TODO: 实现真实的工作站连接检查
    return true; // 暂时返回 true 以允许工作流执行进行测试
  };

  // 运行流程
  const runFlow = async () => {
    if (nodes.length === 0) {
      return;
    }

    if (isRunning) {
      return;
    }

    // 检查工作站连接状态
    if (!selectedWorkstation) {
      console.error('没有选择工作站');
      setIsNotificationPanelOpen(true);
      return;
    }

    // 检查工作站是否连接
    const isWorkstationConnected = checkWorkstationConnection(selectedWorkstation);
    if (!isWorkstationConnected) {
      console.error('工作站未连接');
      setIsNotificationPanelOpen(true);
      return;
    }


    try {
      // 首先创建工作流定义
      const workflowId = `workflow_${Date.now()}`;
      
      // 构建工作流定义
      const workflowDefinition = {
        id: workflowId,
        name: `电化学流程_${new Date().toLocaleString()}`,
        description: '通过前端界面创建的电化学测量流程',
        nodes: nodes.map(node => ({
          id: node.id,
          type: node.type,
          name: node.name,
          config: node.data?.parameters || {},
          position: node.position
        })),
        edges: [], // 暂时为空，因为是一维流程
        version: 1
      };

      // 先创建工作流
      const createResponse = await fetch('http://localhost:3001/api/workflows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(workflowDefinition),
      });

      if (!createResponse.ok) {
        throw new Error(`创建工作流失败: ${createResponse.status}`);
      }

      const createdWorkflow = await createResponse.json();

      // 然后执行工作流
      await stateLinkageManager.startExecution(createdWorkflow.id, nodes);
      
    } catch (error) {
      
      // 错误时自动弹出通知面板
      setIsNotificationPanelOpen(true);
    }
  };

  // 停止流程
  const stopFlow = async () => {
    if (!isRunning) {
      return;
    }


    try {
      const executionState = stateLinkageManager.getExecutionState();
      if (executionState) {
        await stateLinkageManager.cancelExecution(executionState.executionId);
      }
      // 主动重置运行状态，确保停止后可以重新开始
      setIsRunning(false);
    } catch (error) {
      // 即使取消执行失败，也重置运行状态
      setIsRunning(false);
    }
  };


  // 画布缩放
  const handleCanvasZoom = (delta: number) => {
    const newZoom = Math.max(0.5, Math.min(2, zoomLevel + delta));
    setZoomLevel(newZoom);
  };

  // 画布拖放事件
  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData('nodeType') as NodeType;
    
    if (nodeType && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const dropX = (e.clientX - rect.left) / zoomLevel;
      const dropY = (e.clientY - rect.top) / zoomLevel;
      
      // 计算插入位置（多行布局）
      const insertIndex = calculateNodeIndex({ x: dropX, y: dropY });
      
      createNode(nodeType, insertIndex);
    }
  };

  return (
    <div className="app-container">
      {/* 顶部导航栏 */}
      <TopNavbar onWorkstationSelect={handleWorkstationSelect} />
      
      {/* 主要内容区域 */}
      <div className="main-content">
        {/* 左侧边栏 */}
        <Sidebar
          activePanel={activePanel}
          onPanelChange={setActivePanel}
          onNodeCreate={(type) => {
            createNode(type);
          }}
          nodeGroups={workstationNodeGroups}
          selectedNode={selectedNode}
          selectedWorkstation={selectedWorkstation}
        />

        {/* 中央画布区域 - 一维布局 */}
        <div 
          className="canvas-container canvas-grid glass" 
          ref={canvasRef}
          onClick={handleCanvasClick}
          onDrop={handleCanvasDrop}
          onDragOver={(e) => e.preventDefault()}
          onWheel={(e) => {
            if (e.ctrlKey) {
              e.preventDefault();
              handleCanvasZoom(e.deltaY > 0 ? -0.1 : 0.1);
            }
          }}
          style={{
            margin: 'var(--space)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          {/* 悬浮工具栏 */}
          <Toolbar
            onNewFlow={() => {
              setNodes([]);
              setConnections([]);
              setSelectedNode(null);
            }}
            onOpenFlow={importFlow}
            onSaveFlow={exportFlow}
            onRunFlow={runFlow}
            onStopFlow={stopFlow}
            onUndo={() => {}}
            onRedo={() => {}}
            onZoomIn={() => handleCanvasZoom(0.1)}
            onZoomOut={() => handleCanvasZoom(-0.1)}
            onResetZoom={() => {
              setZoomLevel(1);
            }}
            canUndo={false}
            canRedo={false}
            selectedWorkstation={selectedWorkstation}
          />
          {/* 可缩放和拖拽的画布内容 */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transform: `scale(${zoomLevel})`,
            transformOrigin: '0 0',
            width: '100%',
            height: '100%',
            pointerEvents: 'none'
          }}>
            {/* 一维流程线 */}
            <svg style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 0
            }}>
            {/* S形多行流程线 - 使用缓存的数据，布局稳定时才显示 */}
            {layoutStable && cachedConnections.length > 0 && cachedConnections.map(conn => {
              if (!conn.isLShape) {
                // 直线连接
                return (
                  <line
                    key={conn.id}
                    x1={conn.startX}
                    y1={conn.startY}
                    x2={conn.endX}
                    y2={conn.endY}
                    className="connection-line"
                  />
                );
              } else {
                // L形连接 - 三条线段
                return (
                  <g key={conn.id}>
                    <line
                      x1={conn.startX}
                      y1={conn.startY}
                      x2={conn.midX}
                      y2={conn.startY}
                      className="connection-line"
                    />
                    <line
                      x1={conn.midX}
                      y1={conn.startY}
                      x2={conn.midX}
                      y2={conn.endY}
                      className="connection-line"
                    />
                    <line
                      x1={conn.midX}
                      y1={conn.endY}
                      x2={conn.endX}
                      y2={conn.endY}
                      className="connection-line"
                    />
                  </g>
                );
              }
            })}
            
            {/* 渲染连接线 */}
            {connections.map(connection => {
              const sourceNode = nodes.find(n => n.id === connection.sourceId);
              const targetNode = nodes.find(n => n.id === connection.targetId);
              
              if (!sourceNode || !targetNode) return null;

              const sourceX = sourceNode.position.x + (sourceNode.style.width || 140);
              const sourceY = sourceNode.position.y + 30;
              const targetX = targetNode.position.x;
              const targetY = targetNode.position.y + 30;

              return (
                <g key={connection.id}>
                  <line
                    x1={sourceX}
                    y1={sourceY}
                    x2={targetX}
                    y2={targetY}
                    className="connection-line"
                    markerEnd="url(#arrowhead)"
                  />
                  <circle
                    cx={sourceX}
                    cy={sourceY}
                    r="4"
                    fill="#2196F3"
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
                />
              </marker>
            </defs>
          </svg>

          {/* 渲染节点 */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'auto'
          }}>
          {nodes.map((node, _index) => (
            <div
              key={node.id}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedNode(node);
                if (isConnecting && connectionStart) {
                  completeConnection(node.id);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (confirm('确定要删除这个节点吗？')) {
                  deleteNode(node.id);
                }
              }}
              className={`node glass ${selectedNode?.id === node.id ? 'selected' : ''} status-${node.status}`}
              style={{
                position: 'absolute',
                left: node.position.x,
                top: node.position.y,
                width: node.style.width || 140,
                height: node.style.height || 60,
              }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('nodeId', node.id);
              }}
              onDragEnd={(e) => {
                if (canvasRef.current) {
                  const rect = canvasRef.current.getBoundingClientRect();
                  const newX = e.clientX - rect.left - (node.style.width || 140) / 2;
                  const newY = e.clientY - rect.top - (node.style.height || 60) / 2;
                  moveNode(node.id, { x: newX, y: newY });
                }
              }}
            >
              {/* 状态指示器 */}
              <div className="node-status-indicator" />
              
              <div className="node-icon-large">
                {node.style.icon || '🔧'}
              </div>
              <div className="node-title">
                {node.name}
              </div>
              
              {/* 输入端口 */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isConnecting) {
                    startConnection(node.id);
                  } else {
                    completeConnection(node.id);
                  }
                }}
                className="node-port input"
                title={`${node.input.name} (${node.input.dataType})`}
              />
              
              {/* 输出端口 */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isConnecting) {
                    startConnection(node.id);
                  } else {
                    completeConnection(node.id);
                  }
                }}
                className="node-port output"
                title={`${node.output.name} (${node.output.dataType})`}
              />
            </div>
          ))}
          </div>

          {/* 连接模式提示 */}
          {isConnecting && (
            <div className="connection-hint">
              🔗 连接模式 - 点击目标节点完成连接
            </div>
          )}

          {/* 循环边界可视化 */}
          {Array.from(loopPairs.values()).map(({ startNode, endNode, nodesInLoop }) => (
            <LoopBoundary
              key={startNode.data.parameters.loop_id}
              startNode={startNode}
              endNode={endNode}
              nodesInLoop={nodesInLoop}
            />
          ))}

            </div>
        </div>

        {/* 右侧面板 */}
        <div className="right-panels glass">
          {selectedNode && (
            <PropertyPanel
              node={selectedNode}
              onUpdate={(updatedNode) => {
                setNodes(prev => prev.map(node => 
                  node.id === updatedNode.id ? updatedNode : node
                ));
                setSelectedNode(updatedNode);
              }}
              selectedWorkstation={selectedWorkstation}
            />
          )}
        </div>
      </div>

      {/* 底部状态栏 */}
      <StatusBar
        nodeCount={nodes.length}
        connectionCount={connections.length}
        zoomLevel={zoomLevel}
        isRunning={isRunning}
        selectedNode={selectedNode}
        isNotificationPanelOpen={isNotificationPanelOpen}
        setIsNotificationPanelOpen={setIsNotificationPanelOpen}
      />
    </div>
  );
};

export default ZahnerFlowApp;