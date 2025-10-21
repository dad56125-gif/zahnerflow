import React, { useState, useEffect, useCallback } from 'react';
import { WorkstationType, LoopStartNode, LoopEndNode, getNodeGroupsByWorkstation } from './nodes/types';
import { Toolbar } from './components/Toolbar';
import { TopNavbar } from './components/TopNavbar';
import { Sidebar } from './components/Sidebar';
import { PropertyPanel } from './components/PropertyPanel';
import { StatusBar } from './components/StatusBar';
import { LoopBoundary } from './components/LoopBoundary';
import { Canvas } from './components/Canvas';
import { setupAutoGlassEffect } from './utils/glassEffect';
import { stateLinkageManager } from './managers/state-linkage.manager';
import { useCanvasStore } from './stores/canvasStore';
import { DeviceModal } from './components/DeviceModal';
import { workflowService } from './services/workflowService';
import { useFurnace } from './services/hooks/useFurnace';



const ZahnerFlowApp: React.FC = () => {
  const {
    nodes,
    setNodes,
    connections,
  } = useCanvasStore();

  const [furnaceState, furnaceControls] = useFurnace();
  const [activePanel, setActivePanel] = useState<'nodes'>('nodes');
  const [selectedWorkstation, setSelectedWorkstation] = useState<WorkstationType | null>(null);
  const [workstationNodeGroups, setWorkstationNodeGroups] = useState<any>({} as any);

  const [zoomLevel, setZoomLevel] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const [loopPairs, _setLoopPairs] = useState<Map<string, { startNode: LoopStartNode; endNode: LoopEndNode; nodesInLoop: any[] }>>(new Map());
  const [fixedDevice, setFixedDevice] = useState<'furnace' | 'mfc' | null>(null);
  const [showWorkflowManager, setShowWorkflowManager] = useState(false);

  const handleWorkstationSelect = (workstation: any) => {
    const workstationType = workstation.id as WorkstationType;
    setSelectedWorkstation(workstationType);
    setWorkstationNodeGroups(getNodeGroupsByWorkstation(workstationType));
    useCanvasStore.getState().clearCanvas();
  };

  const handleRunFlow = useCallback(async () => {
  await runFlow();
}, [nodes, connections, selectedWorkstation, isRunning]);
  const handleStopFlow = useCallback(() => setIsRunning(false), []);
  const handleZoomIn = useCallback(() => setZoomLevel((z) => Math.min(3, +(z + 0.1).toFixed(2))), []);
  const handleZoomOut = useCallback(() => setZoomLevel((z) => Math.max(0.2, +(z - 0.1).toFixed(2))), []);
  const handleResetZoom = useCallback(() => setZoomLevel(1), []);

  
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

  
  const runFlow = async () => {
    if (nodes.length === 0 || isRunning || !selectedWorkstation) {
        setIsNotificationPanelOpen(true);
        return;
    }
    try {
      const workflowDefinition = {
        id: `workflow_${Date.now()}`,
        name: `电化学流程_${new Date().toLocaleString()}`,
        description: '通过前端界面创建的电化学测量流程',
        nodes: nodes.map(node => ({
          id: node.id,
          type: node.type,
          name: node.name,
          config: node.data?.parameters || {},
          position: node.position,
          data: node.data,
          status: node.status
        })),
        edges: connections.map(conn => ({
          id: conn.id,
          source: conn.sourceId,
          target: conn.targetId,
          type: 'flow'
        })),
        version: 1
      };

    
      // 直接发送WorkflowDefinition到后端
      const createdWorkflow = await workflowService.createWorkflow(workflowDefinition);

      await stateLinkageManager.startExecution(createdWorkflow.id, nodes);
    } catch (error) {
      console.error('工作流执行失败:', error);
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

  
  return (
    <>
      <div className="app-root">
          <TopNavbar
            fixedDevice={fixedDevice}
            onDeviceClick={(d) => setFixedDevice(d)}
            onWorkstationSelect={handleWorkstationSelect}
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
              selectedWorkstation={selectedWorkstation}
              onToggleWorkflowManager={() => setShowWorkflowManager(!showWorkflowManager)}
              showWorkflowManager={showWorkflowManager}
            />
            <Canvas
              zoomLevel={zoomLevel}
              selectedWorkstation={selectedWorkstation}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onResetZoom={handleResetZoom}
              showWorkflowManager={showWorkflowManager}
              onToggleWorkflowManager={() => setShowWorkflowManager(!showWorkflowManager)}
            />
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
              furnaceState={furnaceState}
              furnaceControls={furnaceControls}
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
