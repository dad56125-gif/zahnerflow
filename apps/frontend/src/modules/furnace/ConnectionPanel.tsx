import React, { useState, useCallback } from 'react';
import { FurnaceApi } from './furnaceApi';
import type { FurnaceState, FurnaceControls } from './useFurnace';

interface ConnectionPanelProps {
  furnaceState: FurnaceState;
  furnaceControls: FurnaceControls;
}

export const ConnectionPanel: React.FC<ConnectionPanelProps> = ({ furnaceState, furnaceControls }) => {
  const [ports, setPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState('');

  const loadPorts = async () => {
    try {
      setPorts(await FurnaceApi.getPorts());
    } catch (e) {
      setPorts([]);
    }
  };

  const handleConnect = async () => {
    if (!selectedPort) return;
    // 连接会自动触发 add_log('success', ...)
    await furnaceControls.connect({
      port: selectedPort,
      baudrate: 9600,
      address: 1,
      stopbits: 2,
      timeout: 1.0
    });
  };

  return (
    <>
      {/* 1. 端口连接区域 */}
      <div className="device-connection-section">
        {furnaceState.connection_status !== 'connected' ? (
          <div className="device-connection-panel">
            <div className="connection-header">
              <h4>设备连接</h4>
            </div>
            <div className="control-group">
              <select value={selectedPort} onChange={e => setSelectedPort(e.target.value)}>
                <option value="">-- 选择端口 --</option>
                {ports.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <button onClick={loadPorts} className="btn btn-secondary" disabled={furnaceState.loading}>刷新</button>
              <button 
                onClick={handleConnect} 
                disabled={!selectedPort || furnaceState.loading} 
                className="btn btn-primary"
              >
                {furnaceState.loading ? '连接中...' : '连接'}
              </button>
            </div>
          </div>
        ) : (
          <div className="device-connection-panel connected">
            <h4>设备已连接</h4>
            <p>端口: <strong>{selectedPort}</strong></p>
            <button 
              onClick={() => furnaceControls.disconnect()} 
              className="btn btn-danger"
              disabled={furnaceState.loading}
            >
              断开连接
            </button>
          </div>
        )}
      </div>

      {/* 2. [已恢复] 操作日志区域 */}
      <div className="console-section">
        <div className="console-header">
          <h4>操作日志</h4>
          <div className="console-controls">
            <button
              onClick={() => furnaceControls.clear_logs()}
              className="console-btn"
              title="清空日志"
            >
              清空
            </button>
          </div>
        </div>
        <div className="console-content">
          {furnaceState.logs.length === 0 ? (
            <div className="console-log info">
              <span className="log-message">暂无操作记录</span>
            </div>
          ) : (
            <div className="log-list">
              {furnaceState.logs.map((log) => (
                <div key={log.id} className={`console-log ${log.type}`}>
                  <span className="log-timestamp">{log.timestamp}</span>
                  <span className="log-message">
                    {log.type === 'success' && '✓ '}
                    {log.type === 'error' && '✗ '}
                    {log.type === 'warning' && '⚠ '}
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};