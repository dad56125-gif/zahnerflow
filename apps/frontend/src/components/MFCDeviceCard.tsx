/**
 * MFC 设备卡片组件
 *
 * 显示单个MFC设备的状态和控制界面，集成真实的API调用
 */

import React, { useState, useCallback } from 'react';
import { MfcDevice, DeviceCardProps } from '../types/devices';

interface MFCDeviceCardProps extends Omit<DeviceCardProps, 'device'> {
  device: MfcDevice;
  onSetFlow?: (address: number, sccm: number) => Promise<void>;
  loading?: boolean;
  disabled?: boolean;
}

/**
 * MFC 设备卡片组件
 */
export const MFCDeviceCard: React.FC<MFCDeviceCardProps> = ({
  device,
  onSetFlow,
  loading = false,
  disabled = false,
}) => {
  // 组件内部状态
  const [flowInputValue, setFlowInputValue] = useState<string>(device.set_flow.toString());
  const [isSettingFlow, setIsSettingFlow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 计算流量柱状图高度
  const getFlowBarHeight = useCallback(() => {
    if (device.max_flow_sccm === 0) return 0;
    return (device.flow_sccm / device.max_flow_sccm) * 100;
  }, [device.flow_sccm, device.max_flow_sccm]);

  const getSetFlowBarHeight = useCallback(() => {
    if (device.max_flow_sccm === 0) return 0;
    return (device.set_flow / device.max_flow_sccm) * 100;
  }, [device.set_flow, device.max_flow_sccm]);

  // 获取状态颜色
  const getStatusColor = useCallback(() => {
    switch (device.status) {
      case 'connected': return '#4CAF50';
      case 'warning': return '#FF9800';
      case 'error': return '#F44336';
      default: return '#9E9E9E';
    }
  }, [device.status]);

  // 获取状态文本
  const getStatusText = useCallback(() => {
    switch (device.status) {
      case 'connected': return '已连接';
      case 'warning': return '警告';
      case 'error': return '错误';
      default: return '断开';
    }
  }, [device.status]);

  // 处理流量设定
  const handleSetFlow = useCallback(async () => {
    const sccm = parseFloat(flowInputValue);

    // 验证输入
    if (isNaN(sccm)) {
      setError('请输入有效的数字');
      return;
    }

    if (sccm < 0) {
      setError('流量不能为负数');
      return;
    }

    if (sccm > device.max_flow_sccm) {
      setError(`流量不能超过设备最大值 ${device.max_flow_sccm} sccm`);
      return;
    }

    setIsSettingFlow(true);
    setError(null);

    try {
      await onSetFlow?.(device.address, sccm);
      // 成功后更新输入值
      setFlowInputValue(sccm.toString());
    } catch (error) {
      setError(`设置失败: ${error instanceof Error ? error.message : '未知错误'}`);
      // 恢复原始值
      setFlowInputValue(device.set_flow.toString());
    } finally {
      setIsSettingFlow(false);
    }
  }, [flowInputValue, device.address, device.max_flow_sccm, device.set_flow, onSetFlow]);

  
  // 处理键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSetFlow();
    }
  }, [handleSetFlow]);

  // 处理输入变化
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFlowInputValue(e.target.value);
    setError(null);
  }, []);

  // 格式化流量显示
  const formatFlow = useCallback((flow: number) => {
    if (flow === undefined || flow === null || isNaN(flow)) {
      return '0.0';
    }
    return flow.toFixed(1);
  }, []);

  // 安全获取百分比
  const safeGetPercentage = useCallback((flow: number, maxFlow: number) => {
    if (maxFlow === undefined || maxFlow === null || maxFlow === 0 || isNaN(maxFlow)) {
      return '0.0';
    }
    if (flow === undefined || flow === null || isNaN(flow)) {
      return '0.0';
    }
    const percentage = (flow / maxFlow) * 100;
    return percentage.toFixed(1);
  }, []);

  return (
    <div className={`mfc-device-card glass ${loading ? 'loading' : ''} ${disabled ? 'disabled' : ''}`}>
      {/* 卡片头部 */}
      <div className="mfc-card-header">
        <div className="mfc-device-info">
          <span className="mfc-device-id">MFC {device.address}</span>
          <span className="mfc-gas-type">
            {device.gas_type} ({device.max_flow_sccm} sccm)
          </span>
        </div>
        <div className="mfc-status-indicator">
          <div
            className="status-light"
            style={{ backgroundColor: getStatusColor() }}
          />
          <span className="status-text">{getStatusText()}</span>
        </div>
      </div>

      {/* 卡片主体 */}
      <div className="mfc-card-body">
        {/* 左侧控制区 */}
        <div className="mfc-left-panel">
          {/* 流量显示 */}
          <div className="mfc-flow-display">
            <div className="flow-value-display">
              <div className="flow-actual">
                <span className="flow-label">实际流量</span>
                <span className="flow-value">
                  {formatFlow(device.flow_sccm)} sccm
                </span>
              </div>
              <div className="flow-setpoint">
                <span className="flow-label">设定流量</span>
                <span className="flow-value">
                  {formatFlow(device.set_flow)} sccm
                </span>
              </div>
            </div>
          </div>

          {/* 控制区 */}
          <div className="mfc-card-controls">
            {/* 流量输入 */}
            <div className="flow-input-group">
              <label>设定 (sccm)</label>
              <div className="input-with-button">
                <input
                  type="number"
                  value={flowInputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  disabled={disabled || isSettingFlow || loading}
                  min="0"
                  max={device.max_flow_sccm}
                  step="0.1"
                  className="flow-input"
                />
                <button
                  className={`btn btn-sm ${isSettingFlow ? 'btn-loading' : 'btn-primary'}`}
                  onClick={handleSetFlow}
                  disabled={disabled || isSettingFlow || loading}
                >
                  {isSettingFlow ? '设置中...' : '设置'}
                </button>
              </div>
              {error && (
                <div className="error-message">{error}</div>
              )}
            </div>

                      </div>
        </div>

        {/* 右侧图表区 */}
        <div className="mfc-right-panel">
          <div className="flow-charts-container">
            {/* 实际流量柱状图 */}
            <div className="flow-chart-item">
              <div className="chart-title">实际</div>
              <div className="flow-bar-container">
                <div className="flow-bar-wrapper">
                  <div className="flow-bar-background">
                    <div
                      className="flow-bar-actual"
                      style={{ height: `${getFlowBarHeight()}%` }}
                    />
                  </div>
                </div>
                <div className="flow-bar-value">
                  {formatFlow(device.flow_sccm)}
                </div>
              </div>
            </div>

            {/* 设定流量柱状图 */}
            <div className="flow-chart-item">
              <div className="chart-title">设定</div>
              <div className="flow-bar-container">
                <div className="flow-bar-wrapper">
                  <div className="flow-bar-background">
                    <div
                      className="flow-bar-setpoint"
                      style={{ height: `${getSetFlowBarHeight()}%` }}
                    />
                  </div>
                </div>
                <div className="flow-bar-value">
                  {formatFlow(device.set_flow)}
                </div>
              </div>
            </div>
          </div>

          {/* 百分比显示 */}
          <div className="flow-percentages">
            <div className="percentage-item">
              <span className="percentage-label">实际:</span>
              <span className="percentage-value">
                {safeGetPercentage(device.flow_sccm, device.max_flow_sccm)}%
              </span>
            </div>
            <div className="percentage-item">
              <span className="percentage-label">设定:</span>
              <span className="percentage-value">
                {safeGetPercentage(device.set_flow, device.max_flow_sccm)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 加载遮罩 */}
      {(loading || isSettingFlow) && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
        </div>
      )}
    </div>
  );
};

export default MFCDeviceCard;