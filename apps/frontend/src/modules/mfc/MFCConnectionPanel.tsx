import React, { useState, useEffect } from 'react';
import type { MfcState, MfcControls } from './useMfc';

interface MFCConnectionPanelProps {
  mfcState: MfcState;
  mfcControls: MfcControls;
}

export const MFCConnectionPanel: React.FC<MFCConnectionPanelProps> = ({ mfcState, mfcControls }) => {
  // 本地状态仅用于下拉框选择，默认为空，强制用户手动选择
  const [selectedPort, setSelectedPort] = useState<string>('');

  // 状态同步：只有当后端【已经连接】时，才自动同步显示那个端口
  // 如果未连接，绝对不替用户做主
  useEffect(() => {
    if (mfcState.connection_status === 'connected' && mfcState.selected_port) {
      setSelectedPort(mfcState.selected_port);
    }
  }, [mfcState.connection_status, mfcState.selected_port]);

  // 处理连接动作
  const handleConnect = async () => {
    if (!selectedPort) return;
    try {
      // 使用默认波特率 19200
      await mfcControls.connect(selectedPort, 19200, 1.0);
    } catch (error) {
      // 错误已由 hook 处理
    }
  };

  // 处理断开动作
  const handleDisconnect = async () => {
    try {
      await mfcControls.disconnect();
      setSelectedPort(''); // 断开后重置选择，防止误操作
    } catch (error) {
      // 错误已由 hook 处理
    }
  };

  const isConnecting = mfcState.connection_status === 'connecting';

  return (
    <div className="device-connection-section">
      {/* === 未连接状态：显示端口选择面板 === */}
      {mfcState.connection_status !== 'connected' && (
        <div className="device-connection-panel">
          <div className="connection-header">
            <h4>MFC设备连接</h4>
            {mfcState.available_ports.length === 0 && !mfcState.isLoading && (
              <div className="status-message warning">
                ⚠️ 未检测到可用端口，请检查物理连接
              </div>
            )}
          </div>

          <div className="control-group">
            <div className="port-selector">
              <select
                value={selectedPort}
                onChange={(e) => setSelectedPort(e.target.value)}
                disabled={isConnecting || mfcState.available_ports.length === 0}
                className="port-select"
              >
                <option value="">-- 请选择端口 --</option>
                {mfcState.available_ports.map(port => (
                  <option key={port} value={port}>{port}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="connection-actions">
            <button
              onClick={handleConnect}
              // 只有当用户真正选了端口后，按钮才可用
              disabled={isConnecting || !selectedPort}
              className={`btn btn-primary btn-block ${isConnecting ? 'btn-loading' : ''}`}
              style={{ marginTop: '10px', width: '100%' }}
            >
              {isConnecting ? '正在连接...' : '连接设备'}
            </button>
          </div>
        </div>
      )}

      {/* === 已连接状态：显示连接信息 === */}
      {mfcState.connection_status === 'connected' && (
        <div className="device-connection-panel connected">
          <div className="connection-status-header">
            <div className="status-indicator success"></div>
            <h4>MFC设备已连接</h4>
          </div>

          <div className="connection-info">
            <div className="info-item">
              <span className="info-label">连接端口:</span>
              <span className="info-value">{mfcState.selected_port}</span>
            </div>
            <div className="info-item">
              <span className="info-label">已发现设备:</span>
              <span className="info-value">{mfcState.devices.length} 个</span>
            </div>
            <div className="info-item">
              <span className="info-label">连接状态:</span>
              <span className="info-value status-connected">正常通信</span>
            </div>
          </div>

          <div className="connection-actions">
            <button
              onClick={handleDisconnect}
              disabled={mfcState.isLoading}
              className="btn btn-warning disconnect-btn"
            >
              断开连接
            </button>
          </div>
        </div>
      )}

      {/* === 错误状态：显示重试选项 === */}
      {mfcState.connection_status === 'error' && (
        <div className="device-connection-panel error">
          <div className="connection-status-header">
            <div className="status-indicator error"></div>
            <h4>连接失败</h4>
          </div>

          <div className="error-info">
             <p>无法连接到设备，请检查端口占用情况。</p>
          </div>

          <div className="connection-actions">
            <button
              onClick={handleConnect}
              disabled={isConnecting || !selectedPort}
              className="btn btn-primary"
            >
              重试连接
            </button>
          </div>
        </div>
      )}
    </div>
  );
};