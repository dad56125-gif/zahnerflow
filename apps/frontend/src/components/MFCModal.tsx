/**
 * MFC专用Modal组件
 *
 * 从DeviceModal中分离出来的MFC设备管理界面
 * 支持WebSocket实时通信和多设备管理
 */

import React, { useState, useEffect } from 'react';
import { useMfc } from '../services/hooks/useMfc';
import { MFCDeviceCard } from './MFCDeviceCard';
import { MFCConnectionPanel } from './mfc/MFCConnectionPanel';
import { mfcWebSocketService } from '../services/mfc-websocket.service';

interface MFCModalProps {
  on_close: () => void;
  modal_top: number;
  modal_left: number;
  modal_width: number;
  modal_height: number;
}

export const MFCModal: React.FC<MFCModalProps> = ({
  on_close,
  modal_top,
  modal_left,
  modal_width,
  modal_height
}) => {
  const [mfcState, mfcControls] = useMfc();
  const [web_socket_connected, setWebSocketConnected] = useState(false);

  // 初始化WebSocket连接
  useEffect(() => {
    const initializeWebSocket = () => {
      try {
        // 连接WebSocket服务
        mfcWebSocketService.connect();

        // 注册事件处理器
        mfcWebSocketService.onConnected(() => {
          console.log('MFC WebSocket connected');
          setWebSocketConnected(true);
          mfcWebSocketService.subscribeToMfc();
        });

        mfcWebSocketService.onDisconnected(() => {
          console.log('MFC WebSocket disconnected');
          setWebSocketConnected(false);
        });

        mfcWebSocketService.onStatusUpdate((data) => {
          console.log('MFC status update received:', data);
          // 更新设备状态到useMfc Hook
          if (data.data && Array.isArray(data.data)) {
            data.data.forEach(deviceStatus => {
              mfcControls.updateDeviceStatus(deviceStatus.device_address, {
                flow_sccm: deviceStatus.flow_sccm,
                setpoint_sccm: deviceStatus.setpoint_sccm,
                connection_status: deviceStatus.connection_status,
                last_communication: deviceStatus.last_communication,
              });
            });
          }
        });

        mfcWebSocketService.onSamplingData((data) => {
          console.log('MFC sampling data received:', data);
          // 更新采样数据到useMfc Hook
          if (data.data && Array.isArray(data.data)) {
            data.data.forEach(sample => {
              mfcControls.updateFlowData(sample.device_address, {
                flow_sccm: sample.flow_sccm,
                timestamp: sample.timestamp,
                setpoint_sccm: sample.setpoint_sccm,
              });
            });
          }
        });

        mfcWebSocketService.onNotification((notification) => {
          console.log('MFC notification received:', notification);
          // 通知处理可在此添加
        });

        mfcWebSocketService.onError((error) => {
          console.error('MFC WebSocket error:', error);
        });

      } catch (error) {
        console.error('Failed to initialize MFC WebSocket:', error);
      }
    };

    initializeWebSocket();

    // 清理函数
    return () => {
      if (web_socket_connected) {
        mfcWebSocketService.unsubscribeFromMfc();
        mfcWebSocketService.disconnect();
      }
    };
  }, []);

  // 保持对 props 的读取以避免 TS 未使用报错
  void modal_top; void modal_left; void modal_width; void modal_height;

  return (
    <div className="device-modal furnace-modal">
      <div className="device-modal-content">
        {/* Modal头部 */}
        <div className="device-header">
          <div className="header-title">
            <h3>质量流量控制器 (MFC)</h3>
            <div className="connection-status">
              <span className={`status-indicator ${web_socket_connected ? 'connected' : 'disconnected'}`}></span>
              <span className="status-text">
                {web_socket_connected ? '实时连接' : '离线'}
              </span>
              <span className={`connection-state-indicator ${mfcState.connection_status}`}>
                ({mfcState.connection_status === 'connected' ? '设备已连接' :
                   mfcState.connection_status === 'connecting' ? '连接中...' :
                   mfcState.connection_status === 'error' ? '连接错误' : '未连接'})
              </span>
            </div>
          </div>

          <div className="header-controls">
            {mfcState.connection_status === 'connected' && (
              <button
                className="btn btn-info"
                onClick={() => mfcControls.refresh()}
                disabled={mfcState.isLoading}
              >
                重新连接
              </button>
            )}
          </div>

          <button className="close-btn" onClick={on_close}>×</button>
        </div>

        {/* 主要内容区域 */}
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

          {/* 条件渲染：连接面板或设备管理 */}
          {(mfcState.connection_status === 'disconnected' ||
            mfcState.connection_status === 'connecting' ||
            mfcState.connection_status === 'error') ? (
            /* 未连接、连接中或错误状态时显示连接面板 */
            <MFCConnectionPanel
              mfcState={mfcState}
              mfcControls={mfcControls}
            />
          ) : (
            /* 已连接时显示设备管理 */
            <>
              {/* 设备列表 */}
              {mfcState.devices.length === 0 && !mfcState.isScanning && !mfcState.error ? (
                <div className="no-devices">
                  <div className="no-data">
                    <h4>未发现MFC设备</h4>
                    <p>正在扫描已连接端口上的设备...</p>
                    <div className="connection-hint">
                      <p>如果长时间未发现设备，请尝试重新连接</p>
                    </div>
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

              {/* 设备控制按钮 */}
              <div className="device-controls">
                <button
                  className={`btn ${mfcState.isScanning ? 'btn-loading' : 'btn-primary'}`}
                  onClick={() => mfcControls.scanDevices()}
                  disabled={mfcState.isScanning}
                >
                  {mfcState.isScanning ? '扫描中...' : '重新扫描设备'}
                </button>

                <button
                  className="btn btn-secondary"
                  onClick={() => mfcControls.refreshDevices()}
                  disabled={mfcState.isLoading}
                >
                  刷新状态
                </button>
              </div>
            </>
          )}

          {/* 设备状态信息 */}
          {mfcState.devices.length > 0 && (
            <div className="mfc-status-summary">
              <div className="status-info">
                <span className="device-count">
                  已连接设备: {mfcState.devices.length} 个
                </span>
                <span className="last-update">
                  最后更新: {mfcState.lastUpdate?.toLocaleTimeString() || '--:--:--'}
                </span>
                <span className="poll-count">
                  轮询次数: {mfcState.pollCount}
                </span>
              </div>
            </div>
          )}

          {/* 扫描进度 */}
          {mfcState.isScanning && (
            <div className="scanning-overlay">
              <div className="scanning-content">
                <div className="loading-spinner" />
                <p>正在扫描MFC设备...</p>
                <div className="scanning-info">
                  <small>扫描地址范围: 32-80</small>
                </div>
              </div>
            </div>
          )}

          {/* 加载状态 */}
          {mfcState.isLoading && !mfcState.isScanning && (
            <div className="loading-overlay">
              <div className="loading-content">
                <div className="loading-spinner" />
                <p>正在处理请求...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MFCModal;