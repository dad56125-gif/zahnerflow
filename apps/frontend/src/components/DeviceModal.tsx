import React from 'react';

interface DeviceModalProps {
  device: 'furnace' | 'mfc' | null;
  onClose: () => void;
  modalTop: number; // New prop
  modalLeft: number; // New prop
  modalWidth: number; // New prop
  modalHeight: number; // New prop
}

export const DeviceModal: React.FC<DeviceModalProps> = ({ device, onClose, modalTop, modalLeft, modalWidth, modalHeight }) => {
  if (!device) return null;
  // 保持对 props 的读取以避免 TS 未使用报错，但不用于布局，布局交由 CSS 控制
  void modalTop; void modalLeft; void modalWidth; void modalHeight;

  return (
    <div className="device-modal">
      <div className="device-modal-content">
        <div className="device-header">
          <h3>{device === 'furnace' ? '管式炉控制' : '流量计控制'}</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="device-controls-panel">
          {/* ... existing controls ... */}
          <div className="control-group">
            <label>当前状态</label>
            <span className="current-value">未连接</span>
          </div>
          <div className="control-group">
            <label>设定值</label>
            <input type="number" placeholder="输入设定值" />
            <span className="unit">{device === 'furnace' ? '°C' : 'sccm'}</span>
          </div>
          <div className="control-actions">
            <button className="btn btn-primary">应用</button>
            <button className="btn btn-secondary">读取</button>
          </div>
        </div>
      </div>
    </div>
  );
};
