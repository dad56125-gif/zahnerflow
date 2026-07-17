import React, { useState, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import type { NodeCategory, WorkstationType, WorkflowNode } from '@zahnerflow/types';
import { getNodeGroupsByWorkstation } from './utils/nodeUtilities';

import { TopBar } from './components/TopBar';
import type { Workstation } from './components/TopBar';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/property/RightPanel';
import { BottomBar } from './components/BottomBar';
import { MeasurementDashboard } from './components/measurement-dashboard/MeasurementDashboard';
import { Canvas } from './components/canvas/Canvas';
import { setupAutoGlassEffect } from './utils/glassEffect';
import { installScrollRenderingSafety } from './utils/scrollRenderingSafety';
import ParticleBackground from './components/ParticleBackground';
import { WindowControls } from './components/WindowControls';
import { hasDesktopBridge } from './desktopBridge';
import { runtimeClient, runtimeSocket, type RuntimeError } from './runtimeClient';
import { ModalLayer } from './components/shared/OverlayLayer';

import { useCanvasStore } from './state/canvasStore';
import { useAppStore } from './state/appStore';
import { useWorkflowStore } from './state/currentWorkflowStore';
import { deriveExecutionUiState, useExecutionStore, useSystemState } from './state/executionStateBridge';
// clearMeasurementCache 现在由 executionStore 的 nodesReset 监听统一处理

import { MFCModal } from './components/mfc/MFCModal';
import { useMfc } from './modules/mfc/useMfc';
import { useFurnace } from './modules/furnace/useFurnace';
import { isFurnaceReady, isMfcReady } from './modules/common/runtimeDeviceSelectors';
import { DeviceModal } from './components/furnace/FurnaceDeviceModal';
import { ReportGeneratorModal } from './components/report/ReportGeneratorModal';
import { SimulatorControlPanel } from './components/simulator/SimulatorControlPanel';
import { UserProvider } from './components/shared/UserContext';
import { useUser } from './components/shared/userContextState';
import type { SimpleLoopInfo } from './components/canvas/useLoopDetection';
import type { RunFlowOptions, RunFlowOutcome } from './types/executionControl';
import {
  SIMULATOR_SETTINGS_EVENT,
  SimulatorSettings,
  hasActiveSimulator,
  loadSimulatorSettings,
  simulatorHostForZahner,
  simulatorProfileFor,
} from './modules/simulator/simulatorSettings';

const RUN_METADATA_CONFIRM_MS = 5000;
const EMPTY_NODE_GROUPS: Record<NodeCategory, string[]> = {
  device: [],
  basic_measurement: [],
  advanced_measurement: [],
  flow_control: [],
};

type MissingRunMetadataDetails = {
  code?: string;
  missingFields?: string[];
  message?: string;
};

type RunMetadataWarning = {
  message: string;
  expiresAt: number;
};

const RUN_METADATA_FIELD_LABELS: Record<string, string> = {
  ownerName: '用户',
  projectName: '项目名称',
  individualName: '样品名称',
};

function isMissingRunMetadataError(error: unknown): error is RuntimeError & { details: MissingRunMetadataDetails } {
  const details = error && typeof error === 'object' && 'details' in error
    ? (error as RuntimeError).details
    : undefined;
  return Boolean(details && typeof details === 'object' && (details as MissingRunMetadataDetails).code === 'MISSING_RUN_METADATA');
}

function runMetadataWarningMessage(details: MissingRunMetadataDetails): string {
  const fields = Array.isArray(details.missingFields) ? details.missingFields : [];
  const missingText = fields
    .map((field) => RUN_METADATA_FIELD_LABELS[field])
    .filter(Boolean)
    .join('、');
  return missingText
    ? `缺少${missingText}，请填写后再运行。`
    : details.message || '运行信息不完整，请填写后再运行。';
}

// 内部应用内容组件（在 UserProvider 内部，可以使用 useUser）
const AppContent: React.FC = () => {
  // 用户上下文
  const { currentUser, filePathConfig } = useUser();

  // Canvas Store
  const { nodes } = useCanvasStore();

  // Workflow Store
  // Execution Store
  const {
    isRunning,
    error: executionError,
    startExecution
    // resetExecutionState 现在由 executionStore 的 nodesReset 监听统一处理
  } = useExecutionStore();

  // 本地 UI 状态
  const [furnaceState, furnaceControls] = useFurnace();
  const [mfcState, mfcControls] = useMfc();
  const [activePanel, setActivePanel] = useState<'nodes'>('nodes');
  const [selectedWorkstation, setSelectedWorkstation] = useState<WorkstationType | null>(null);
  const [workstationNodeGroups, setWorkstationNodeGroups] = useState(EMPTY_NODE_GROUPS);

  const setNotificationPanelOpen = useAppStore(state => state.setNotificationPanelOpen);
  const [fixedDevice, setFixedDevice] = useState<'furnace' | 'mfc' | null>(null);
  const [renderedDevice, setRenderedDevice] = useState<'furnace' | 'mfc' | null>(null);
  const [detectedLoops, setDetectedLoops] = useState<SimpleLoopInfo[]>([]);
  const [showMeasurementDashboard, setShowMeasurementDashboard] = useState(false);
  const [showSimulatorPanel, setShowSimulatorPanel] = useState(false);
  const [showUnrollView, setShowUnrollView] = useState(false);
  const [simulatorSettings, setSimulatorSettings] = useState<SimulatorSettings>(() => loadSimulatorSettings());
  const [suppressedEtaNodeFingerprint, setSuppressedEtaNodeFingerprint] = useState<string | null>(null);
  const [blockedWorkflowBlockIds, setBlockedWorkflowBlockIds] = useState<string[]>([]);
  const [runMetadataWarning, setRunMetadataWarning] = useState<RunMetadataWarning | null>(null);
  const [desktopWindowExpanded, setDesktopWindowExpanded] = useState(() =>
    hasDesktopBridge() ? window.zahnerflowDesktop!.isMaximized() : false
  );
  const desktopBridgeAvailable = hasDesktopBridge();

  // 报告相关状态
  const [showReportModal, setShowReportModal] = useState(false);

  useEffect(() => {
    if (fixedDevice) {
      setRenderedDevice(fixedDevice);
    }
  }, [fixedDevice]);

  useEffect(() => {
    if (!hasDesktopBridge()) return;
    setDesktopWindowExpanded(window.zahnerflowDesktop!.isMaximized());
    return window.zahnerflowDesktop!.onMaximizedChanged(setDesktopWindowExpanded);
  }, []);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('zf-desktop-window', desktopBridgeAvailable);
    document.documentElement.classList.toggle('zf-desktop-window--expanded', desktopBridgeAvailable && desktopWindowExpanded);

    return () => {
      document.documentElement.classList.remove('zf-desktop-window', 'zf-desktop-window--expanded');
    };
  }, [desktopBridgeAvailable, desktopWindowExpanded]);

  // 获取实时系统状态
  const systemState = useSystemState();
  const executionUi = deriveExecutionUiState(
    systemState,
    { isRunning, error: executionError },
  );
  const isCancelling = executionUi.isCancelling;
  const furnaceReady = isFurnaceReady(furnaceState);
  const mfcReady = isMfcReady(mfcState);
  const simulatorActive = hasActiveSimulator(simulatorSettings);
  const backgroundSuspended = showUnrollView || !!fixedDevice || showSimulatorPanel || showMeasurementDashboard || showReportModal;

  const applyWorkstation = useCallback((workstationType: WorkstationType | null) => {
    setSelectedWorkstation(workstationType);
    setWorkstationNodeGroups(workstationType ? getNodeGroupsByWorkstation(workstationType) : EMPTY_NODE_GROUPS);
  }, []);

  // 派生状态：是否出错
  const hasError = !!executionError;
  const nodeFingerprint = useMemo(
    () => JSON.stringify(nodes.map((node) => ({ id: node.id, type: node.type, config: node.config }))),
    [nodes]
  );
  const suppressPlannedEstimate = suppressedEtaNodeFingerprint === nodeFingerprint;
  const workflowBlockRunBlocked = blockedWorkflowBlockIds.length > 0 || nodes.some((node) =>
    node.type === 'workflow_block' && !String(node.config?.workflowId || '').trim()
  );
  const zahnerAutoStartupConfig = useMemo(() => {
    const simulatorProfile = simulatorProfileFor('zahner', simulatorSettings);
    return simulatorActive
      ? {
        host: simulatorHostForZahner(undefined, simulatorSettings),
        ...(simulatorProfile && { simulatorProfile }),
      }
      : { host: 'localhost' };
  }, [simulatorActive, simulatorSettings]);

  useEffect(() => {
    if (suppressedEtaNodeFingerprint && suppressedEtaNodeFingerprint !== nodeFingerprint) {
      setSuppressedEtaNodeFingerprint(null);
    }
  }, [nodeFingerprint, suppressedEtaNodeFingerprint]);

  useEffect(() => {
    if (!runMetadataWarning) return;
    const timeout = window.setTimeout(() => {
      setRunMetadataWarning(null);
    }, Math.max(0, runMetadataWarning.expiresAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [runMetadataWarning]);

  useEffect(() => {
    setRunMetadataWarning(null);
  }, [nodeFingerprint, currentUser, filePathConfig.projectName, filePathConfig.individualName]);

  useEffect(() => {
    const workflowIds = Array.from(new Set(
      nodes
        .filter((node) => node.type === 'workflow_block')
        .map((node) => String(node.config?.workflowId || '').trim())
        .filter(Boolean)
    ));

    if (workflowIds.length === 0) {
      setBlockedWorkflowBlockIds([]);
      return;
    }

    let cancelled = false;
    Promise.all(
      workflowIds.map((workflowId) =>
        runtimeClient.workflows
          .definition<{ id: string; nodes?: WorkflowNode[] }>(workflowId)
          .then((definition) => ({
            workflowId,
            blocked: (definition.nodes || []).some((child) => child.type === 'workflow_block'),
          }))
          .catch(() => ({ workflowId, blocked: true }))
      )
    ).then((results) => {
      if (!cancelled) {
        setBlockedWorkflowBlockIds(results.filter((result) => result.blocked).map((result) => result.workflowId));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [nodeFingerprint, nodes]);

  // 监听执行错误，自动打开通知面板
  useEffect(() => {
    if (hasError) {
      setNotificationPanelOpen(true);
    }
  }, [hasError, setNotificationPanelOpen]);

  const handleWorkstationSelect = (workstation: Workstation) => {
    const workstationType = workstation.id as WorkstationType;
    applyWorkstation(workstationType);
    useCanvasStore.getState().clearCanvas();
    useWorkflowStore.getState().setDraftWorkflowName(null);  // 清空草稿名称
  };

  useEffect(() => {
    if (!systemState || !executionUi.isActive) return;
    const snapshotNodes = systemState.nodes || [];
    if (snapshotNodes.length === 0) return;

    const currentNodes = useCanvasStore.getState().nodes;
    const currentFingerprint = JSON.stringify(currentNodes.map((node: WorkflowNode) => ({ id: node.id, type: node.type, config: node.config })));
    const snapshotFingerprint = JSON.stringify(snapshotNodes.map((node: WorkflowNode) => ({ id: node.id, type: node.type, config: node.config })));
    if (currentFingerprint !== snapshotFingerprint) {
      useCanvasStore.getState().setNodes(snapshotNodes);
    }

    const workstationType = (systemState.workstationType || 'zahner-zennium') as WorkstationType;
    if (selectedWorkstation !== workstationType) {
      applyWorkstation(workstationType);
    }

    if (systemState.workflowName) {
      useWorkflowStore.getState().setDraftWorkflowName(systemState.workflowName);
    }
  }, [systemState, executionUi.isActive, selectedWorkstation, applyWorkstation]);

  // 玻璃态效果
  useEffect(() => {
    const observer = setupAutoGlassEffect();
    return () => observer?.disconnect();
  }, []);

  useLayoutEffect(() => installScrollRenderingSafety(), []);

  useEffect(() => {
    const handleSettings = (event: Event) => {
      const customEvent = event as CustomEvent<SimulatorSettings>;
      setSimulatorSettings(customEvent.detail || loadSimulatorSettings());
    };
    window.addEventListener(SIMULATOR_SETTINGS_EVENT, handleSettings);
    window.addEventListener('storage', handleSettings);
    return () => {
      window.removeEventListener(SIMULATOR_SETTINGS_EVENT, handleSettings);
      window.removeEventListener('storage', handleSettings);
    };
  }, []);

  // --- WebSocket 初始化 ---
  useEffect(() => {
    runtimeSocket.connectSocket();
    return () => {
      // 保持连接或按需断开
    };
  }, []);

  // --- 执行控制逻辑 ---
  const runFlow = useCallback(async (options: RunFlowOptions = {}): Promise<RunFlowOutcome> => {
    if (nodes.length === 0 || isRunning || !selectedWorkstation || workflowBlockRunBlocked) {
      setNotificationPanelOpen(true);
      return 'blocked';
    }
    try {
      const workflowStore = useWorkflowStore.getState();

      // 后端按节点 fingerprint 归档，前端只传当前名称建议。
      const draftName = workflowStore.draftWorkflowName;
      const workflowName = draftName?.trim() || `工作流_${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}`;

      if (!draftName) {
        workflowStore.setDraftWorkflowName(workflowName);
      }

      const forceStartWithMissingRunMetadata = !!runMetadataWarning && Date.now() < runMetadataWarning.expiresAt;

      await startExecution({
        nodes,
        ownerName: currentUser || undefined,
        workflowName,
        workstationType: selectedWorkstation,
        autoStartupConfig: zahnerAutoStartupConfig,
        pathConfig: filePathConfig,
        startFromUnrolledIndex: options.startFromUnrolledIndex ?? 0,
        forceStartWithMissingRunMetadata,
      });
      setRunMetadataWarning(null);
      return 'started';
    } catch (error) {
      if (isMissingRunMetadataError(error)) {
        setRunMetadataWarning({
          message: runMetadataWarningMessage(error.details),
          expiresAt: Date.now() + RUN_METADATA_CONFIRM_MS,
        });
        return 'confirmation-required';
      }
      console.error('工作流执行失败:', error);
      setNotificationPanelOpen(true);
      return 'failed';
    }
  }, [
    currentUser,
    filePathConfig,
    isRunning,
    nodes,
    runMetadataWarning,
    selectedWorkstation,
    setNotificationPanelOpen,
    startExecution,
    workflowBlockRunBlocked,
    zahnerAutoStartupConfig,
  ]);

  const resetFlow = async () => {
    try {
      setRunMetadataWarning(null);
      // 🔥 SSOT: 不再主动清空，完全依赖后端 WebSocket 广播 nodesReset 事件
      // clearMeasurementCache() 和 resetExecutionState() 现在由 executionStore 的事件监听统一处理

      const result = await runtimeClient.executions.reset();
      if (result?.success) {
        setSuppressedEtaNodeFingerprint(nodeFingerprint);
        // ✅ 不再在此处主动调用 resetExecutionState()，依赖 WebSocket 事件
      } else {
        console.error('[App] 重置失败:', result?.message || '未知错误');
      }
    } catch (error) {
      console.error('Reset flow failed:', error);
    }
  };

  // 包装回调
  const handleRunFlow = useCallback(async (options: RunFlowOptions = {}) => {
    setSuppressedEtaNodeFingerprint(null);
    return runFlow(options);
  }, [runFlow]);

  const handleLoopDetected = useCallback((loops: SimpleLoopInfo[]) => {
    setDetectedLoops(loops);
  }, []);

  return (
    <div className={`app-root ${desktopBridgeAvailable ? 'app-root--desktop-window' : ''} ${desktopWindowExpanded ? 'app-root--window-controls' : ''}`}>
      <ParticleBackground suspended={backgroundSuspended} />
      <WindowControls expanded={desktopWindowExpanded} />
      <TopBar
        fixedDevice={fixedDevice}
        onDeviceClick={(d) => setFixedDevice(d)}
        onWorkstationSelect={handleWorkstationSelect}
        selectedWorkstationId={selectedWorkstation}
        simulatorActive={simulatorActive}
        furnaceConnected={furnaceReady}
        mfcConnected={mfcReady}
        onSimulatorPanelOpen={() => setShowSimulatorPanel(true)}
        hasRunMetadataWarning={Boolean(runMetadataWarning)}
      />

      <div className="leftbar-area">
        <LeftPanel
          activePanel={activePanel}
          onPanelChange={setActivePanel}
          nodeGroups={workstationNodeGroups}
          selectedWorkstation={selectedWorkstation}
          furnaceConnected={furnaceReady}
          mfcConnected={mfcReady}
        />
      </div>

      <div className="canvas-area">
        <Canvas
          selectedWorkstation={selectedWorkstation}
          isRunning={isRunning}
          isCancelling={isCancelling}
          hasError={hasError}
          onRunFlow={handleRunFlow}
          onResetFlow={resetFlow}
          workflowBlockRunBlocked={workflowBlockRunBlocked}
          onLoopDetected={handleLoopDetected}
          onGenerateReport={() => setShowReportModal(true)}
          onUnrollViewOpenChange={setShowUnrollView}
          autoStartupConfig={zahnerAutoStartupConfig}
          runMetadataWarning={runMetadataWarning?.message || null}
        />
      </div>

      <div className="right-area">
        <RightPanel mfcState={mfcState} />
      </div>

      <ModalLayer
        open={!!fixedDevice}
        onOpenChange={(open) => {
          if (!open) setFixedDevice(null);
        }}
        id="device-modal-overlay"
      >
        {({ close }) => (
          renderedDevice === 'mfc' ? (
            <MFCModal
              on_close={close}
              modal_top={0}
              modal_left={0}
              modal_width={500}
              modal_height={400}
              mfcState={mfcState}
              mfcControls={mfcControls}
              simulatorSettings={simulatorSettings}
            />
          ) : (
            <DeviceModal
              onClose={close}
              modalTop={0}
              modalLeft={0}
              modalWidth={500}
              modalHeight={400}
              furnaceState={furnaceState}
              furnaceControls={furnaceControls}
              simulatorSettings={simulatorSettings}
            />
          )
        )}
      </ModalLayer>

      <ModalLayer
        open={showSimulatorPanel}
        onOpenChange={setShowSimulatorPanel}
        id="simulator-control-overlay"
        centered
        blur
      >
        {({ close }) => (
          <SimulatorControlPanel onClose={close} />
        )}
      </ModalLayer>

      <BottomBar
        isRunning={isRunning}
        detectedLoops={detectedLoops}
        systemState={systemState}
        onProgressBarClick={() => setShowMeasurementDashboard(true)}
        suppressPlannedEstimate={suppressPlannedEstimate}
      />

      {/* 图表 Modal */}
      <MeasurementDashboard
        isOpen={showMeasurementDashboard}
        onClose={() => setShowMeasurementDashboard(false)}
        systemState={systemState}
        nodes={nodes}
      />

      {/* 实验记录 Modal */}
      <ReportGeneratorModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
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
