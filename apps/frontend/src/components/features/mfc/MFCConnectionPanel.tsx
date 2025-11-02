import React, { useState, useCallback, useEffect } from 'react';
import { MfcApi } from '../../../services/api/mfcApi';
import type { MfcState, MfcControls } from '../../../services/hooks/useMfc';

interface MFCConnectionPanelProps {
  mfcState: MfcState;
  mfcControls: MfcControls;
}

export const MFCConnectionPanel: React.FC<MFCConnectionPanelProps> = ({ mfcState, mfcControls }) => {
  // MFC连接配置状态
  const [available_ports, setAvailablePorts] = useState<string[]>([]);
  const [selected_port, setSelectedPort] = useState<string>('');
  const [is_loading_ports, setIsLoadingPorts] = useState<boolean>(false);
  const [connection_error, setConnectionError] = useState<string>('');

  // 加载可用端口
  const loadAvailablePorts = useCallback(async () => {
    try {
      setIsLoadingPorts(true);
      setConnectionError('');
      const ports = await MfcApi.getPorts();
      setAvailablePorts(ports);

      // 如果当前没有选择端口但已连接到某个端口，同步状态
      if (mfcState.connection_status === 'connected' && mfcState.selected_port && !selected_port) {
        setSelectedPort(mfcState.selected_port);
      }
    } catch (error) {
      console.error('Failed to load ports:', error);
      setConnectionError(error instanceof Error ? error.message : '获取端口列表失败');
      setAvailablePorts([]);
    } finally {
      setIsLoadingPorts(false);
    }
  }, [mfcState.connection_status, mfcState.selected_port, selected_port]);

  // 处理端口选择（选择后自动连接，使用默认参数）
  const handlePortSelection = useCallback(async (port: string) => {
    if (!port) {
      // 如果清空了端口选择，则断开连接
      if (mfcState.connection_status === 'connected') {
        try {
          await mfcControls.disconnect();
        } catch (error) {
          console.error('Disconnect failed:', error);
          setConnectionError(error instanceof Error ? error.message : '断开连接失败');
        }
      }
      setSelectedPort('');
      setConnectionError('');
      return;
    }

    try {
      // 更新选择的端口
      setSelectedPort(port);
      setConnectionError('');

      // 自动尝试连接，使用默认参数（隐藏技术细节）
      await mfcControls.connect(port, 19200, 1.0);
    } catch (error) {
      console.error('Connection failed:', error);
      const errorMessage = error instanceof Error ? error.message : '连接失败';
      setConnectionError(errorMessage);
      // 连接失败时重置端口选择
      setSelectedPort('');
    }
  }, [mfcControls, mfcState.connection_status]);

  // 处理断开连接
  const handleDisconnect = useCallback(async () => {
    try {
      await mfcControls.disconnect();
      setSelectedPort('');
      setConnectionError('');
    } catch (error) {
      console.error('Disconnect failed:', error);
      setConnectionError(error instanceof Error ? error.message : '断开连接失败');
    }
  }, [mfcControls]);

  // 同步外部状态变化
  useEffect(() => {
    if (mfcState.connection_status === 'disconnected' && selected_port) {
      setSelectedPort('');
    }
    if (mfcState.connection_status === 'connected' && mfcState.selected_port && !selected_port) {
      setSelectedPort(mfcState.selected_port);
    }
  }, [mfcState.connection_status, mfcState.selected_port, selected_port]);

  // 组件挂载时加载可用端口
  useEffect(() => {
    loadAvailablePorts();
  }, [loadAvailablePorts]);

  return (
    <div className="device-connection-section">
      {/* 未连接时的端口选择 */}
      {mfcState.connection_status !== 'connected' && (
        <div className="device-connection-panel">
          <div className="connection-header">
            <h4>MFC设备连接</h4>

            {/* 状态消息 */}
            {connection_error && (
              <div className="status-message error">
                ❌ {connection_error}
              </div>
            )}
            {available_ports.length === 0 && !connection_error && (
              <div className="status-message warning">
                ⚠️ 未检测到可用端口
              </div>
            )}
            </div>

          <div className="control-group">
            <div className="port-selector">
              <select
                value={selected_port}
                onChange={(e) => handlePortSelection(e.target.value)}
                disabled={mfcState.isLoading || mfcState.connection_status === 'connecting' || is_loading_ports}
                className="port-select"
              >
                <option value="">-- 请选择端口 --</option>
                {available_ports.map(port => (
                  <option key={port} value={port}>{port}</option>
                ))}
              </select>
              <button
                onClick={loadAvailablePorts}
                disabled={mfcState.isLoading || mfcState.connection_status === 'connecting' || is_loading_ports}
                className="btn btn-secondary btn-sm refresh-btn"
                title="刷新可用端口列表"
              >
                {is_loading_ports ? '刷新中...' : '刷新端口'}
              </button>
            </div>
          </div>

          {/* 连接状态指示 */}
          {(mfcState.isLoading || mfcState.connection_status === 'connecting') && (
            <div className="status-message connecting">
              <div className="loading-spinner small"></div>
              <span>正在连接中...</span>
            </div>
          )}

  
          </div>
      )}

      {/* 已连接时的状态显示 */}
      {mfcState.connection_status === 'connected' && (
        <div className="device-connection-panel connected">
          <div className="connection-status-header">
            <div className="status-indicator success"></div>
            <h4>MFC设备已连接</h4>
          </div>

          <div className="connection-info">
            <div className="info-item">
              <span className="info-label">连接端口:</span>
              <span className="info-value">{selected_port || mfcState.selected_port}</span>
            </div>
            <div className="info-item">
              <span className="info-label">已发现设备:</span>
              <span className="info-value">{mfcState.devices.length} 个</span>
            </div>
            <div className="info-item">
              <span className="info-label">连接状态:</span>
              <span className="info-value status-connected">已连接</span>
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
            <button
              onClick={() => mfcControls.refresh()}
              disabled={mfcState.isLoading}
              className="btn btn-secondary btn-sm"
            >
              刷新状态
            </button>
          </div>
        </div>
      )}

      {/* 连接错误状态 */}
      {mfcState.connection_status === 'error' && (
        <div className="device-connection-panel error">
          <div className="connection-status-header">
            <div className="status-indicator error"></div>
            <h4>连接错误</h4>
          </div>

          <div className="error-info">
            <p>连接过程中发生错误，请检查：</p>
            <ul>
              <li>设备是否已正确连接</li>
              <li>端口是否被其他程序占用</li>
              <li>设备电源是否正常</li>
            </ul>
          </div>

          <div className="connection-actions">
            <button
              onClick={() => selected_port && handlePortSelection(selected_port)}
              disabled={mfcState.isLoading}
              className="btn btn-primary"
            >
              重试连接
            </button>
            <button
              onClick={loadAvailablePorts}
              disabled={mfcState.isLoading || is_loading_ports}
              className="btn btn-secondary"
            >
              重新扫描端口
            </button>
          </div>
        </div>
      )}
    </div>
  );
};