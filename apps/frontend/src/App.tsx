import React, { useState, useEffect, useCallback } from 'react';
import { WorkstationType, Workflow } from './types/Interfaces';
import { getNodeGroupsByWorkstation } from './types/NodeUtilities';

import { TopNavbar } from './components/TopNavbar';
import { Sidebar } from './components/Sidebar';
import { PropertyPanel } from './components/PropertyPanel';
import { StatusBar } from './components/StatusBar';
import { ChartModal } from './components/ChartModal';
import { Canvas } from './canvas/Canvas';
import { setupAutoGlassEffect } from './shared/glassEffect';
import ParticleBackground from './components/ParticleBackground';

import { useCanvasStore } from './state/canvasStore';
import { useWorkflowStore, useExecutionStore, useSystemState } from './workflow';
import { workflowWebSocketService } from './workflow/websocket.service';
// clearMeasurementCache 现在由 executionStore 的 nodesReset 监听统一处理

import { MFCModal, useMfc } from './modules/mfc';
import { useFurnace, DeviceModal } from './modules/furnace';
import { ReportGeneratorModal } from './modules/report';
import { UserProvider, useUser } from './shared/UserContext';
import type { SimpleLoopInfo } from './canvas/useLoopDetection';

// 内部应用内容组件（在 UserProvider 内部，可以使用 useUser）
const AppContent: React.FC = () => {
  // 用户上下文
  const { currentUser, filePathConfig } = useUser();

  // Canvas Store
  const { nodes } = useCanvasStore();

  // Workflow Store
  const { currentWorkflow, setCurrentWorkflow } = useWorkflowStore();

  // Execution Store
  const {
    isRunning,
    error: executionError,
    startExecution,
    stopExecution
    // resetExecutionState 现在由 executionStore 的 nodesReset 监听统一处理
  } = useExecutionStore();

  // 本地 UI 状态
  const [furnaceState, furnaceControls] = useFurnace();
  const [mfcState, mfcControls] = useMfc();
  const [activePanel, setActivePanel] = useState<'nodes'>('nodes');
  const [selectedWorkstation, setSelectedWorkstation] = useState<WorkstationType | null>(null);
  const [workstationNodeGroups, setWorkstationNodeGroups] = useState<any>({} as any);

  const [zoomLevel, setZoomLevel] = useState(1);
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const [fixedDevice, setFixedDevice] = useState<'furnace' | 'mfc' | null>(null);
  const [showWorkflowManager, setShowWorkflowManager] = useState(false);
  const [showFilePathManager, setShowFilePathManager] = useState(false);
  const [detectedLoops, setDetectedLoops] = useState<SimpleLoopInfo[]>([]);
  const [showChartModal, setShowChartModal] = useState(false);

  // 报告相关状态
  const [showReportModal, setShowReportModal] = useState(false);
  const [lastExecution, setLastExecution] = useState<{
    executionId: string;
    workflowId: string;
    status: 'completed' | 'failed' | 'cancelled';
    startTime: string;
    endTime?: string;
    duration?: number;
  } | null>(null);
  const [lastNodeStatuses, setLastNodeStatuses] = useState<string[]>([]);

  // 获取实时系统状态
  const systemState = useSystemState();

  // 派生状态：是否出错
  const hasError = !!executionError;

  // 监听执行错误，自动打开通知面板
  useEffect(() => {
    if (hasError) {
      setIsNotificationPanelOpen(true);
    }
  }, [hasError]);

  // 监听执行完成，记录最后一次执行信息（用于报告生成）
  const prevIsRunning = React.useRef(isRunning);
  useEffect(() => {
    // 从运行中 -> 停止，说明执行完成
    if (prevIsRunning.current && !isRunning) {
      const executionState = useExecutionStore.getState();
      const { executionId, workflowId, lastSnapshot, nodeStatuses } = executionState;

      if (executionId && workflowId) {
        setLastExecution({
          executionId,
          workflowId,
          status: executionError ? 'failed' : 'completed',
          startTime: lastSnapshot?.startTime || new Date().toISOString(),
          endTime: new Date().toISOString(),
          duration: lastSnapshot?.duration || 0
        });
        // 保存节点状态用于报告
        setLastNodeStatuses([...nodeStatuses]);
      }
    }
    prevIsRunning.current = isRunning;
  }, [isRunning, executionError]);

  const handleWorkstationSelect = (workstation: any) => {
    const workstationType = workstation.id as WorkstationType;
    setSelectedWorkstation(workstationType);
    setWorkstationNodeGroups(getNodeGroupsByWorkstation(workstationType));
    useCanvasStore.getState().clearCanvas();
    setCurrentWorkflow(null);  // 清空当前工作流，避免新节点使用旧 workflowId
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
    workflowWebSocketService.connect();
    return () => {
      // 保持连接或按需断开
    };
  }, []);

  // --- 执行控制逻辑 ---
  const runFlow = async () => {
    if (nodes.length === 0 || isRunning || !selectedWorkstation) {
      setIsNotificationPanelOpen(true);
      return;
    }
    try {
      const workflowId = currentWorkflow?.id || null;
      await startExecution(workflowId, nodes);

      const newWorkflowId = useExecutionStore.getState().workflowId;

      if (newWorkflowId && !currentWorkflow?.id) {
        // 构造简化的 Workflow 对象（遵循前端类型规范）
        const newWorkflow: Workflow = {
          id: newWorkflowId,
          name: '新建工作流',
          nodes: nodes,
          // 可选字段：从用户上下文获取（如果存在）
          ...(currentUser && { ownerName: currentUser }),
          ...(filePathConfig.project_name && { project_name: filePathConfig.project_name }),
        };

        setCurrentWorkflow(newWorkflow);
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
      // 🔥 SSOT: 不再主动清空，完全依赖后端 WebSocket 广播 nodesReset 事件
      // clearMeasurementCache() 和 resetExecutionState() 现在由 executionStore 的事件监听统一处理

      const response = await fetch('/api/executions/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const result = await response.json();
        console.log('[App] 重置请求成功，等待 WebSocket nodesReset 事件:', result.message);
        // ✅ 不再在此处主动调用 resetExecutionState()，依赖 WebSocket 事件
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
  }, [nodes, isRunning, selectedWorkstation, currentWorkflow, startExecution, setCurrentWorkflow, currentUser, filePathConfig]);

  const handleStopFlow = useCallback(stopFlow, [isRunning, stopExecution]);

  // 缩放限制常量
  const MIN_ZOOM = 0.6;
  const MAX_ZOOM = 1.2;
  const ZOOM_STEP = 0.1;

  const handleZoomIn = useCallback(() => {
    setZoomLevel((prev) => {
      const next = prev + ZOOM_STEP;
      return next > MAX_ZOOM ? MAX_ZOOM : parseFloat(next.toFixed(2));
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((prev) => {
      const next = prev - ZOOM_STEP;
      return next < MIN_ZOOM ? MIN_ZOOM : parseFloat(next.toFixed(2));
    });
  }, []);

  const handleResetZoom = useCallback(() => setZoomLevel(1), []);

  const handleLoopDetected = useCallback((loops: SimpleLoopInfo[]) => {
    setDetectedLoops(loops);
  }, []);

  return (
    <div className="app-root">
      <ParticleBackground />
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
          furnaceConnected={furnaceState.connection_status === 'connected' && !!furnaceState.device_status}
          mfcConnected={mfcState.connection_status === 'connected' && mfcState.devices.length > 0}
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
          onGenerateReport={() => setShowReportModal(true)}
          canGenerateReport={!!lastExecution}
        />
      </div>

      <div className="right-area">
        <PropertyPanel selectedWorkstation={selectedWorkstation} mfcState={mfcState} />
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
              mfcState={mfcState}
              mfcControls={mfcControls}
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
        systemState={systemState}
        onProgressBarClick={() => setShowChartModal(true)}
      />

      {/* 图表 Modal */}
      <ChartModal
        isOpen={showChartModal}
        onClose={() => setShowChartModal(false)}
        systemState={systemState}
        nodes={nodes}
      />

      {/* 实验报告 Modal */}
      <ReportGeneratorModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        workflow={currentWorkflow}
        execution={lastExecution}
        user={currentUser || 'Unknown'}
        nodeStatuses={lastNodeStatuses}
      />
    </div>
  );
};

// 根组件：提供 UserProvider 包装
const ZahnerFlowApp: React.FC = () => {
  return (
    <UserProvider>
      <AppContent />
    </UserProvider>
  );
};

export default ZahnerFlowApp;