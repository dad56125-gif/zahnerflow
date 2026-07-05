/**
 * MFC专用Modal组件
 *
 * 从DeviceModal中分离出来的MFC设备管理界面
 * 支持WebSocket实时通信和多设备管理
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { MfcState, MfcControls } from '../../modules/mfc/useMfc';
import { MFCDeviceCard } from './MFCDeviceCard';
import { FurnaceLogPanel } from '../furnace/FurnaceLogPanel';
import { DeviceConnectionPanel } from '../../components/common/DeviceConnectionPanel';
import { DeviceDiagnosticsPanel } from '../../components/common/DeviceDiagnosticsPanel';
import {
  DeviceLinearGauge,
} from '../device-dashboard/DeviceDashboard';
import { runtimeSocket } from '../../runtimeClient';
import {
  SimulatorSettings,
  isSimulatorDeviceEnabled,
  simulatorPortFor,
  simulatorProfileFor,
} from '../../modules/simulator/simulatorSettings';
import { readDeveloperMode, DEVELOPER_MODE_EVENT } from '../../modules/simulator/developerMode';
import { SpacedCjkText } from '../common/SpacedCjkText';

interface MFCModalProps {
  on_close: () => void;
  modal_top: number;
  modal_left: number;
  modal_width: number;
  modal_height: number;
  mfcState: MfcState;
  mfcControls: MfcControls;
  simulatorSettings: SimulatorSettings;
}

export const MFCModal: React.FC<MFCModalProps> = ({
  on_close,
  modal_top,
  modal_left,
  modal_width,
  modal_height,
  mfcState,
  mfcControls,
  simulatorSettings
}) => {
  const [now, setNow] = useState(() => Date.now());
  const [developerMode, setDeveloperMode] = useState(() => readDeveloperMode());

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<boolean>;
      setDeveloperMode(typeof ce.detail === 'boolean' ? ce.detail : readDeveloperMode());
    };
    window.addEventListener(DEVELOPER_MODE_EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(DEVELOPER_MODE_EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  // 在MFC模态框打开时才确保WebSocket连接（仅执行一次）
  useEffect(() => {
    mfcControls.ensureConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 保持对 props 的读取以避免 TS 未使用报错
  void modal_top; void modal_left; void modal_width; void modal_height;
  const isMfcSimulator = isSimulatorDeviceEnabled('mfc', simulatorSettings);
  const effectiveSelectedPort = isMfcSimulator ? 'COM_SIMULATOR' : mfcState.selected_port;
  const effectivePorts = developerMode
    ? Array.from(new Set(['COM_SIMULATOR', ...mfcState.available_ports]))
    : mfcState.available_ports;
  const connectMfc = () => {
    const port = simulatorPortFor('mfc', mfcState.selected_port, simulatorSettings);
    mfcControls.connect(port, 19200, 1.0, simulatorProfileFor('mfc', simulatorSettings));
  };
  const flowSummary = useMemo(() => {
    const totalFlow = mfcState.devices.reduce((sum, item) => sum + (Number(item.flowSccm) || 0), 0);
    const totalSetFlow = mfcState.devices.reduce((sum, item) => sum + (Number(item.setFlow) || 0), 0);
    const totalCapacity = mfcState.devices.reduce((sum, item) => sum + (Number(item.maxFlowSccm) || 0), 0);
    const activeDevices = mfcState.devices.filter((item) => Number(item.setFlow) > 0).length;
    const capacityPercent = totalCapacity > 0 ? (totalFlow / totalCapacity) * 100 : 0;
    const setpointPercent = totalCapacity > 0 ? (totalSetFlow / totalCapacity) * 100 : 0;
    return { totalFlow, totalSetFlow, totalCapacity, activeDevices, capacityPercent, setpointPercent };
  }, [mfcState.devices]);
  const formatFlow = (value: number) => value.toFixed(1);
  const connectionLabel = mfcState.connection_status === 'connected'
    ? '设备已连接'
    : mfcState.connection_status === 'connecting'
      ? '连接中'
      : mfcState.connection_status === 'error'
        ? '连接错误'
        : '未连接';
  const isConnected = mfcState.connection_status === 'connected';

  useEffect(() => {
    if (!isConnected) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isConnected]);

  const connectedAt = useMemo(() => {
    if (!mfcState.connection_started_at) return null;
    const parsed = new Date(mfcState.connection_started_at);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }, [mfcState.connection_started_at]);
  const connectedSeconds = connectedAt ? Math.max(0, Math.floor((now - connectedAt.getTime()) / 1000)) : 0;
  const formatRuntimeDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    if (minutes > 0) return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`;
    return `${remainingSeconds}s`;
  };
  const activeDevices = mfcState.devices.filter((device) => Number(device.setFlow) > 0);
  const idleDevices = mfcState.devices.filter((device) => Number(device.setFlow) === 0);
  const clampPercent = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const linkLabel = runtimeSocket.connected ? 'ONLINE' : 'OFFLINE';
  const linkTone = runtimeSocket.connected ? 'success' : 'muted';

  return (
      <div
        className="modal__content device-modal-content workspace-device-modal workspace-device-modal--mfc"
      >
        <div className="modal__header">
          <h3 className="device-title" aria-label="质量流量控制器 MFC">
            <SpacedCjkText text="质量流量控制器" className="device-title__name cjk-spaced" />
            <span className="device-title__model" aria-hidden="true">(MFC)</span>
          </h3>
          <div className="connection__status">
            <span className={`connection__status-dot ${runtimeSocket.connected ? 'is-connected' : 'is-disconnected'}`}></span>
            <span className="status__text">
              {runtimeSocket.connected ? <SpacedCjkText text="实时连接" /> : <SpacedCjkText text="离线" />}
            </span>
            <span className={`connection-state-indicator ${mfcState.connection_status}`}>
              ({mfcState.connection_status === 'connected' ? <SpacedCjkText text="设备已连接" /> :
                mfcState.connection_status === 'connecting' ? <SpacedCjkText text="连接中..." /> :
                  mfcState.connection_status === 'error' ? <SpacedCjkText text="连接错误" /> : <SpacedCjkText text="未连接" />})
            </span>
            {isConnected && (
              <>
                {mfcState.isScanning && (
                  <button
                    className="btn btn--sm btn--danger"
                    onClick={() => mfcControls.stopScan()}
                    disabled={mfcState.isScanStopping}
                  >
                    {mfcState.isScanStopping ? <SpacedCjkText text="停止中" /> : <SpacedCjkText text="停止扫描" />}
                  </button>
                )}
                <button
                  className="btn btn--sm btn--danger"
                  onClick={() => mfcControls.disconnect()}
                  disabled={mfcState.isLoading || mfcState.isScanning}
                >
                  <SpacedCjkText text="断开" />
                </button>
              </>
            )}
          </div>
          <button className="btn btn--sm btn--ghost btn--icon btn--rounded modal__close" onClick={on_close}>✕</button>
        </div>

        {mfcState.isScanning && mfcState.scanProgress && (
          <div className="mfc__scan-progress">
            <DeviceLinearGauge
              label={mfcState.isScanStopping ? '正在停止扫描' : '正在扫描地址'}
              value={`${mfcState.scanProgress.percent}% · 地址 ${mfcState.scanProgress.current} · 已发现 ${mfcState.scanProgress.foundCount} 个`}
              percent={mfcState.scanProgress.percent}
              tone={mfcState.isScanStopping ? 'warning' : 'primary'}
            />
          </div>
        )}

        {/* 主要内容区域 */}
        <div className="modal__body">
          <div className={`mfc-modal ${isConnected ? 'is-connected' : 'is-disconnected'}`}>
            <div className="mfc-modal__main">
              {/* 错误显示 */}
              {mfcState.error && (
                <div className="error-banner">
                  <span className="error__message">
                    <SpacedCjkText text="错误" />: {mfcState.error.message}
                  </span>
                  <button
                    className="btn btn--sm btn--secondary"
                    onClick={mfcControls.clearError}
                  >
                    <SpacedCjkText text="关闭" />
                  </button>
                </div>
              )}

              {/* 条件渲染：连接面板或设备管理 */}
              {!isConnected ? (
                <DeviceConnectionPanel
                  deviceName="MFC"
                  connectionStatus={mfcState.connection_status}
                  availablePorts={effectivePorts}
                  selectedPort={effectiveSelectedPort}
                  onPortChange={mfcControls.selectPort}
                  onRefreshPorts={() => mfcControls.get_available_ports()}
                  onConnect={connectMfc}
                  onDisconnect={() => mfcControls.disconnect()}
                />
              ) : (
                <>
                  {/* 设备列表 */}
                  {mfcState.devices.length === 0 && !mfcState.isScanning && !mfcState.error ? (
                    <div className="mfc__empty">
                      <div className="mfc__empty-icon">📡</div>
                      <h4><SpacedCjkText text="未发现MFC设备" /></h4>
                      <p><SpacedCjkText text="正在扫描端口设备..." /></p>
                      <span className="mfc__empty-hint"><SpacedCjkText text="长时间无响应请检查连接" /></span>
                    </div>
                  ) : (
                    <div className="mfc__sections">
                      {activeDevices.length > 0 && (
                        <div className="mfc__section" aria-label="激活设备">
                          <div className="mfc__cards">
                            {activeDevices.map((device) => (
                              <MFCDeviceCard
                                key={device.address}
                                device={device}
                                onSetFlow={mfcControls.setFlowRate}
                                loading={mfcState.isLoading}
                                disabled={mfcState.isScanning}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {idleDevices.length > 0 && (
                        <div className="mfc__section" aria-label="空闲设备">
                          <div className="mfc__cards">
                            {idleDevices.map((device) => (
                              <MFCDeviceCard
                                key={device.address}
                                device={device}
                                onSetFlow={mfcControls.setFlowRate}
                                loading={mfcState.isLoading}
                                disabled={mfcState.isScanning}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {isConnected && (
              <div className="mfc-modal__sidebar">
                <section className="device-dashboard device-dashboard--compact device-dashboard--furnace-strip device-dashboard--mfc-strip">
                  <div className="device-dashboard__furnace-layout device-dashboard__mfc-layout">
                    <div className="device-dashboard__pv-card">
                      <span className="device-dashboard__tile-label"><SpacedCjkText text="实际总流量" /></span>
                      <span className="device-dashboard__pv-value">{formatFlow(flowSummary.totalFlow)}<span>sccm</span></span>
                    </div>
                    <div className="device-dashboard__pill-stack" aria-label="设定和容量">
                      <div className="device-dashboard__pill-meter device-dashboard__pill-meter--sv">
                        <span className="device-dashboard__tile-label"><SpacedCjkText text="设定" /></span>
                        <span className="device-dashboard__pill-value">{formatFlow(flowSummary.totalSetFlow)} sccm</span>
                      </div>
                      <div className="device-dashboard__pill-meter device-dashboard__pill-meter--mv">
                        <span className="device-dashboard__tile-label"><SpacedCjkText text="量程" /></span>
                        <span className="device-dashboard__pill-value">{formatFlow(flowSummary.totalCapacity)} sccm</span>
                      </div>
                    </div>
                    <div className="device-dashboard__segment-card">
                      <span className="device-dashboard__tile-label"><SpacedCjkText text="设备数" /></span>
                      <span className="device-dashboard__segment-value">{mfcState.devices.length}</span>
                    </div>
                    <div className="device-dashboard__total-card">
                      <span className="device-dashboard__tile-label"><SpacedCjkText text="激活通道" /></span>
                      <span className="device-dashboard__total-value">{flowSummary.activeDevices}</span>
                    </div>
                    <div className="device-dashboard__runtime-card">
                      <span className="device-dashboard__tile-label"><SpacedCjkText text="设定占用" /></span>
                      <span className="device-dashboard__runtime-value">{Math.round(flowSummary.setpointPercent)} %</span>
                      <div className="device-dashboard__runtime-track">
                        <progress value={clampPercent(flowSummary.setpointPercent)} max={100} />
                      </div>
                    </div>
                    <div className="device-dashboard__runtime-card">
                      <span className="device-dashboard__tile-label"><SpacedCjkText text="运行时长" /></span>
                      <span className="device-dashboard__runtime-value">{formatRuntimeDuration(connectedSeconds)}</span>
                      <div className="device-dashboard__runtime-track">
                        <span>{connectedAt ? `自 ${connectedAt.toLocaleTimeString()}` : connectionLabel}</span>
                      </div>
                    </div>
                    <div className={`device-dashboard__status-badge device-dashboard__status-badge--${linkTone}`}>
                      <span className="device-dashboard__status-dot" />
                      <span>{linkLabel}</span>
                    </div>
                  </div>
                </section>

                <button
                  className={`btn btn--sm btn--secondary ${mfcState.isScanning ? 'is-loading' : ''}`}
                  onClick={() => mfcControls.scanDevices({ port: effectiveSelectedPort })}
                  disabled={mfcState.isLoading || mfcState.isScanning}
                >
                  {mfcState.isScanning ? <SpacedCjkText text="扫描中" /> : <SpacedCjkText text="重新扫描" />}
                </button>

                {developerMode && (
                  <>
                    <DeviceDiagnosticsPanel
                      diagnostics={mfcState.diagnostics}
                      commandLogs={mfcState.commandLogs}
                      onRefreshLogs={mfcControls.loadCommandLogs}
                      onClearLogs={mfcControls.clearCommandLogs}
                    />

                    <FurnaceLogPanel
                      logs={mfcState.logs}
                      onClear={mfcControls.clearLogs}
                      title="前端操作日志"
                    />
                  </>
                )}
              </div>
            )}

            {/* 加载状态 */}
            {mfcState.isLoading && !mfcState.isScanning && (
              <div className="loading__overlay">
                <div className="loading__content">
                  <div className="loading-spinner" />
                  <p><SpacedCjkText text="正在处理请求..." /></p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
  );
};

export default MFCModal;
