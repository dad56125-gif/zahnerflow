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
  DeviceDashboardPanel,
  DeviceLinearGauge,
  DeviceMetricGrid,
  DeviceMetricTile,
} from '../device-dashboard/DeviceDashboard';
import { runtimeSocket } from '../../runtimeClient';
import {
  SimulatorSettings,
  isSimulatorDeviceEnabled,
  simulatorPortFor,
  simulatorProfileFor,
} from '../../modules/simulator/simulatorSettings';

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
  const [activeTab, setActiveTab] = useState<'devices' | 'dashboard'>('devices');
  const [connectedAt, setConnectedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // 在MFC模态框打开时才确保WebSocket连接（仅执行一次）
  useEffect(() => {
    mfcControls.ensureConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 保持对 props 的读取以避免 TS 未使用报错
  void modal_top; void modal_left; void modal_width; void modal_height;
  const isMfcSimulator = isSimulatorDeviceEnabled('mfc', simulatorSettings);
  const effectiveSelectedPort = isMfcSimulator ? 'COM_SIMULATOR' : mfcState.selected_port;
  const effectivePorts = isMfcSimulator
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
    if (!isConnected && activeTab === 'dashboard') {
      setActiveTab('devices');
    }
  }, [activeTab, isConnected]);

  useEffect(() => {
    if (!isConnected) {
      setConnectedAt(null);
      return;
    }
    setConnectedAt((previous) => previous || new Date());
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isConnected]);

  const connectedSeconds = connectedAt ? Math.max(0, Math.floor((now - connectedAt.getTime()) / 1000)) : 0;
  const formatRuntimeDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    if (minutes > 0) return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`;
    return `${remainingSeconds}s`;
  };

  return (
      <div
        className="modal__content device-modal-content workspace-device-modal"
      >
        <div className="modal__header">
          <h3>质量流量控制器 (MFC)</h3>
          <div className="tabs">
            <div className="tabs__list">
              <button
                className={`btn btn--secondary btn--sm tabs__trigger ${activeTab === 'devices' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('devices')}
              >
                设备管理
              </button>
              {isConnected && (
                <button
                  className={`btn btn--secondary btn--sm tabs__trigger ${activeTab === 'dashboard' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('dashboard')}
                >
                  仪表盘
                </button>
              )}
            </div>
          </div>
          <div className="connection__status">
            <span className={`connection__status-dot ${runtimeSocket.connected ? 'is-connected' : 'is-disconnected'}`}></span>
            <span className="status__text">
              {runtimeSocket.connected ? '实时连接' : '离线'}
            </span>
            <span className={`connection-state-indicator ${mfcState.connection_status}`}>
              ({mfcState.connection_status === 'connected' ? '设备已连接' :
                mfcState.connection_status === 'connecting' ? '连接中...' :
                  mfcState.connection_status === 'error' ? '连接错误' : '未连接'})
            </span>
            {isConnected && (
              <>
                {mfcState.isScanning && (
                  <button
                    className="btn btn--sm btn--danger"
                    onClick={() => mfcControls.stopScan()}
                    disabled={mfcState.isScanStopping}
                  >
                    {mfcState.isScanStopping ? '停止中' : '停止扫描'}
                  </button>
                )}
                <button
                  className="btn btn--sm btn--danger"
                  onClick={() => mfcControls.disconnect()}
                  disabled={mfcState.isLoading || mfcState.isScanning}
                >
                  断开
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
        <div className="mfc-modal-content">
          {/* 错误显示 */}
          {mfcState.error && (
            <div className="error-banner">
              <span className="error__message">
                错误: {mfcState.error.message}
              </span>
              <button
                className="btn btn--sm btn--secondary"
                onClick={mfcControls.clearError}
              >
                关闭
              </button>
            </div>
          )}

          {activeTab === 'dashboard' && isConnected ? (
            <DeviceDashboardPanel
              title="MFC 仪表盘"
              eyebrow="Mass Flow"
              subtitle={mfcState.lastUpdate ? `最后更新 ${mfcState.lastUpdate.toLocaleTimeString()}` : connectionLabel}
              actions={(
                <button
                  className={`btn btn--sm btn--secondary ${mfcState.isScanning ? 'is-loading' : ''}`}
                  onClick={() => mfcControls.scanDevices({ port: effectiveSelectedPort })}
                  disabled={mfcState.isLoading || mfcState.isScanning}
                >
                  {mfcState.isScanning ? '扫描中' : '重新扫描'}
                </button>
              )}
            >
              <DeviceMetricGrid columns="four">
                <DeviceMetricTile label="设备数" value={mfcState.devices.length} unit="个" tone={mfcState.devices.length > 0 ? 'success' : 'muted'} />
                <DeviceMetricTile label="激活通道" value={flowSummary.activeDevices} unit="个" tone={flowSummary.activeDevices > 0 ? 'primary' : 'muted'} />
                <DeviceMetricTile label="实际总流量" value={formatFlow(flowSummary.totalFlow)} unit="sccm" tone="success" />
                <DeviceMetricTile label="设定总流量" value={formatFlow(flowSummary.totalSetFlow)} unit="sccm" tone="primary" />
                <DeviceMetricTile
                  label="运行时长"
                  value={formatRuntimeDuration(connectedSeconds)}
                  meta={connectedAt ? `自 ${connectedAt.toLocaleTimeString()}` : '本次连接'}
                  tone="warning"
                />
                <DeviceMetricTile
                  label="容量占用"
                  value={Math.round(flowSummary.capacityPercent)}
                  unit="%"
                  meta={`${formatFlow(flowSummary.totalCapacity)} sccm`}
                  tone="success"
                  progressPercent={flowSummary.capacityPercent}
                />
                <DeviceMetricTile
                  label="设定占用"
                  value={Math.round(flowSummary.setpointPercent)}
                  unit="%"
                  meta="总设定 / 总量程"
                  tone="primary"
                  progressPercent={flowSummary.setpointPercent}
                />
                <DeviceMetricTile
                  label="实时链路"
                  value={runtimeSocket.connected ? '在线' : '离线'}
                  meta={connectionLabel}
                  tone={runtimeSocket.connected ? 'success' : 'muted'}
                />
              </DeviceMetricGrid>
            </DeviceDashboardPanel>
          ) : (
            <>
              {/* 条件渲染：连接面板或设备管理 */}
              {!isConnected ? (
                /* 未连接、连接中或错误状态时显示连接面板 */
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
                /* 已连接时显示设备管理 */
                <>
                  {/* 设备列表 */}
                  {mfcState.devices.length === 0 && !mfcState.isScanning && !mfcState.error ? (
                    <div className="mfc__empty">
                      <div className="mfc__empty-icon">📡</div>
                      <h4>未发现MFC设备</h4>
                      <p>正在扫描端口设备...</p>
                      <span className="mfc__empty-hint">长时间无响应请检查连接</span>
                    </div>
                  ) : (
                    <div className="mfc__sections">
                      {/* 激活设备 (setFlow > 0) */}
                      {(() => {
                        const activeDevices = mfcState.devices.filter(d => d.setFlow > 0);
                        const idleDevices = mfcState.devices.filter(d => d.setFlow === 0);
                        return (
                          <>
                            {activeDevices.length > 0 && (
                              <div className="mfc__section">
                                <div className="mfc__section-title">激活设备 ({activeDevices.length})</div>
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
                              <div className="mfc__section">
                                <div className="mfc__section-title mfc__section-title--idle">空闲设备 ({idleDevices.length})</div>
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
                          </>
                        );
                      })()}
                    </div>
                  )}
                </>
              )}

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

          {/* 加载状态 */}
          {mfcState.isLoading && !mfcState.isScanning && (
            <div className="loading__overlay">
              <div className="loading__content">
                <div className="loading-spinner" />
                <p>正在处理请求...</p>
              </div>
            </div>
          )}
        </div>
      </div>
  );
};

export default MFCModal;
