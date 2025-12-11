/**
 * MFC专用Modal组件
 *
 * 从DeviceModal中分离出来的MFC设备管理界面
 * 支持WebSocket实时通信和多设备管理
 */

import React, { useEffect } from 'react';
import { Portal } from '../../components/Portal';
import { Button } from '../../shared/Button';
import type { MfcState, MfcControls } from './useMfc';
import { MFCDeviceCard } from './MFCDeviceCard';
import { MFCConnectionPanel } from './MFCConnectionPanel';
import { mfcWebSocketService } from './mfcWebSocket.service';

interface MFCModalProps {
  on_close: () => void;
  modal_top: number;
  modal_left: number;
  modal_width: number;
  modal_height: number;
  mfcState: MfcState;
  mfcControls: MfcControls;
}

export const MFCModal: React.FC<MFCModalProps> = ({
  on_close,
  modal_top,
  modal_left,
  modal_width,
  modal_height,
  mfcState,
  mfcControls
}) => {
  // 在MFC模态框打开时才确保WebSocket连接（仅执行一次）
  useEffect(() => {
    mfcControls.ensureConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 保持对 props 的读取以避免 TS 未使用报错
  void modal_top; void modal_left; void modal_width; void modal_height;

  return (
    <Portal isOpen={true} onClose={on_close} pointerEvents="auto" id="mfc-modal-portal">
      <div
        className="modal_content device-modal-content"
        style={{
          position: 'fixed',
          left: `calc(var(--sidebar-l))`,
          top: `calc(var(--canvas-t))`,
          width: 'calc(100vw - 2 * var(--space))',
          height: 'calc(100vh - 2 * var(--canvas-b))',
          background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.2) 0%, rgba(0, 0, 0, 0.4) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: 'var(--effect-xl)',
          backdropFilter: 'blur(var(--effect-xl))',
          WebkitBackdropFilter: 'blur(var(--effect-xl))',
          boxShadow: '0 16px 64px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'modal_scale_in 0.3s var(--ease-bounce)',
          isolation: 'isolate',
          pointerEvents: 'auto',
          zIndex: 2000
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal_header">
          <h3>质量流量控制器 (MFC)</h3>
          <div className="connection-status">
            <span className={`status-indicator ${mfcWebSocketService.connected ? 'connected' : 'disconnected'}`}></span>
            <span className="status-text">
              {mfcWebSocketService.connected ? '实时连接' : '离线'}
            </span>
            <span className={`connection-state-indicator ${mfcState.connection_status}`}>
              ({mfcState.connection_status === 'connected' ? '设备已连接' :
                mfcState.connection_status === 'connecting' ? '连接中...' :
                  mfcState.connection_status === 'error' ? '连接错误' : '未连接'})
            </span>
            {mfcState.connection_status === 'connected' && (
              <>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => mfcControls.scanDevices()}
                  disabled={mfcState.isLoading || mfcState.isScanning}
                  loading={mfcState.isScanning}
                >
                  重新扫描
                </Button>
                <Button
                  variant="danger"
                  size="small"
                  onClick={() => mfcControls.disconnect()}
                  disabled={mfcState.isLoading || mfcState.isScanning}
                >
                  断开
                </Button>
              </>
            )}
          </div>
          <button className="modal_close" onClick={on_close}>×</button>
        </div>

        {/* 扫描进度条 - 在header下方显示 */}
        {mfcState.isScanning && mfcState.scanProgress && (
          <div className="mfc-scan-progress-header">
            <div className="mfc-scan-progress-bar">
              <div
                className="mfc-scan-progress-fill"
                style={{ width: `${mfcState.scanProgress.percent}%` }}
              />
            </div>
            <span className="mfc-scan-progress-text">
              扫描中 {mfcState.scanProgress.percent}% | 地址 {mfcState.scanProgress.current} | 已发现 {mfcState.scanProgress.found_count} 个
            </span>
          </div>
        )}

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
                <div className="mfc-empty-state">
                  <div className="mfc-empty-icon">📡</div>
                  <h4>未发现MFC设备</h4>
                  <p>正在扫描端口设备...</p>
                  <span className="mfc-empty-hint">长时间无响应请检查连接</span>
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
    </Portal>
  );
};

export default MFCModal;