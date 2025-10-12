import React from 'react';

interface DeviceHoverContentProps {
  deviceType: 'furnace' | 'mfc';
  position: { top: number; left: number };
  isVisible: boolean;
}

const DeviceHoverContent: React.FC<DeviceHoverContentProps> = ({ deviceType, position, isVisible }) => {
  if (!isVisible) return null;

  const content = deviceType === 'furnace' ? (
    <div className="device-hover-content">
      <h4>管式炉状态</h4>
      <div className="device-info">
        <span className="info-label">温度：</span>
        <span className="info-value">25°C</span>
      </div>
      <div className="device-info">
        <span className="info-label">状态：</span>
        <span className="info-value disconnected">未连接</span>
      </div>
    </div>
  ) : (
    <div className="device-hover-content">
      <h4>流量计状态</h4>
      <div className="device-info">
        <span className="info-label">流量：</span>
        <span className="info-value">0 sccm</span>
      </div>
      <div className="device-info">
        <span className="info-label">状态：</span>
        <span className="info-value disconnected">未连接</span>
      </div>
    </div>
  );

  return (
    <div
      className="device-hover-container glass show"
      style={{
        position: 'absolute',
        top: position.top,
        left: position.left,
        transform: 'translateX(-50%)',
      }}
    >
      {content}
    </div>
  );
};

export default DeviceHoverContent;
