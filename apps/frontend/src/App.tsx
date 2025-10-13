import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ElectrochemicalNode, WorkstationType, LoopStartNode, LoopEndNode, getNodeGroupsByWorkstation, validateNodeConnection, NodeType } from './nodes/types';
import { Toolbar } from './components/Toolbar';
import { TopNavbar } from './components/TopNavbar';
import { Sidebar } from './components/Sidebar';
import { PropertyPanel } from './components/PropertyPanel';
import { StatusBar } from './components/StatusBar';
import { LoopBoundary } from './components/LoopBoundary';
import { setupAutoGlassEffect } from './utils/glassEffect';
import { stateLinkageManager } from './managers/state-linkage.manager';
import { useCanvasStore } from './stores/canvasStore';


// Re-defined here for local use, though they originate from the store
interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
}

const ZahnerFlowApp: React.FC = () => {
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

  const [activePanel, setActivePanel] = useState<'nodes'>('nodes');
  const [selectedWorkstation, setSelectedWorkstation] = useState<WorkstationType | null>(null);
  const [workstationNodeGroups, setWorkstationNodeGroups] = useState<any>({} as any);

  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStart, setConnectionStart] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [layoutStable, setLayoutStable] = useState(true);
  const [cachedConnections, setCachedConnections] = useState<Array<{id: string, startX: number, startY: number, endX: number, endY: number, midX?: number, midY?: number, isLShape: boolean}>>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const [loopPairs, _setLoopPairs] = useState<Map<string, { startNode: LoopStartNode; endNode: LoopEndNode; nodesInLoop: ElectrochemicalNode[] }>>(new Map()); //寰幆閰嶅淇℃伅
  const [fixedDevice, setFixedDevice] = useState<'furnace' | 'mfc' | null>(null);


  const NODE_SPACING = 200;
  const CANVAS_ROW_HEIGHT = 150;
  const NODE_START_X = 50;

  const handleWorkstationSelect = (workstation: any) => {
    const workstationType = workstation.id as WorkstationType;
    setSelectedWorkstation(workstationType);
    setWorkstationNodeGroups(getNodeGroupsByWorkstation(workstationType));
    useCanvasStore.getState().clearCanvas();
  };

  const handleRunFlow = useCallback(() => setIsRunning(true), []);
  const handleStopFlow = useCallback(() => setIsRunning(false), []);
  const handleZoomIn = useCallback(() => setZoomLevel((z) => Math.min(3, +(z + 0.1).toFixed(2))), []);
  const handleZoomOut = useCallback(() => setZoomLevel((z) => Math.max(0.2, +(z - 0.1).toFixed(2))), []);
  const handleResetZoom = useCallback(() => setZoomLevel(1), []);

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
    const observer = setupAutoGlassEffect();
    return () => observer?.disconnect();
  }, []);

  useEffect(() => {
    stateLinkageManager.initialize().catch(console.error);
    stateLinkageManager.setNodesUpdateCallback(setNodes);
    stateLinkageManager.setExecutionUpdateCallback((executionState) => {
      setIsRunning(executionState.status === 'running');
      if (executionState.status === 'failed') {
        setIsNotificationPanelOpen(true);
      }
    });
    const handleBeforeUnload = () => stateLinkageManager.cleanup();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      setTimeout(() => {
        if (document.visibilityState === 'hidden') {
          stateLinkageManager.cleanup();
        }
      }, 100);
    };
  }, [setNodes]);

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

  const runFlow = async () => {
    if (nodes.length === 0 || isRunning || !selectedWorkstation) {
        setIsNotificationPanelOpen(true);
        return;
    }
    try {
      const workflowId = `workflow_${Date.now()}`;
      const workflowDefinition = { id: workflowId, name: `鐢靛寲瀛︽祦绋媉${new Date().toLocaleString()}`, nodes: nodes.map(n => ({...n.data.parameters})) }; // Simplified
      const res = await fetch('/api/workflows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(workflowDefinition) });
      if (!res.ok) throw new Error(`鍒涘缓宸ヤ綔娴佸け璐: ${res.status}`);
      const created = await res.json();
      await stateLinkageManager.startExecution(created.id, nodes);
    } catch (error) {
      setIsNotificationPanelOpen(true);
    }
  };

  const stopFlow = async () => {
    if (!isRunning) return;
    try {
      const execState = stateLinkageManager.getExecutionState();
      if (execState) await stateLinkageManager.cancelExecution(execState.executionId);
    } finally {
      setIsRunning(false);
    }
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
    <>
      <div className="app-root">
        <TopNavbar
          fixedDevice={fixedDevice}
          onDeviceClick={(d) => setFixedDevice(d)}
          onWorkstationSelect={(w: any) => setSelectedWorkstation(w?.id as WorkstationType)}
        />

        <div className="main-viewport">
          {/* 左侧：侧边栏 */}
          <Sidebar
            activePanel={activePanel}
            onPanelChange={setActivePanel}
            nodeGroups={workstationNodeGroups}
            selectedWorkstation={selectedWorkstation}
          />

          {/* 中间：画布区域与工具栏 */}
          <div className="canvas-area glass">
            <Toolbar
              onRunFlow={handleRunFlow}
              onStopFlow={handleStopFlow}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onResetZoom={handleResetZoom}
              selectedWorkstation={selectedWorkstation}
            />
            <div className="canvas-container canvas-grid">
              <div className="canvas-inner">
                <p>Main Canvas Area</p>
              </div>
            </div>
          </div>

          {/* 右侧：属性面板容器 */}
          <div className="right-panels">
            <PropertyPanel selectedWorkstation={selectedWorkstation} />
          </div>
        </div>

        {/* 浮层：设备模态框，吸附左侧与画布顶部（在 main-viewport 内） */}
        {fixedDevice && (
          <div className="layout-overlay align-to-L align-to-canvas-top">
            <DeviceModal
              device={fixedDevice}
              onClose={() => setFixedDevice(null)}
              modalTop={0}
              modalLeft={0}
              modalWidth={500}
              modalHeight={400}
            />
          </div>
        )}
      </div>

      {/* 固定在视口底部的状态栏（不在 app-root 网格内） */}
      <StatusBar
        zoomLevel={zoomLevel}
        isRunning={isRunning}
        isNotificationPanelOpen={isNotificationPanelOpen}
        setIsNotificationPanelOpen={setIsNotificationPanelOpen}
      />
    </>
  );
};

export default ZahnerFlowApp;
