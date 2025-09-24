import React, { useState, useEffect } from 'react';

interface Device {
  id: string;
  name: string;
  type: 'potentiostat' | 'galvanostat' | 'multimeter' | 'temperature';
  manufacturer: string;
  model: string;
  serialNumber: string;
  status: 'connected' | 'disconnected' | 'error' | 'connecting';
  capabilities: string[];
  lastConnected?: Date;
  parameters?: Record<string, any>;
}

interface DevicePanelProps {
  isVisible: boolean;
  onDeviceConnect: (deviceId: string) => void;
  onDeviceDisconnect: (deviceId: string) => void;
}

export const DevicePanel: React.FC<DevicePanelProps> = ({ 
  isVisible, 
  onDeviceConnect, 
  onDeviceDisconnect 
}) => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // 模拟设备数据
  useEffect(() => {
    const mockDevices: Device[] = [
      {
        id: 'zahner-zennium-001',
        name: 'Zahner Zennium',
        type: 'potentiostat',
        manufacturer: 'Zahner-Elektrik',
        model: 'IM6',
        serialNumber: 'IM6-001',
        status: 'connected',
        capabilities: ['EIS', 'CV', 'LSV', 'CA', 'CP', 'OCV'],
        lastConnected: new Date(),
        parameters: {
          impedanceRange: '10 mΩ - 100 GΩ',
          frequencyRange: '10 μHz - 8 MHz',
          potentialRange: '±10 V',
          currentRange: '±2 A',
          resolution: '24-bit'
        }
      },
    {
      id: 'autolab-pgstat302n-003',
        name: 'Autolab PGSTAT302N',
        type: 'potentiostat',
        manufacturer: 'Metrohm Autolab',
        model: 'PGSTAT302N',
        serialNumber: '302N-003',
        status: 'error',
        capabilities: ['EIS', 'CV', 'LSV', 'CA', 'CP', 'OCV'],
        lastConnected: new Date(Date.now() - 3600000), // 1 hour ago
        parameters: {
          impedanceRange: '1 μΩ - 100 GΩ',
          frequencyRange: '10 μHz - 1 MHz',
          potentialRange: '±30 V',
          currentRange: '±10 A',
          resolution: '24-bit'
        }
      },
      {
        id: 'keithley-dmm6500-004',
        name: 'Keithley DMM6500',
        type: 'multimeter',
        manufacturer: 'Keithley Instruments',
        model: 'DMM6500',
        serialNumber: 'DMM6500-004',
        status: 'disconnected',
        capabilities: ['Voltage', 'Current', 'Resistance', 'Temperature'],
        parameters: {
          voltageRange: '±1000 V',
          currentRange: '±10 A',
          resistanceRange: '1 Ω - 100 MΩ',
          resolution: '6.5-digit'
        }
      }
    ];

    setDevices(mockDevices);
  }, []);

  const handleScanDevices = () => {
    setIsScanning(true);
    
    // 模拟扫描过程
    setTimeout(() => {
      setIsScanning(false);
      
      // 随机改变一些设备状态
      setDevices(prevDevices => 
        prevDevices.map(device => ({
          ...device,
          status: Math.random() > 0.7 ? 'connected' : device.status
        }))
      );
    }, 2000);
  };

  const handleDeviceConnect = (device: Device) => {
    if (device.status === 'disconnected') {
      setDevices(prevDevices =>
        prevDevices.map(d =>
          d.id === device.id 
            ? { ...d, status: 'connecting' as const }
            : d
        )
      );
      
      // 模拟连接过程
      setTimeout(() => {
        setDevices(prevDevices =>
          prevDevices.map(d =>
            d.id === device.id 
              ? { ...d, status: 'connected' as const, lastConnected: new Date() }
              : d
          )
        );
        onDeviceConnect(device.id);
      }, 1000);
    }
  };

  const handleDeviceDisconnect = (device: Device) => {
    if (device.status === 'connected') {
      setDevices(prevDevices =>
        prevDevices.map(d =>
          d.id === device.id 
            ? { ...d, status: 'disconnected' as const }
            : d
        )
      );
      onDeviceDisconnect(device.id);
    }
  };

  const getDeviceIcon = (type: Device['type']) => {
    switch (type) {
      case 'potentiostat':
        return '⚡';
      case 'galvanostat':
        return '🔋';
      case 'multimeter':
        return '📏';
      case 'temperature':
        return '🌡️';
      default:
        return '🔌';
    }
  };

  const getStatusColor = (status: Device['status']) => {
    switch (status) {
      case 'connected':
        return 'var(--color-success)';
      case 'connecting':
        return 'var(--color-warning)';
      case 'error':
        return 'var(--color-error)';
      case 'disconnected':
        return 'var(--color-text-disabled)';
      default:
        return 'var(--color-text-disabled)';
    }
  };

  const getStatusText = (status: Device['status']) => {
    switch (status) {
      case 'connected':
        return '已连接';
      case 'connecting':
        return '连接中';
      case 'error':
        return '错误';
      case 'disconnected':
        return '未连接';
      default:
        return '未知';
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="device-panel" style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--color-glass-bg)',
      backdropFilter: 'blur(var(--backdrop-blur))',
      WebkitBackdropFilter: 'blur(var(--backdrop-blur))'
    }}>
      {/* 标题 */}
      <div style={{
        padding: 'var(--spacing-md)',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-glass-bg)'
      }}>
        <h2 style={{
          fontSize: 'var(--font-size-base)',
          fontWeight: '600',
          margin: 0,
          color: 'var(--color-text-primary)'
        }}>
          设备管理
        </h2>
        <div style={{
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-secondary)',
          marginTop: '2px'
        }}>
          {devices.filter(d => d.status === 'connected').length} / {devices.length} 设备已连接
        </div>
      </div>

      {/* 工具栏 */}
      <div style={{
        padding: 'var(--spacing-md)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        gap: 'var(--spacing-sm)'
      }}>
        <button
          className="btn btn-primary"
          onClick={handleScanDevices}
          disabled={isScanning}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--spacing-xs)'
          }}
        >
          {isScanning ? '🔍 扫描中...' : '🔍 扫描设备'}
        </button>
        
        <button
          className="btn btn-secondary"
          onClick={() => {
            // 添加设备
          }}
          style={{
            padding: 'var(--spacing-sm)',
            minWidth: 'auto'
          }}
        >
          ➕
        </button>
      </div>

      {/* 设备列表 */}
      <div className="device-list" style={{
        flex: 1,
        overflowY: 'auto',
        padding: 'var(--spacing-md)'
      }}>
        {devices.map((device) => (
          <div
            key={device.id}
            className={`device-item ${selectedDevice?.id === device.id ? 'selected' : ''}`}
            onClick={() => setSelectedDevice(device)}
            style={{
              marginBottom: 'var(--spacing-md)',
              padding: 'var(--spacing-md)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-medium)',
              background: selectedDevice?.id === device.id 
                ? 'var(--color-primary)' 
                : 'var(--color-surface)',
              cursor: 'pointer',
              transition: 'all var(--duration-normal) var(--ease)'
            }}
          >
            {/* 设备头部 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--spacing-sm)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                <span style={{ fontSize: '24px' }}>
                  {getDeviceIcon(device.type)}
                </span>
                <div>
                  <div style={{ 
                    fontWeight: '500', 
                    color: selectedDevice?.id === device.id ? 'white' : 'var(--color-text-primary)'
                  }}>
                    {device.name}
                  </div>
                  <div style={{ 
                    fontSize: 'var(--font-size-xs)', 
                    color: selectedDevice?.id === device.id ? 'rgba(255,255,255,0.8)' : 'var(--color-text-secondary)'
                  }}>
                    {device.manufacturer} {device.model}
                  </div>
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                <span 
                  className="status-indicator" 
                  style={{ 
                    background: getStatusColor(device.status),
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%'
                  }}
                />
                <span style={{ 
                  fontSize: 'var(--font-size-xs)',
                  color: selectedDevice?.id === device.id ? 'white' : getStatusColor(device.status)
                }}>
                  {getStatusText(device.status)}
                </span>
              </div>
            </div>

            {/* 设备信息 */}
            <div style={{
              fontSize: 'var(--font-size-xs)',
              color: selectedDevice?.id === device.id ? 'rgba(255,255,255,0.8)' : 'var(--color-text-secondary)',
              marginBottom: 'var(--spacing-sm)'
            }}>
              <div>序列号: {device.serialNumber}</div>
              {device.lastConnected && (
                <div>最后连接: {device.lastConnected.toLocaleString()}</div>
              )}
            </div>

            {/* 功能标签 */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px',
              marginBottom: 'var(--spacing-sm)'
            }}>
              {device.capabilities.slice(0, 4).map((capability) => (
                <span
                  key={capability}
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    padding: '2px 6px',
                    background: selectedDevice?.id === device.id 
                      ? 'rgba(255,255,255,0.2)' 
                      : 'var(--color-background)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-small)',
                    color: selectedDevice?.id === device.id ? 'white' : 'var(--color-text-secondary)'
                  }}
                >
                  {capability}
                </span>
              ))}
              {device.capabilities.length > 4 && (
                <span style={{
                  fontSize: 'var(--font-size-xs)',
                  color: selectedDevice?.id === device.id ? 'rgba(255,255,255,0.6)' : 'var(--color-text-disabled)'
                }}>
                  +{device.capabilities.length - 4}
                </span>
              )}
            </div>

            {/* 操作按钮 */}
            <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
              {device.status === 'connected' && (
                <button
                  className="btn btn-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeviceDisconnect(device);
                  }}
                  style={{
                    flex: 1,
                    fontSize: 'var(--font-size-xs)',
                    background: selectedDevice?.id === device.id 
                      ? 'rgba(255,255,255,0.2)' 
                      : undefined,
                    color: selectedDevice?.id === device.id ? 'white' : undefined,
                    borderColor: selectedDevice?.id === device.id 
                      ? 'rgba(255,255,255,0.3)' 
                      : undefined
                  }}
                >
                  断开连接
                </button>
              )}
              
              {device.status === 'disconnected' && (
                <button
                  className="btn btn-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeviceConnect(device);
                  }}
                  style={{
                    flex: 1,
                    fontSize: 'var(--font-size-xs)'
                  }}
                >
                  连接
                </button>
              )}
              
              <button
                className="btn btn-glass"
                onClick={(e) => {
                  e.stopPropagation();
                }}
                style={{
                  padding: 'var(--spacing-xs) var(--spacing-sm)',
                  fontSize: 'var(--font-size-xs)',
                  minWidth: 'auto'
                }}
              >
                ⚙️
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 选中设备详情 */}
      {selectedDevice && (
        <div className="device-details" style={{
          borderTop: '1px solid var(--color-border)',
          padding: 'var(--spacing-md)',
          background: 'var(--color-surface)',
          maxHeight: '200px',
          overflowY: 'auto'
        }}>
          <h3 style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: '600',
            marginBottom: 'var(--spacing-sm)',
            color: 'var(--color-text-primary)'
          }}>
            设备详情 - {selectedDevice.name}
          </h3>
          
          {selectedDevice.parameters && (
            <div style={{ fontSize: 'var(--font-size-xs)' }}>
              {Object.entries(selectedDevice.parameters).map(([key, value]) => (
                <div key={key} style={{ marginBottom: '4px' }}>
                  <strong>{key}:</strong> {value}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};