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

  return (
    <div
      className="device-modal"
      style={{
        position: 'fixed', // Use fixed positioning for Portal
        top: modalTop,
        left: modalLeft,
        width: modalWidth,
        height: modalHeight,
        // The z-index is already set in _modal.css using var(--z-modal)
        // which will be sufficient when rendered via Portal.
      }}
    >
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