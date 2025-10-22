import React, { useState, useCallback } from 'react';
import type { FurnaceState, FurnaceControls } from '../services/hooks/useFurnace';
import { useMfc } from '../services/hooks/useMfc';
import { MFCDeviceCard } from './MFCDeviceCard';
import { FurnaceApi } from '../services/api';
import { CommLog, OperationLog } from '../types/devices';


interface DeviceModalProps {
  device: 'furnace' | 'mfc' | null;
  onClose: () => void;
  modalTop: number;
  modalLeft: number;
  modalWidth: number;
  modalHeight: number;
  furnaceState: FurnaceState;
  furnaceControls: FurnaceControls;
}

export const DeviceModal: React.FC<DeviceModalProps> = ({ device, onClose, modalTop, modalLeft, modalWidth, modalHeight, furnaceState, furnaceControls }) => {
  if (!device) return null;

  // 当前选项卡状态
  const [activeTab, setActiveTab] = useState<'monitoring' | 'program' | 'presets' | 'recording' | 'history'>('monitoring');

  const [mfcState, mfcControls] = useMfc();

  // Furnace连接配置状态
  const [availablePorts, setAvailablePorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');

  
  // 加载可用端口
  const loadAvailablePorts = useCallback(async () => {
    try {
      const ports = await FurnaceApi.getPorts();
      setAvailablePorts(ports);
      // 不再自动选择端口，让用户手动选择
    } catch (error) {
      console.error('Failed to load ports:', error);
      setAvailablePorts([]);
    }
  }, []);

  // 处理端口选择（选择后自动连接，使用默认参数）
  const handlePortSelection = useCallback(async (port: string) => {
    if (!port) {
      // 如果清空了端口选择，则断开连接
      if (furnaceState.connectionState.status === 'connected') {
        try {
          await furnaceControls.disconnect();
        } catch (error) {
          console.error('Disconnect failed:', error);
        }
      }
      setSelectedPort('');
      return;
    }

    try {
      // 更新选择的端口
      setSelectedPort(port);

      // 自动尝试连接，使用默认参数（隐藏技术细节）
      await furnaceControls.connect({
        port: port,
        baudrate: 9600,
        address: 1,
        stopbits: 2,
        timeout: 1.0,
      });
    } catch (error) {
      console.error('Connection failed:', error);
      alert(`连接失败: ${error instanceof Error ? error.message : '未知错误'}`);
      // 连接失败时重置端口选择
      setSelectedPort('');
    }
  }, [furnaceControls, furnaceState.connectionState.status]);

  // 处理断开连接
  const handleDisconnect = useCallback(async () => {
    try {
      await furnaceControls.disconnect();
      setSelectedPort('');
    } catch (error) {
      console.error('Disconnect failed:', error);
      alert(`断开连接失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }, [furnaceControls]);

  // 保持对 props 的读取以避免 TS 未使用报错
  void modalTop; void modalLeft; void modalWidth; void modalHeight;

  // 不再在组件挂载时自动加载端口
  // 只有用户主动操作时才加载端口

  // MFC设备 - 使用真实数据和API
  if (device !== 'furnace') {
    return (
      <div className="device-modal furnace-modal">
        <div className="device-modal-content">
          <div className="device-header">
            <h3>质量流量控制器 (MFC)</h3>
            <div className="header-controls">
              <button
                className={`btn ${mfcState.isScanning ? 'btn-loading' : 'btn-primary'}`}
                onClick={() => mfcControls.scanDevices()}
                disabled={mfcState.isScanning}
              >
                {mfcState.isScanning ? '扫描中...' : '扫描设备'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => mfcControls.refreshDevices()}
                disabled={mfcState.isLoading}
              >
                刷新状态
              </button>
            </div>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>

          <div className="mfc-modal-content">
            {/* 错误显示 */}
            {mfcState.error && (
              <div className="error-banner">
                <span className="error-message">
                  错误: {mfcState.error.message}
                </span>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={mfcControls.clearError}
                >
                  关闭
                </button>
              </div>
            )}

            {/* 设备列表 */}
            {mfcState.devices.length === 0 && !mfcState.isScanning && !mfcState.error ? (
              <div className="no-devices">
                <div className="no-data">
                  <h4>未发现MFC设备</h4>
                  <p>请点击"扫描设备"按钮来搜索可用的MFC设备</p>
                </div>
              </div>
            ) : (
              <div className="mfc-cards-container">
                {mfcState.devices.map((device) => (
                  <MFCDeviceCard
                    key={device.address}
                    device={device}
                    onSetFlow={mfcControls.setFlowRate}
                    loading={mfcState.isLoading}
                    disabled={mfcState.isScanning}
                  />
                ))}
              </div>
            )}

            {/* 加载状态 */}
            {mfcState.isScanning && (
              <div className="scanning-overlay">
                <div className="scanning-content">
                  <div className="loading-spinner" />
                  <p>正在扫描MFC设备...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="device-modal furnace-modal">
      <div className="device-modal-content">
        <div className="device-header">
          <h3>AI-518P 温度控制器</h3>
          <div className="header-tabs">
            {/* 选项卡导航 */}
            <div className="tab-navigation">
              <button
                className={`tab-btn ${activeTab === 'monitoring' ? 'active' : ''}`}
                onClick={() => setActiveTab('monitoring')}
              >
                实时监控
              </button>
              <button
                className={`tab-btn ${activeTab === 'program' ? 'active' : ''}`}
                onClick={() => setActiveTab('program')}
              >
                设置程序段
              </button>
              <button
                className={`tab-btn ${activeTab === 'presets' ? 'active' : ''}`}
                onClick={() => setActiveTab('presets')}
              >
                预设程序段
              </button>
              <button
                className={`tab-btn ${activeTab === 'recording' ? 'active' : ''}`}
                onClick={() => setActiveTab('recording')}
              >
                数据记录
              </button>
              <button
                className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
                onClick={() => setActiveTab('history')}
              >
                历史数据
              </button>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {/* 双列布局容器 */}
        <div className="main-content-wrapper">
          {/* 左侧主内容区域 (2/3宽度) */}
          <div className="content-main">
            {/* 选项卡内容 */}
            <div className="tab-content">
              {activeTab === 'monitoring' ? (
                <div className="monitoring-tab">
                  {/* 错误显示 */}
                  {furnaceState.error && (
                    <div className="error-banner">
                      <span className="error-message">
                        错误: {furnaceState.error.message}
                      </span>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={furnaceControls.clearError}
                      >
                        关闭
                      </button>
                    </div>
                  )}

                  {/* 实时状态显示 */}
                  <div className="status-display">
                    {/* 第一行：PV/SV/MV */}
                    <div className="status-row-temp">
                      <div className="status-item">
                        <label className="status-label">PV:</label>
                        <span className="status-value pv-value">
                          {furnaceState.status && furnaceState.status.pv !== undefined ? `${furnaceState.status.pv.toFixed(1)}°C` : '--.-°C'}
                        </span>
                      </div>
                      <div className="status-item">
                        <label className="status-label">SV:</label>
                        <span className="status-value sv-value">
                          {furnaceState.status && furnaceState.status.sv !== undefined ? `${furnaceState.status.sv.toFixed(1)}°C` : '--.-°C'}
                        </span>
                      </div>
                      <div className="status-item">
                        <label className="status-label">MV:</label>
                        <span className="status-value mv-value">
                          {furnaceState.status && furnaceState.status.mv !== undefined ? `${furnaceState.status.mv.toFixed(1)}%` : '--.-%'}
                        </span>
                      </div>
                    </div>

                    {/* 第二行：程序状态/程序段/时间 */}
                    <div className="status-row-program">
                      <div className="status-item">
                        <label className="status-label">程序状态:</label>
                        <span className={`status-value program-status ${furnaceState.operationState}`}>
                          {furnaceState.status ? furnaceState.status.status : '断开'}
                        </span>
                      </div>
                      <div className="status-item">
                        <label className="status-label">程序段:</label>
                        <span className="status-value segment-value">
                          {furnaceState.status ? furnaceState.status.segment : '--'}
                        </span>
                      </div>
                      <div className="status-item">
                        <label className="status-label">运行/设定时间:</label>
                        <span className="status-value time-value">
                          {furnaceState.status && furnaceState.status.segment_time !== undefined && furnaceState.status.segment_time_set !== undefined ?
                            `${(furnaceState.status.segment_time / 60).toFixed(1)} / ${(furnaceState.status.segment_time_set / 60).toFixed(1)} 分钟`
                            : '-- / -- 分钟'
                          }
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 温度曲线图 */}
                  <div className="chart-container">
                    <div className="chart-header">
                      <h4>温度曲线</h4>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => furnaceControls.loadHistoryData()}
                        disabled={furnaceState.isLoading}
                      >
                        刷新数据
                      </button>
                    </div>
                    <div className="chart-placeholder">
                      {furnaceState.historyData.length > 0 ? (
                        <div className="chart-data-available">
                          <p>已加载 {furnaceState.historyData.length} 个数据点</p>
                          {/* 这里可以集成图表库如 Chart.js */}
                        </div>
                      ) : (
                        <div className="no-data">
                          {furnaceState.isLoading ? '加载中...' : '等待数据...'}
                        </div>
                      )}
                    </div>
                  </div>

  
                  {/* 控制按钮 */}
                  <div className="control-panel">
                    <button
                      className="btn btn-success"
                      onClick={furnaceControls.run}
                      disabled={
                        furnaceState.connectionState.status !== 'connected' ||
                        furnaceState.isLoading ||
                        furnaceState.operationState === 'running'
                      }
                    >
                      运行
                    </button>

                    <button
                      className="btn btn-warning"
                      style={{ marginLeft: '8px' }}
                      onClick={furnaceControls.pause}
                      disabled={
                        furnaceState.connectionState.status !== 'connected' ||
                        furnaceState.isLoading ||
                        furnaceState.operationState === 'paused' ||
                        furnaceState.operationState === 'stopped'
                      }
                    >
                      保温
                    </button>

                    <button
                      className="btn btn-danger"
                      style={{ marginLeft: '8px' }}
                      onClick={furnaceControls.stop}
                      disabled={
                        furnaceState.connectionState.status !== 'connected' ||
                        furnaceState.isLoading ||
                        furnaceState.operationState === 'stopped'
                      }
                    >
                      停止
                    </button>

                    <button
                      className="btn btn-secondary"
                      style={{ marginLeft: '8px' }}
                      onClick={async () => {
                        const input = document.getElementById('monitoringSegmentInput') as HTMLInputElement;
                        const segment = parseInt(input.value);
                        if (segment >= 1 && segment <= 30) {
                          try {
                            await furnaceControls.setSegment(segment);
                          } catch (error) {
                            alert(`设置程序段失败: ${error instanceof Error ? error.message : '未知错误'}`);
                          }
                        } else {
                          alert('程序段号必须在1-30之间');
                        }
                      }}
                      disabled={
                        furnaceState.connectionState.status !== 'connected' ||
                        furnaceState.isLoading ||
                        furnaceState.operationState === 'stopped'
                      }
                    >
                      更改程序段
                    </button>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      placeholder="1-30"
                      className="monitoring-segment-input"
                      id="monitoringSegmentInput"
                      disabled={
                        furnaceState.connectionState.status !== 'connected' ||
                        furnaceState.isLoading
                      }
                      style={{ marginLeft: '8px', width: '80px' }}
                    />
                  </div>

                  </div>
              ) : activeTab === 'program' ? (
                <div className="program-tab">
                  {/* 程序段控制按钮 */}
                  <div className="program-controls">
                    <button
                      className={`btn btn-primary ${furnaceState.segmentOperation?.operation === 'reading' ? 'btn-progress' : ''}`}
                      onClick={furnaceControls.loadSegments}
                      disabled={furnaceState.connectionState.status !== 'connected' || furnaceState.isLoading}
                    >
                      {furnaceState.segmentOperation?.operation === 'reading' ? (
                        <>
                          <div className="btn-progress-bar">
                            <div
                              className="btn-progress-fill"
                              style={{ left: `${(furnaceState.segmentOperation.currentSegment - 1) * 100 / 30}%` }}
                            />
                          </div>
                          <div className="btn-progress-content">
                            <div className="btn-text">读取程序段</div>
                            <div className="btn-progress-text">
                              {furnaceState.segmentOperation.currentSegment}/30
                            </div>
                          </div>
                        </>
                      ) : (
                        '读取程序段'
                      )}
                    </button>
                    <button
                      className={`btn btn-success ${furnaceState.segmentOperation?.operation === 'writing' ? 'btn-progress' : ''}`}
                      onClick={() => {
                        // 这里收集所有输入的值并写入
                        const inputs = document.querySelectorAll('.segment-input');
                        const segments: any[] = [];

                        inputs.forEach((input, index) => {
                          const row = Math.floor(index / 2);
                          const isTemp = index % 2 === 0;

                          if (!segments[row]) {
                            segments[row] = { id: row + 1, temperature: 0, time: 0 };
                          }

                          if (isTemp) {
                            segments[row].temperature = parseFloat((input as HTMLInputElement).value) || 0;
                          } else {
                            segments[row].time = parseInt((input as HTMLInputElement).value) || 0;
                          }
                        });

                        furnaceControls.writeSegments(segments.filter(s => s.temperature > 0 || s.time > 0));
                      }}
                      disabled={furnaceState.connectionState.status !== 'connected' || furnaceState.isLoading}
                    >
                      {furnaceState.segmentOperation?.operation === 'writing' ? (
                        <>
                          <div className="btn-progress-bar">
                            <div
                              className="btn-progress-fill"
                              style={{ left: `${(furnaceState.segmentOperation.currentSegment - 1) * 100 / 30}%` }}
                            />
                          </div>
                          <div className="btn-progress-content">
                            <div className="btn-text">写入程序段</div>
                            <div className="btn-progress-text">
                              {furnaceState.segmentOperation.currentSegment}/30
                            </div>
                          </div>
                        </>
                      ) : (
                        '写入程序段'
                      )}
                    </button>
                  </div>

                  {/* 程序段网格 */}
                  <div className="segments-grid">
                    <div className="segments-column">
                      {Array.from({ length: 15 }, (_, i) => {
                        const segId = i + 1;
                        const segment = Array.isArray(furnaceState.segments) ? furnaceState.segments.find(s => s.id === segId) : null;
                        return (
                          <div key={segId} className="segment-row">
                            <label className="segment-label">C{segId.toString().padStart(2, '0')}</label>
                            <input
                              type="number"
                              className="segment-input temp-input"
                              defaultValue={segment?.temperature || 0}
                              step="0.1"
                              disabled={furnaceState.connectionState.status !== 'connected'}
                            />
                            <label className="segment-label">t{segId.toString().padStart(2, '0')}</label>
                            <input
                              type="number"
                              className="segment-input time-input"
                              defaultValue={segment?.time || 0}
                              disabled={furnaceState.connectionState.status !== 'connected'}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="segments-column">
                      {Array.from({ length: 15 }, (_, i) => {
                        const segId = i + 16;
                        const segment = Array.isArray(furnaceState.segments) ? furnaceState.segments.find(s => s.id === segId) : null;
                        return (
                          <div key={segId} className="segment-row">
                            <label className="segment-label">C{segId.toString().padStart(2, '0')}</label>
                            <input
                              type="number"
                              className="segment-input temp-input"
                              defaultValue={segment?.temperature || 0}
                              step="0.1"
                              disabled={furnaceState.connectionState.status !== 'connected'}
                            />
                            <label className="segment-label">t{segId.toString().padStart(2, '0')}</label>
                            <input
                              type="number"
                              className="segment-input time-input"
                              defaultValue={segment?.time || 0}
                              disabled={furnaceState.connectionState.status !== 'connected'}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 程序段说明 */}
                  <div className="segments-info">
                    <h5>说明</h5>
                    <ul>
                      <li>Cxx: 程序段编号 (1-30)</li>
                      <li>温度: 设定温度 (℃)</li>
                      <li>时间: 运行时间 (秒)</li>
                      <li>温度为0的程序段将被忽略</li>
                    </ul>
                  </div>
                </div>
              ) : activeTab === 'presets' ? (
                <div className="presets-tab">
                  <div className="presets-header">
                    <h4>预设程序段</h4>
                  </div>
                  <div className="presets-content">
                    <div className="no-data">预设程序段功能待实现...</div>
                  </div>
                </div>
              ) : activeTab === 'recording' ? (
                <div className="recording-tab">
                  <div className="recording-header">
                    <h4>数据记录</h4>
                  </div>
                  <div className="recording-content">
                    <div className="no-data">数据记录功能待实现...</div>
                  </div>
                </div>
              ) : activeTab === 'history' ? (
                <div className="history-tab">
                  <div className="history-header">
                    <h4>历史数据</h4>
                  </div>
                  <div className="history-content">
                    <div className="no-data">历史数据功能待实现...</div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* 右侧区域 (1/3宽度) */}
          <div className="content-sidebar">
            {/* 设备连接区域 */}
            <div className="device-connection-section">
              {/* 未连接时的端口选择 */}
              {furnaceState.connectionState.status !== 'connected' && (
                <div className="device-connection-panel">
                  <div className="connection-header">
                    <h4>设备连接</h4>
                    {availablePorts.length === 0 && (
                      <div className="status-message warning">
                        ⚠️ 未检测到可用端口
                      </div>
                    )}
                    {availablePorts.length > 0 && !selectedPort && (
                      <div className="status-message info">
                        ℹ️ 选择端口后将自动连接
                      </div>
                    )}
                  </div>
                  <div className="control-group">
                    <select
                      value={selectedPort}
                      onChange={(e) => handlePortSelection(e.target.value)}
                      disabled={furnaceState.connectionState.status === 'connecting'}
                      className="port-select"
                    >
                      <option value="">-- 请选择端口 --</option>
                      {availablePorts.map(port => (
                        <option key={port} value={port}>{port}</option>
                      ))}
                    </select>
                    <button
                      onClick={loadAvailablePorts}
                      disabled={furnaceState.connectionState.status === 'connecting'}
                      className="btn btn-secondary btn-sm refresh-btn"
                    >
                      刷新端口
                    </button>
                  </div>
                  {furnaceState.connectionState.status === 'connecting' && (
                    <div className="status-message connecting">
                      🔄 正在连接中...
                    </div>
                  )}
                </div>
              )}

              {/* 已连接时的状态显示 */}
              {furnaceState.connectionState.status === 'connected' && (
                <div className="device-connection-panel connected">
                  <h4>设备已连接</h4>
                  <p>端口: <strong>{selectedPort}</strong></p>
                  <button
                    onClick={handleDisconnect}
                    disabled={furnaceState.isLoading}
                    className="disconnect-btn"
                  >
                    断开连接
                  </button>
                </div>
              )}
            </div>

            {/* 设备日志 */}
            <div className="console-section">
              <div className="console-header">
                <h4>设备日志</h4>
                <div className="console-controls">
                  <button
                    onClick={() => furnaceControls.refreshLogs()}
                    className="console-btn"
                    title="刷新通信日志"
                  >
                    刷新通信
                  </button>
                  <button
                    onClick={() => furnaceControls.clearLogs()}
                    className="console-btn"
                    title="清空所有日志"
                  >
                    清空
                  </button>
                </div>
              </div>
              <div className="console-content">
                {furnaceState.logs.length === 0 ? (
                  <div className="console-log info">
                    <span className="log-timestamp">--:--:--</span>
                    <span className="log-message">暂无日志，操作设备或点击刷新获取数据</span>
                  </div>
                ) : (
                  <div className="log-list">
                    {furnaceState.logs.map((log) => (
                      <div
                        key={log.id}
                        className={`console-log ${log.type === 'comm' ? 'comm' : 'operation'} ${log.type === 'comm' ? (log.data as CommLog).direction.toLowerCase() : (log.data as OperationLog).level}`}
                      >
                        <span className="log-timestamp">{log.timestamp}</span>
                        {log.type === 'comm' ? (
                          <>
                            <span className="log-direction">{(log.data as CommLog).direction}:</span>
                            <span className="log-data">{(log.data as CommLog).data}</span>
                          </>
                        ) : (
                          <span className="log-message">
                            {(log.data as OperationLog).level === 'success' && '✓ '}
                            {(log.data as OperationLog).level === 'error' && '✗ '}
                            {(log.data as OperationLog).level === 'warning' && '⚠ '}
                            {(log.data as OperationLog).level === 'info' && 'ℹ '}
                            {(log.data as OperationLog).message}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
