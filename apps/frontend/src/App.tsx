import React, { useState, useEffect, useCallback, useLayoutEffect, useMemo, useRef, lazy, Suspense } from 'react';
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
import { runtimeSocket } from './runtimeClient';
import { ModalLayer } from './components/shared/OverlayLayer';

import { useCanvasStore } from './state/canvasStore';
import { useAppStore } from './state/appStore';
import { useWorkflowStore } from './state/currentWorkflowStore';
import { useExecutionSnapshot, useExecutionStore } from './state/executionStateBridge';
import { describeExecution } from './state/executionStateModel';

import { MFCModal } from './components/mfc/MFCModal';
import { useMfc } from './modules/mfc/useMfc';
import { useFurnace } from './modules/furnace/useFurnace';
import { isFurnaceReady, isMfcReady } from './modules/common/runtimeDeviceSelectors';
import { DeviceModal } from './components/furnace/FurnaceDeviceModal';
const TutorialModal = lazy(() => import('./components/tutorial/TutorialModal'));
const TutorialPlayer = lazy(() => import('./components/tutorial/TutorialPlayer'));
import { registerWorkspaceParticipant } from './tutorialEnvironment';
import { createTutorialSession, type TutorialSession } from './components/tutorial/tutorialSession';
const ReportGeneratorModal = lazy(() => import('./components/report/ReportGeneratorModal'));
import { SimulatorControlPanel } from './components/simulator/SimulatorControlPanel';
import { UserProvider } from './components/shared/UserContext';
import { useWorkflowExecution } from './hooks/useWorkflowExecution';
import { useDesktopWindow } from './hooks/useDesktopWindow';
import { useSimulatorSettings } from './modules/simulator/useSimulatorSettings';
import type { SimpleLoopInfo } from './components/canvas/useLoopDetection';
import type { RunFlowOptions } from './types/executionControl';
import {
  hasActiveSimulator,
  simulatorHostForZahner,
  simulatorProfileFor,
} from './modules/simulator/simulatorSettings';

const EMPTY_NODE_GROUPS: Record<NodeCategory, string[]> = {
  device: [],
  basic_measurement: [],
  advanced_measurement: [],
  flow_control: [],
};

// 内部应用内容组件（在 UserProvider 内部，可以使用 useUser）
const AppContent: React.FC = () => {
  // Canvas Store
  const nodes = useCanvasStore(state => state.nodes);

  const executionCommand = useExecutionStore(state => state.command);

  // 本地 UI 状态
  const [furnaceState, furnaceControls] = useFurnace();
  const [mfcState, mfcControls] = useMfc();
  const [selectedWorkstation, setSelectedWorkstation] = useState<WorkstationType | null>(null);
  const workstationNodeGroups = useMemo(() => selectedWorkstation ? getNodeGroupsByWorkstation(selectedWorkstation) : EMPTY_NODE_GROUPS, [selectedWorkstation]);

  const setNotificationPanelOpen = useAppStore(state => state.setNotificationPanelOpen);
  const [fixedDevice, setFixedDevice] = useState<'furnace' | 'mfc' | null>(null);
  const [renderedDevice, setRenderedDevice] = useState<'furnace' | 'mfc' | null>(null);
  const [detectedLoops, setDetectedLoops] = useState<SimpleLoopInfo[]>([]);
  const [showMeasurementDashboard, setShowMeasurementDashboard] = useState(false);
  const [showSimulatorPanel, setShowSimulatorPanel] = useState(false);
  const [showUnrollView, setShowUnrollView] = useState(false);
  const simulatorSettings = useSimulatorSettings();
  const [suppressedEtaNodeFingerprint, setSuppressedEtaNodeFingerprint] = useState<string | null>(null);
  const { desktopBridgeAvailable, desktopWindowExpanded } = useDesktopWindow();

  // 报告相关状态
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialLesson, setTutorialLesson] = useState<string | null>(null);
  const [tutorialSession, setTutorialSession] = useState<TutorialSession | null>(null);
  const [tutorialPreparing, setTutorialPreparing] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportRequested, setReportRequested] = useState(false);

  useEffect(() => {
    if (fixedDevice) {
      setRenderedDevice(fixedDevice);
    }
  }, [fixedDevice]);

  const systemState = useExecutionSnapshot();
  const execution = useMemo(
    () => describeExecution(systemState, executionCommand),
    [executionCommand, systemState],
  );
  const executionActive = execution.is.active || execution.command.pending === 'start';
  useEffect(() => { if (executionActive && !tutorialSession) setShowTutorial(false); }, [executionActive, tutorialSession]);
  const furnaceReady = isFurnaceReady(furnaceState);
  const mfcReady = isMfcReady(mfcState);
  const simulatorActive = hasActiveSimulator(simulatorSettings);
  const backgroundSuspended = showUnrollView || !!fixedDevice || showSimulatorPanel || showMeasurementDashboard || showReportModal || showTutorial || !!tutorialLesson;

  const applyWorkstation = useCallback((workstationType: WorkstationType | null) => {
    setSelectedWorkstation(workstationType);
  }, []);

  const hasError = Boolean(execution.result.error);
  const nodeFingerprint = useMemo(
    () => JSON.stringify(nodes.map((node) => ({ id: node.id, type: node.type, config: node.config }))),
    [nodes]
  );
  const suppressPlannedEstimate = suppressedEtaNodeFingerprint === nodeFingerprint;
  const zahnerAutoStartupConfig = useMemo(() => {
    const simulatorProfile = simulatorProfileFor('zahner', simulatorSettings);
    return simulatorActive
      ? {
        host: simulatorHostForZahner(undefined, simulatorSettings),
        ...(simulatorProfile && { simulatorProfile }),
      }
      : { host: 'localhost' };
  }, [simulatorActive, simulatorSettings]);
  const { runFlow, resetRun, runMetadataWarning, workflowBlockRunBlocked } = useWorkflowExecution({ nodes, nodeFingerprint, executionActive, selectedWorkstation, zahnerAutoStartupConfig });

  useEffect(() => {
    if (suppressedEtaNodeFingerprint && suppressedEtaNodeFingerprint !== nodeFingerprint) {
      setSuppressedEtaNodeFingerprint(null);
    }
  }, [nodeFingerprint, suppressedEtaNodeFingerprint]);

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

  const hydratedExecutionId = useRef<string | null>(null);
  useEffect(() => {
    if (!systemState?.executionId || systemState.status === 'idle') { hydratedExecutionId.current = null; return; }
    if (hydratedExecutionId.current === systemState.executionId) return;
    const snapshotNodes = systemState.nodes || [];
    if (snapshotNodes.length === 0) return;

    hydratedExecutionId.current = systemState.executionId;
    const currentNodes = useCanvasStore.getState().nodes;
    const currentFingerprint = JSON.stringify(currentNodes.map((node: WorkflowNode) => ({ id: node.id, type: node.type, config: node.config })));
    const snapshotFingerprint = JSON.stringify(snapshotNodes.map((node: WorkflowNode) => ({ id: node.id, type: node.type, config: node.config })));
    if (currentFingerprint !== snapshotFingerprint) {
      useCanvasStore.getState().hydrateExecutionNodes(snapshotNodes);
    }

    const workstationType = (systemState.workstationType || 'zahner-zennium') as WorkstationType;
    if (selectedWorkstation !== workstationType) {
      applyWorkstation(workstationType);
    }

    if (systemState.workflowName) {
      useWorkflowStore.getState().setDraftWorkflowName(systemState.workflowName);
    }
  }, [systemState, selectedWorkstation, applyWorkstation]);

  useLayoutEffect(() => registerWorkspaceParticipant(lessonId => {
    const previous = { selectedWorkstation, suppressedEtaNodeFingerprint, hydrated: hydratedExecutionId.current };
    setSelectedWorkstation(lessonId === 'prepare' ? null : 'zahner-zennium');
    setSuppressedEtaNodeFingerprint(null);
    hydratedExecutionId.current = null;
    return () => {
      setSelectedWorkstation(previous.selectedWorkstation);
      setSuppressedEtaNodeFingerprint(previous.suppressedEtaNodeFingerprint);
      hydratedExecutionId.current = previous.hydrated;
      setShowMeasurementDashboard(false);
      setShowReportModal(false);
      setFixedDevice(null);
      setShowSimulatorPanel(false);
    };
  }), [selectedWorkstation, suppressedEtaNodeFingerprint]);

  const startTutorial = async (id: string) => {
    setTutorialPreparing(true);
    try {
      const session = await createTutorialSession(id);
      setShowTutorial(false);
      setTutorialSession(session);
      setTutorialLesson(id);
    } catch (error) {
      useAppStore.getState().addNotification({ type: 'error', title: '无法开始教学', message: error instanceof Error ? error.message : String(error) });
    } finally { setTutorialPreparing(false); }
  };

  // 玻璃态效果
  useEffect(() => {
    const observer = setupAutoGlassEffect();
    return () => observer?.disconnect();
  }, []);

  useLayoutEffect(() => installScrollRenderingSafety(), []);

  // --- WebSocket 初始化 ---
  useEffect(() => {
    runtimeSocket.connectSocket();
    return () => {
      // 保持连接或按需断开
    };
  }, []);

  const resetFlow = async () => {
    if (await resetRun()) setSuppressedEtaNodeFingerprint(nodeFingerprint);
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
        onTutorialOpen={() => setShowTutorial(true)}
        tutorialDisabled={executionActive || tutorialPreparing || !!tutorialSession}
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

      {showTutorial && <Suspense fallback={null}><TutorialModal preparing={tutorialPreparing} onClose={() => setShowTutorial(false)} onPlay={id => { void startTutorial(id); }} /></Suspense>}
      {tutorialLesson && tutorialSession && <Suspense fallback={null}><TutorialPlayer key={tutorialLesson} lessonId={tutorialLesson} session={tutorialSession} onClose={interrupted => { setTutorialLesson(null); setTutorialSession(null); setShowTutorial(!interrupted); }} onReplay={() => { const id = tutorialLesson; setTutorialLesson(null); setTutorialSession(null); void startTutorial(id); }} /></Suspense>}
      <div className="leftbar-area">
        <LeftPanel
          nodeGroups={workstationNodeGroups}
          selectedWorkstation={selectedWorkstation}
          furnaceConnected={furnaceReady}
          mfcConnected={mfcReady}
        />
      </div>

      <div className="canvas-area">
        <Canvas
          selectedWorkstation={selectedWorkstation}
          executionActive={executionActive}
          hasError={hasError}
          onRunFlow={handleRunFlow}
          onResetFlow={resetFlow}
          workflowBlockRunBlocked={workflowBlockRunBlocked}
          onLoopDetected={handleLoopDetected}
          onGenerateReport={() => { setReportRequested(true); setShowReportModal(true); }}
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
              onClose={close}
              mfcState={mfcState}
              mfcControls={mfcControls}
              simulatorSettings={simulatorSettings}
            />
          ) : (
            <DeviceModal
              onClose={close}
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
      {reportRequested && <Suspense fallback={showReportModal ? <ModalLayer onClose={() => setShowReportModal(false)} centered><div className="glass-panel" role="status">正在加载实验记录…</div></ModalLayer> : null}>
        <ReportGeneratorModal isOpen={showReportModal} onClose={() => setShowReportModal(false)} />
      </Suspense>}
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
