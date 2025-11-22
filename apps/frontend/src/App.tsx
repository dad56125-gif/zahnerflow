import React, { useState, useEffect, useCallback } from 'react';
import { WorkstationType, LoopStartNode, LoopEndNode, getNodeGroupsByWorkstation } from './types/nodes';
import { TopNavbar } from './components/TopNavbar';
import { Sidebar } from './components/Sidebar';
import { PropertyPanel } from './components/PropertyPanel';
import { StatusBar } from './components/StatusBar';
import { LoopBoundary } from './components/features/loop';
import { Canvas } from './components/Canvas';
import { setupAutoGlassEffect } from './utils/glassEffect';
import { stateLinkageManager } from './managers/state-linkage.manager';
import { useCanvasStore } from './services/stores/canvasStore';
import { useWorkflowStore } from './services/stores';
import { MFCModal } from './modules/mfc';
import { workflowService } from './services/workflowService';
import { useFurnace, DeviceModal } from './modules/furnace';
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
      // 检查是否有当前编辑的工作流
      const { currentWorkflow } = useWorkflowStore.getState();

      if (currentWorkflow && !currentWorkflow.id.startsWith('temp-workflow-')) {
        // 历史工作流：直接使用现有工作流执行
        console.log(`执行历史工作流 "${currentWorkflow.name}" (ID: ${currentWorkflow.id})`);
        await stateLinkageManager.startExecution(currentWorkflow.id, nodes);
      } else {
        // 临时工作流或新工作流：创建新的工作流定义，提供临时ID（后端会重新生成）
        const workflowDefinition = {
          id: `temp_workflow_${Date.now()}`, // 临时ID，后端会重新生成
          name: (currentWorkflow?.name && currentWorkflow.name !== '临时工作流')
            ? currentWorkflow.name
            : undefined, // 工作流只依靠ID，name字段不是必需的
          description: '通过前端界面创建的电化学测量流程',
          ownerName: '默认用户',
          individualName: '默认项目',
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

        // 创建新工作流（后端会生成ID）
        const createdWorkflow = await workflowService.createWorkflow(workflowDefinition);

        if (!createdWorkflow) {
          throw new Error("Failed to create workflow");
        }
        console.log(`创建并执行新工作流 "${createdWorkflow.name}" (ID: ${createdWorkflow.id})`);

        // 同步更新前端的节点ID，使其与后端生成的一致
        const { nodes: backendNodes } = createdWorkflow.definition;
        const idMap = new Map<string, string>();
        nodes.forEach((node, index) => {
          if (backendNodes[index]) {
            idMap.set(node.id, backendNodes[index].id);
            console.log(`节点ID映射: ${node.id} -> ${backendNodes[index].id}`);
          }
        });

        // 更新节点数组使用新的ID
        const updatedNodes = nodes.map((node) => ({
          ...node,
          id: idMap.get(node.id) || node.id
        }));
        setNodes(updatedNodes);

        // 更新连接数组使用新的ID
        const updatedConnections = connections.map(conn => ({
          ...conn,
          source_id: idMap.get(conn.source_id) || conn.source_id,
          target_id: idMap.get(conn.target_id) || conn.target_id
        }));
        const { setConnections } = useCanvasStore.getState();
        setConnections(updatedConnections);

        // 更新WorkflowStore的currentWorkflow状态，确保workflow-id-display能正确显示
        const { setCurrentWorkflow } = useWorkflowStore.getState();
        setCurrentWorkflow(createdWorkflow);

        await stateLinkageManager.startExecution(createdWorkflow.id, updatedNodes);
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

