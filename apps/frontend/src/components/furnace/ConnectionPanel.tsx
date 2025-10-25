import React, { useState, useCallback } from 'react';
import { FurnaceApi } from '../../services/api';
import type { FurnaceState, FurnaceControls } from '../../services/hooks/useFurnace';
import type { CommLog, OperationLog, LogEntry } from '../../types/devices';

interface ConnectionPanelProps {
  furnaceState: FurnaceState;
  furnaceControls: FurnaceControls;
}

export const ConnectionPanel: React.FC<ConnectionPanelProps> = ({ furnaceState, furnaceControls }) => {
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
      if (furnaceState.connection_status === 'connected') {
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
  }, [furnaceControls, furnaceState.connection_status]);

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

  return (
    <>
      {/* 设备连接区域 */}
      <div className="device-connection-section">
        {/* 未连接时的端口选择 */}
        {furnaceState.connection_status !== 'connected' && (
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
                disabled={furnaceState.loading}
                className="port-select"
              >
                <option value="">-- 请选择端口 --</option>
                {availablePorts.map(port => (
                  <option key={port} value={port}>{port}</option>
                ))}
              </select>
              <button
                onClick={loadAvailablePorts}
                disabled={furnaceState.loading}
                className="btn btn-secondary btn-sm refresh-btn"
              >
                刷新端口
              </button>
            </div>
            {furnaceState.loading && (
              <div className="status-message connecting">
                🔄 正在连接中...
              </div>
            )}
          </div>
        )}

        {/* 已连接时的状态显示 */}
        {furnaceState.connection_status === 'connected' && (
          <div className="device-connection-panel connected">
            <h4>设备已连接</h4>
            <p>端口: <strong>{selectedPort}</strong></p>
            <button
              onClick={handleDisconnect}
              disabled={furnaceState.loading}
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
              onClick={() => furnaceControls.refresh_logs()}
              className="console-btn"
              title="刷新通信日志"
            >
              刷新通信
            </button>
            <button
              onClick={() => furnaceControls.clear_logs()}
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
                  className={`console-log ${(log.type === 'comm_rx' || log.type === 'comm_tx') ? 'comm' : 'operation'} ${(log.type === 'comm_rx' || log.type === 'comm_tx') ? (log.details as CommLog)?.direction?.toLowerCase() || '' : ''}`}
                >
                  <span className="log-timestamp">{log.timestamp}</span>
                  {(log.type === 'comm_rx' || log.type === 'comm_tx') ? (
                    <>
                      <span className="log-direction">{(log.details as CommLog)?.direction}:</span>
                      <span className="log-data">{(log.details as CommLog)?.data}</span>
                    </>
                  ) : (
                    <span className="log-message">
                      {log.type === 'success' && '✓ '}
                      {log.type === 'error' && '✗ '}
                      {log.type === 'warning' && '⚠ '}
                      {log.type === 'info' && 'ℹ '}
                      {log.message}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};