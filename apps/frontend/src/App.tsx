import React, { useState, useEffect, useCallback } from 'react';
import { WorkstationType, LoopStartNode, LoopEndNode, getNodeGroupsByWorkstation } from './types/nodes';
import { Toolbar } from './components/Toolbar';
import { TopNavbar } from './components/TopNavbar';
import { Sidebar } from './components/Sidebar';
import { PropertyPanel } from './components/PropertyPanel';
import { StatusBar } from './components/StatusBar';
import { LoopBoundary } from './components/features/loop';
import { Canvas } from './components/Canvas';
import { setupAutoGlassEffect } from './utils/glassEffect';
import { stateLinkageManager } from './managers/state-linkage.manager';
import { useCanvasStore } from './services/stores/canvasStore';
import { DeviceModal } from './components/DeviceModal';
import { MFCModal } from './components/MFCModal';
import { workflowService } from './services/workflowService';
import { useFurnace } from './services/hooks/useFurnace';
import { UserProvider } from './contexts/UserContext';
import type { LoopInfo } from './components/features/loop';



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
  const [showFilePathManager, setShowFilePathManager] = useState(false);
  const [detectedLoops, setDetectedLoops] = useState<LoopInfo[]>([]);

  const handleWorkstationSelect = (workstation: any) => {
    const workstationType = workstation.id as WorkstationType;
    setSelectedWorkstation(workstationType);
    setWorkstationNodeGroups(getNodeGroupsByWorkstation(workstationType));
    useCanvasStore.getState().clearCanvas();
  };

  const handleFilePathSave = (config: any) => {
    console.log('File path configuration saved:', config);
    // 鍙互鍦ㄨ繖閲屾坊鍔犲叾浠栧鐞嗛€昏緫锛屾瘮濡備繚瀛樺埌鏈湴瀛樺偍
  };

  const handleRunFlow = useCallback(async () => {
  await runFlow();
}, [nodes, connections, selectedWorkstation, isRunning]);
  const handleStopFlow = useCallback(() => setIsRunning(false), []);
  const handleZoomIn = useCallback(() => setZoomLevel((z) => Math.min(3, +(z + 0.1).toFixed(2))), []);
  const handleZoomOut = useCallback(() => setZoomLevel((z) => Math.max(0.2, +(z - 0.1).toFixed(2))), []);
  const handleResetZoom = useCallback(() => setZoomLevel(1), []);

  // 循环检测回调函数
  const handleLoopDetected = useCallback((loops: LoopInfo[]) => {
    setDetectedLoops(loops);
  }, []);

  
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
        name: `电化学工作流${new Date().toLocaleString()}`,
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
          source: conn.source_id,
          target: conn.target_id,
          type: 'flow'
        })),
        version: 1
      };

    
      // 直接发送WorkflowDefinition到后端
      const createdWorkflow = await workflowService.createWorkflow(workflowDefinition);

      if (!createdWorkflow) {
        throw new Error("Failed to create workflow");
      }
      await stateLinkageManager.startExecution((createdWorkflow || { id: "" }).id, nodes);
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
      <UserProvider>
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
          {/* 涓棿锛氱敾甯冨尯鍩熶笌宸ュ叿鏍?*/}
          <div className="canvas-area glass">
            <Toolbar
              onRunFlow={handleRunFlow}
              onStopFlow={handleStopFlow}
              selectedWorkstation={selectedWorkstation}
              onToggleWorkflowManager={() => setShowWorkflowManager(!showWorkflowManager)}
              showWorkflowManager={showWorkflowManager}
              onToggleFilePathManager={() => setShowFilePathManager(!showFilePathManager)}
              showFilePathManager={showFilePathManager}
              onFilePathSave={handleFilePathSave}
            />
            <Canvas
              zoomLevel={zoomLevel}
              selectedWorkstation={selectedWorkstation}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onResetZoom={handleResetZoom}
              showWorkflowManager={showWorkflowManager}
              onToggleWorkflowManager={() => setShowWorkflowManager(!showWorkflowManager)}
              onLoopDetected={handleLoopDetected}
            />
          </div>

          {/* 右侧：属性面板容器 */}
          <div className="right-panels">
            <PropertyPanel selectedWorkstation={selectedWorkstation} />
          </div>
        </div>

        {/* 娴眰锛氳澶囨ā鎬佹锛屽惛闄勫乏渚т笌鐢诲竷椤堕儴锛堝湪 main-viewport 鍐咃級 */}
        {fixedDevice && (
          <div className="layout-overlay align-to-L align-to-canvas-top">
            {fixedDevice === 'mfc' ? (
              <MFCModal
                on_close={() => setFixedDevice(null)}
                modal_top={0}
                modal_left={0}
                modal_width={500}
                modal_height={400}
              />
            ) : (
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
            )}
          </div>
        )}
      </div>

      /* 固定在视窗底部的状态栏（不在 app-root 网格内） */
      <StatusBar
        zoomLevel={zoomLevel}
        isRunning={isRunning}
        isNotificationPanelOpen={isNotificationPanelOpen}
        setIsNotificationPanelOpen={setIsNotificationPanelOpen}
        detectedLoops={detectedLoops}
      />
      </UserProvider>
    </>
  );
};

export default ZahnerFlowApp;

