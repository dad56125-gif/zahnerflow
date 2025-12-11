import React, { useState, useEffect } from 'react';
import { Button } from '../../shared/Button';
import { Dropdown } from '../../shared/Dropdown';
import type { MfcState, MfcControls } from './useMfc';

interface MFCConnectionPanelProps {
  mfcState: MfcState;
  mfcControls: MfcControls;
}

export const MFCConnectionPanel: React.FC<MFCConnectionPanelProps> = ({ mfcState, mfcControls }) => {
  const [selectedPort, setSelectedPort] = useState<string>('');

  // Dropdown状态管理
  const [dropdownState, setDropdownState] = useState<{
    isOpen: boolean;
    isHiding: boolean;
    position: { top: number; left: number; width: number } | null;
  }>({
    isOpen: false,
    isHiding: false,
    position: null
  });

  useEffect(() => {
    if (mfcState.connection_status === 'connected' && mfcState.selected_port) {
      setSelectedPort(mfcState.selected_port);
    }
  }, [mfcState.connection_status, mfcState.selected_port]);

  const handleConnect = async () => {
    if (!selectedPort) return;
    try {
      await mfcControls.connect(selectedPort, 19200, 1.0);
    } catch {
      // 错误已由 hook 处理
    }
  };

  const handleDisconnect = async () => {
    try {
      await mfcControls.disconnect();
      setSelectedPort('');
    } catch {
      // 错误已由 hook 处理
    }
  };

  const handleOpenDropdown = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setDropdownState({
      isOpen: true,
      isHiding: false,
      position: { top: rect.bottom + 4, left: rect.left, width: rect.width }
    });
  };

  const handleCloseDropdown = () => {
    setDropdownState(prev => ({ ...prev, isHiding: true }));
    setTimeout(() => {
      setDropdownState({ isOpen: false, isHiding: false, position: null });
    }, 200);
  };

  const handleSelectPort = (port: string) => {
    setSelectedPort(port);
    handleCloseDropdown();
  };

  const isConnecting = mfcState.connection_status === 'connecting';

  return (
    <div className="device-connection-section">
      {mfcState.connection_status !== 'connected' && (
        <div className="device-connection-panel" style={{ maxWidth: '300px', margin: '0 auto' }}>
          <div className="connection-header">
            <h4>MFC设备连接</h4>
            {mfcState.available_ports.length === 0 && !mfcState.isLoading && (
              <div className="status-message warning">
                ⚠️ 未检测到可用端口
              </div>
            )}
          </div>

          <div className="control-group">
            {/* 使用Dropdown组件替代原生select */}
            <button
              type="button"
              className="btn_base btn_layout btn_style_common btn_medium btn_secondary"
              onClick={handleOpenDropdown}
              disabled={isConnecting || mfcState.available_ports.length === 0}
              style={{ width: '100%', justifyContent: 'space-between' }}
            >
              <span>{selectedPort || '-- 选择端口 --'}</span>
              <svg className={`dropdown-arrow ${dropdownState.isOpen ? 'rotated' : ''}`} viewBox="-10 -6 20 12" width="12" height="12">
                <path d="M -8 -3 L 0 5 L 8 -3" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <Dropdown
              isOpen={dropdownState.isOpen}
              isHiding={dropdownState.isHiding}
              onClose={handleCloseDropdown}
              position={dropdownState.position || { top: 0, left: 0, width: 0 }}
            >
              {mfcState.available_ports.map(port => (
                <div
                  key={port}
                  className={`dropdown_option ${selectedPort === port ? 'selected' : ''}`}
                  onClick={() => handleSelectPort(port)}
                >
                  {port}
                </div>
              ))}
              {mfcState.available_ports.length === 0 && (
                <div className="dropdown_option disabled">无可用端口</div>
              )}
            </Dropdown>
          </div>

          <Button
            variant="primary"
            size="medium"
            block
            loading={isConnecting}
            onClick={handleConnect}
            disabled={!selectedPort}
          >
            连接设备
          </Button>
        </div>
      )}

      {/* 已连接状态 */}
      {mfcState.connection_status === 'connected' && (
        <div className="device-connection-panel connected" style={{ maxWidth: '300px', margin: '0 auto' }}>
          <div className="connection-status-header">
            <div className="status-indicator success"></div>
            <h4>MFC设备已连接</h4>
          </div>
          <div className="connection-info">
            <div className="info-item">
              <span className="info-label">端口:</span>
              <span className="info-value">{mfcState.selected_port}</span>
            </div>
            <div className="info-item">
              <span className="info-label">设备:</span>
              <span className="info-value">{mfcState.devices.length} 个</span>
            </div>
          </div>
          <Button
            variant="warning"
            size="small"
            onClick={handleDisconnect}
            disabled={mfcState.isLoading}
          >
            断开连接
          </Button>
        </div>
      )}

      {/* 错误状态 */}
      {mfcState.connection_status === 'error' && (
        <div className="device-connection-panel error" style={{ maxWidth: '300px', margin: '0 auto' }}>
          <div className="connection-status-header">
            <div className="status-indicator error"></div>
            <h4>连接失败</h4>
          </div>
          <div className="error-info">
            <p>无法连接，请检查端口</p>
          </div>
          <Button
            variant="primary"
            size="medium"
            onClick={handleConnect}
            disabled={isConnecting || !selectedPort}
            loading={isConnecting}
          >
            重试
          </Button>
        </div>
      )}
    </div>
  );
};
