import React, { useState, useEffect, useCallback } from 'react';
import { WorkstationType, LoopStartNode, LoopEndNode, getNodeGroupsByWorkstation } from './types/nodes';
import { TopNavbar } from './components/TopNavbar';
import { Sidebar } from './components/Sidebar';
import { PropertyPanel } from './components/PropertyPanel';
import { StatusBar } from './components/StatusBar';
import { Canvas } from './canvas/Canvas';
import { setupAutoGlassEffect } from './shared/glassEffect';
// --- 移除旧的 state-linkage.manager ---
// import { stateLinkageManager } from './managers/state-linkage.manager';

import { useCanvasStore } from './canvas/canvasStore';
import { useWorkflowStore, useExecutionStore } from './workflow'; // 引入 executionStore
import { workflowWebSocketService } from './workflow/websocket.service'; // 引入 WS 服务

import { MFCModal } from './modules/mfc';
import { useFurnace, DeviceModal } from './modules/furnace';
import { UserProvider } from './shared/UserContext';
import type { SimpleLoopInfo } from './canvas/useSimpleLoopDetection';

const ZahnerFlowApp: React.FC = () => {
  // Canvas Store
  const {
    nodes,
    setNodes, // 虽然 executionStore 处理状态，但在画布上编辑仍需这个
    connections,
  } = useCanvasStore();

  // Workflow Store
  const { currentWorkflow, setCurrentWorkflow } = useWorkflowStore();

  // Execution Store (直接解构状态和动作)
  const { 
    isRunning, 
    error: executionError, 
    startExecution, 
    stopExecution, 
    resetExecutionState 
  } = useExecutionStore();

  // 本地 UI 状态
  const [furnaceState, furnaceControls] = useFurnace();
  const [activePanel, setActivePanel] = useState<'nodes'>('nodes');
  const [selectedWorkstation, setSelectedWorkstation] = useState<WorkstationType | null>(null);
  const [workstationNodeGroups, setWorkstationNodeGroups] = useState<any>({} as any);

  const [zoomLevel, setZoomLevel] = useState(1);
  // const [isRunning, setIsRunning] = useState(false); // 移除：改用 store 中的 isRunning
  // const [hasError, setHasError] = useState(false);   // 移除：改用 derived state
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const [fixedDevice, setFixedDevice] = useState<'furnace' | 'mfc' | null>(null);
  const [showWorkflowManager, setShowWorkflowManager] = useState(false);
  const [showFilePathManager, setShowFilePathManager] = useState(false);
  const [detectedLoops, setDetectedLoops] = useState<SimpleLoopInfo[]>([]);

  // 派生状态：是否出错
  const hasError = !!executionError;

  // 监听执行错误，自动打开通知面板
  useEffect(() => {
    if (hasError) {
      setIsNotificationPanelOpen(true);
    }
  }, [hasError]);

  const handleWorkstationSelect = (workstation: any) => {
    const workstationType = workstation.id as WorkstationType;
    setSelectedWorkstation(workstationType);
    setWorkstationNodeGroups(getNodeGroupsByWorkstation(workstationType));
    useCanvasStore.getState().clearCanvas();
  };

  const handleFilePathSave = (config: any) => {
    console.log('File path configuration saved:', config);
  };

  // 玻璃态效果
  useEffect(() => {
    const observer = setupAutoGlassEffect();
    return () => observer?.disconnect();
  }, []);

  // --- WebSocket 初始化 ---
  useEffect(() => {
    // 连接 WebSocket
    workflowWebSocketService.connect();

    return () => {
      // 组件卸载时可以不断开，或者根据需求断开
      // workflowWebSocketService.disconnect();
    };
  }, []);

  // --- 执行控制逻辑 ---

  const runFlow = async () => {
    if (nodes.length === 0 || isRunning || !selectedWorkstation) {
        setIsNotificationPanelOpen(true);
        return;
    }
    try {
      // Create if Null 模式：workflowId为null时后端创建新工作流
      const workflowId = currentWorkflow?.id || null;

      // 使用 store action 启动执行
      await startExecution(workflowId, nodes);

      // 获取更新后的 ID (如果之前是 null，startExecution 会在内部更新 store 的 workflowId)
      // 注意：由于状态更新可能是异步的，这里最好依赖 store 的订阅，但为了简化逻辑：
      // 我们可以假设后端返回了 ID，我们需要手动构造一个暂时的 workflow 对象用于显示
      
      const newWorkflowId = useExecutionStore.getState().workflowId;

      // 如果后端创建了新工作流（原ID为空，现ID不为空），更新 WorkflowStore
      if (newWorkflowId && !currentWorkflow?.id) {
        setCurrentWorkflow({
          id: newWorkflowId,
          name: '新建工作流',
          // 修正：结构适配 Workflow 接口
          definition: {
            id: newWorkflowId,
            name: '新建工作流',
            version: 1.0,
            nodes: nodes
          },
          workstation: selectedWorkstation, // 使用当前选择的工作站类型
          status: 'active',
          ownerName: 'Current User', // 可选
          createdAt: new Date(),
          updatedAt: new Date()
        });
        console.log(`后端创建新工作流: ${newWorkflowId}`);
      }
    } catch (error) {
      console.error('工作流执行失败:', error);
      setIsNotificationPanelOpen(true);
    }
  };

  const stopFlow = async () => {
    if (!isRunning) return;
    try {
      await stopExecution();
    } catch (error) {
      console.error('停止失败:', error);
    }
  };

  const resetFlow = async () => {
    try {
      console.log('[App] 重置工作流执行状态...');

      // 1. 调用后端强制重置接口 (保持原逻辑，作为一种"Panic Button")
      const response = await fetch('/api/executions/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const result = await response.json();
        console.log('[App] 重置成功:', result.message);

        // 2. 重置前端 Store 状态
        resetExecutionState();
      } else {
        console.error('[App] 重置失败:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Reset flow failed:', error);
    }
  };

  // 包装回调
  const handleRunFlow = useCallback(async () => {
    await runFlow();
  }, [nodes, isRunning, selectedWorkstation, currentWorkflow, startExecution, setCurrentWorkflow]); // 添加依赖

  const handleStopFlow = useCallback(stopFlow, [isRunning, stopExecution]);
  
  // 缩放控制
  const handleZoomIn = useCallback(() => setZoomLevel((z) => Math.min(3, +(z + 0.1).toFixed(2))), []);
  const handleZoomOut = useCallback(() => setZoomLevel((z) => Math.max(0.2, +(z - 0.1).toFixed(2))), []);
  const handleResetZoom = useCallback(() => setZoomLevel(1), []);

  // 循环检测回调函数
  const handleLoopDetected = useCallback((loops: SimpleLoopInfo[]) => {
    setDetectedLoops(loops);
  }, []);

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
          isRunning={isRunning} // 使用 store 状态
          hasError={hasError}   // 使用 derived 状态
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

        {/* 浮层：设备模态框 */}
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