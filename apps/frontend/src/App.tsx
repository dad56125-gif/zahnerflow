import React, { useState, useEffect, useCallback } from 'react';
import { WorkstationType, LoopStartNode, LoopEndNode, getNodeGroupsByWorkstation } from './types/nodes';
import { TopNavbar } from './components/TopNavbar';
import { Sidebar } from './components/Sidebar';
import { PropertyPanel } from './components/PropertyPanel';
import { StatusBar } from './components/StatusBar';
import { Canvas } from './canvas/Canvas';
import { setupAutoGlassEffect } from './shared/glassEffect';
import { stateLinkageManager } from './managers/state-linkage.manager';
import { useCanvasStore } from './canvas/canvasStore';
import { useWorkflowStore } from './workflow';
import { MFCModal } from './modules/mfc';
import { workflowService } from './workflow/workflowService';
import { useFurnace, DeviceModal } from './modules/furnace';
import { UserProvider } from './contexts/UserContext';
import type { SimpleLoopInfo } from './canvas/useSimpleLoopDetection';



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
  const [hasError, setHasError] = useState(false);
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const [loopPairs, _setLoopPairs] = useState<Map<string, { startNode: LoopStartNode; endNode: LoopEndNode; nodesInLoop: any[] }>>(new Map());
  const [fixedDevice, setFixedDevice] = useState<'furnace' | 'mfc' | null>(null);
  const [showWorkflowManager, setShowWorkflowManager] = useState(false);
  const [showFilePathManager, setShowFilePathManager] = useState(false);
  const [detectedLoops, setDetectedLoops] = useState<SimpleLoopInfo[]>([]);

  const handleWorkstationSelect = (workstation: any) => {
    const workstationType = workstation.id as WorkstationType;
    setSelectedWorkstation(workstationType);
    setWorkstationNodeGroups(getNodeGroupsByWorkstation(workstationType));
    useCanvasStore.getState().clearCanvas();
  };

  const handleFilePathSave = (config: any) => {
    console.log('File path configuration saved:', config);
  };

  const handleRunFlow = useCallback(async () => {
  await runFlow();
}, [nodes, connections, selectedWorkstation, isRunning]);
  const handleStopFlow = useCallback(() => setIsRunning(false), []);
  const handleZoomIn = useCallback(() => setZoomLevel((z) => Math.min(3, +(z + 0.1).toFixed(2))), []);
  const handleZoomOut = useCallback(() => setZoomLevel((z) => Math.max(0.2, +(z - 0.1).toFixed(2))), []);
  const handleResetZoom = useCallback(() => setZoomLevel(1), []);

  // 循环检测回调函数
  const handleLoopDetected = useCallback((loops: SimpleLoopInfo[]) => {
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
        setHasError(true);
        setIsNotificationPanelOpen(true);
      } else if (executionState.status === 'running') {
        setHasError(false);
      } else if (executionState.status === 'completed') {
        setHasError(false);
        setIsRunning(false);
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
      // Create if Null 模式：workflowId为null时后端创建新工作流
      const { currentWorkflow } = useWorkflowStore.getState();
      const workflowId = currentWorkflow?.id || null;

      const result = await stateLinkageManager.startExecution(workflowId, nodes);

      // 如果后端返回了新创建的workflowId，更新currentWorkflow
      if (result?.workflowId && !currentWorkflow?.id) {
        const { setCurrentWorkflow } = useWorkflowStore.getState();
        setCurrentWorkflow({
          id: result.workflowId,
          name: '新建工作流',
          nodes: nodes
        });
        console.log(`后端创建新工作流: ${result.workflowId}`);
      }
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

  const resetFlow = async () => {
    try {
      console.log('[App] 重置工作流执行状态...');

      // 调用后端重置API
      const response = await fetch('/api/executions/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const result = await response.json();
        console.log('[App] 重置成功:', result.message);

        // 清除本地错误状态
        if (hasError) setHasError(false);
        setIsRunning(false);
      } else {
        console.error('[App] 重置失败:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Reset flow failed:', error);
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

        {/* 主要内容区域：三区域布局 */}
        <div className="leftbar-area">
          <Sidebar
            activePanel={activePanel}
            onPanelChange={setActivePanel}
            nodeGroups={workstationNodeGroups}
            selectedWorkstation={selectedWorkstation}
          />
        </div>

        <div className="canvas-area">
        <Canvas
          zoomLevel={zoomLevel}
          selectedWorkstation={selectedWorkstation}
          isRunning={isRunning}
          hasError={hasError}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetZoom={handleResetZoom}
          showWorkflowManager={showWorkflowManager}
          onToggleWorkflowManager={() => setShowWorkflowManager(!showWorkflowManager)}
          showFilePathManager={showFilePathManager}
          onToggleFilePathManager={() => setShowFilePathManager(!showFilePathManager)}
          onFilePathSave={handleFilePathSave}
          onRunFlow={handleRunFlow}
          onStopFlow={handleStopFlow}
          onResetFlow={resetFlow}
          onLoopDetected={handleLoopDetected}
        />
        </div>

        <div className="right-area">
          <PropertyPanel selectedWorkstation={selectedWorkstation} />
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

        {/* 集成到grid系统的状态栏 */}
        <StatusBar
          zoomLevel={zoomLevel}
          isRunning={isRunning}
          isNotificationPanelOpen={isNotificationPanelOpen}
          setIsNotificationPanelOpen={setIsNotificationPanelOpen}
          detectedLoops={detectedLoops}
        />
      </div>
      </UserProvider>
    </>
  );
};

export default ZahnerFlowApp;

