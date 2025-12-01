import React, { useState, useEffect, useCallback } from 'react';
import { WorkstationType, LoopStartNode, LoopEndNode, getNodeGroupsByWorkstation } from './types/nodes';
import { TopNavbar } from './components/TopNavbar';
import { Sidebar } from './components/Sidebar';
import { PropertyPanel } from './components/PropertyPanel';
import { StatusBar } from './components/StatusBar';
import { Canvas } from './components/Canvas';
import { setupAutoGlassEffect } from './utils/glassEffect';
// --- 移除 stateLinkageManager 的深度依赖，仅用于节点颜色辅助 ---
import { stateLinkageManager } from './managers/state-linkage.manager';
import { useCanvasStore } from './services/stores/canvasStore';
import { useWorkflowStore, useExecutionStore, useIsRunning, useExecutionError } from './services/stores';
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
    setConnections // 需要获取setConnections
  } = useCanvasStore();

  const [furnaceState, furnaceControls] = useFurnace();
  const [activePanel, setActivePanel] = useState<'nodes'>('nodes');
  const [selectedWorkstation, setSelectedWorkstation] = useState<WorkstationType | null>(null);
  const [workstationNodeGroups, setWorkstationNodeGroups] = useState<any>({} as any);

  const [zoomLevel, setZoomLevel] = useState(1);
  // --- 【重构】使用 Store 的派生状态 ---
  const isRunning = useIsRunning();
  const executionError = useExecutionError(); // 获取具体错误信息
  const hasError = !!executionError;
  
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const [fixedDevice, setFixedDevice] = useState<'furnace' | 'mfc' | null>(null);
  const [showWorkflowManager, setShowWorkflowManager] = useState(false);
  const [showFilePathManager, setShowFilePathManager] = useState(false);
  const [detectedLoops, setDetectedLoops] = useState<LoopInfo[]>([]);

  // 获取 Store Actions
  const { startExecution, stopExecution, clearError } = useExecutionStore();
  const { currentWorkflow, setCurrentWorkflow } = useWorkflowStore();

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

  const handleStopFlow = useCallback(async () => {
    await stopFlow();
  }, []);

  const handleZoomIn = useCallback(() => setZoomLevel((z) => Math.min(3, +(z + 0.1).toFixed(2))), []);
  const handleZoomOut = useCallback(() => setZoomLevel((z) => Math.max(0.2, +(z - 0.1).toFixed(2))), []);
  const handleResetZoom = useCallback(() => setZoomLevel(1), []);
  const handleLoopDetected = useCallback((loops: LoopInfo[]) => setDetectedLoops(loops), []);

  useEffect(() => {
    const observer = setupAutoGlassEffect();
    return () => observer?.disconnect();
  }, []);

  // --- 【重构】简化初始化逻辑 ---
  useEffect(() => {
    // 这里的 manager 现在只负责监听 WebSocket 来更新 Canvas 上的节点颜色
    stateLinkageManager.initialize();
    stateLinkageManager.setNodesUpdateCallback(setNodes);

    // 错误处理逻辑：当 Store 中出现错误时自动打开面板
    if (hasError) {
      setIsNotificationPanelOpen(true);
    }

    const handleBeforeUnload = () => stateLinkageManager.cleanup();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      stateLinkageManager.cleanup();
    };
  }, [setNodes, hasError]); // 监听 hasError 变化

  const runFlow = async () => {
    if (nodes.length === 0 || isRunning || !selectedWorkstation) {
        setIsNotificationPanelOpen(true);
        return;
    }
    
    // 如果有之前的错误，先清除
    if (hasError) clearError();

    try {
      let targetWorkflowId = currentWorkflow?.id;

      // 逻辑保持不变：如果是新工作流或临时工作流，先创建
      if (!currentWorkflow || currentWorkflow.id.startsWith('temp-workflow-')) {
        const workflowDefinition = {
          id: `temp_workflow_${Date.now()}`,
          name: (currentWorkflow?.name && currentWorkflow.name !== '临时工作流') ? currentWorkflow.name : undefined,
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
            status: 'ready' // 重置状态
          })),
          edges: connections.map(conn => ({
            id: conn.id,
            source: conn.source_id,
            target: conn.target_id,
            type: 'flow'
          })),
          version: 1
        };

        const createdWorkflow = await workflowService.createWorkflow(workflowDefinition);
        if (!createdWorkflow) throw new Error("Failed to create workflow");

        console.log(`创建新工作流: ${createdWorkflow.id}`);
        
        // ID 映射逻辑 (保持不变)
        const { nodes: backendNodes } = createdWorkflow.definition;
        const idMap = new Map<string, string>();
        nodes.forEach((node, index) => {
          if (backendNodes[index]) idMap.set(node.id, backendNodes[index].id);
        });

        const updatedNodes = nodes.map(node => ({ ...node, id: idMap.get(node.id) || node.id }));
        setNodes(updatedNodes);

        const updatedConnections = connections.map(conn => ({
          ...conn,
          source_id: idMap.get(conn.source_id) || conn.source_id,
          target_id: idMap.get(conn.target_id) || conn.target_id
        }));
        setConnections(updatedConnections); // 使用解构出的 setter
        
        setCurrentWorkflow(createdWorkflow);
        targetWorkflowId = createdWorkflow.id;
        
        // 更新 Manager 里的节点引用，以便后续更新颜色
        stateLinkageManager.setNodes(updatedNodes);
      } else {
        // 历史工作流：更新 Manager 节点引用
        stateLinkageManager.setNodes(nodes);
      }

      // --- 【重构】调用 Store Action 启动执行 ---
      if (targetWorkflowId) {
        // 告知 Manager 当前工作流ID，以便它能过滤 WebSocket 消息
        stateLinkageManager.setCurrentWorkflow(targetWorkflowId);
        await startExecution(targetWorkflowId);
      }

    } catch (error) {
      console.error('工作流执行失败:', error);
      setIsNotificationPanelOpen(true);
    }
  };

  const stopFlow = async () => {
    try {
      // --- 【重构】调用 Store Action 停止执行 ---
      await stopExecution();
    } catch (error) {
      console.error('Stop flow failed:', error);
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
        if (hasError) clearError();
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