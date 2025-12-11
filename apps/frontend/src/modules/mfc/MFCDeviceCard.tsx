/**
 * MFC 设备卡片组件
 *
 * 显示单个MFC设备的状态和控制界面，集成真实的API调用
 */

import React, { useState, useCallback } from 'react';
import { MfcDevice, DeviceCardProps } from './mfcTypes';
import { Button } from '../../shared/Button';

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
  const [flowInputValue, setFlowInputValue] = useState<string>(
    (device.set_flow ?? 0).toString()
  );
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
      case 'connected': return 'var(--color-success)';
      case 'warning': return 'var(--color-warning)';
      case 'error': return 'var(--color-danger)';
      default: return 'var(--text-muted)';
    }
  }, [device.status]);

  // 处理流量设定
  const handleSetFlow = useCallback(async () => {
    const sccm = parseFloat(flowInputValue);

    if (isNaN(sccm)) {
      setError('请输入有效数字');
      return;
    }
    if (sccm < 0 || sccm > device.max_flow_sccm) {
      setError(`范围 0 - ${device.max_flow_sccm}`);
      return;
    }

    setIsSettingFlow(true);
    setError(null);

    try {
      await onSetFlow?.(device.address, sccm);
      setFlowInputValue(sccm.toString());
    } catch (err) {
      setError(`失败: ${err instanceof Error ? err.message : '未知'}`);
      setFlowInputValue(device.set_flow.toString());
    } finally {
      setIsSettingFlow(false);
    }
  }, [flowInputValue, device.address, device.max_flow_sccm, device.set_flow, onSetFlow]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSetFlow();
  }, [handleSetFlow]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFlowInputValue(e.target.value);
    setError(null);
  }, []);

  const formatFlow = useCallback((flow: number) => {
    return (flow ?? 0).toFixed(1);
  }, []);

  const getPercent = useCallback((flow: number) => {
    if (!device.max_flow_sccm) return '0';
    return ((flow / device.max_flow_sccm) * 100).toFixed(0);
  }, [device.max_flow_sccm]);

  return (
    <div className={`mfc-card ${loading ? 'loading' : ''} ${disabled ? 'disabled' : ''}`}>
      {/* 头部：地址 + 气体 + 最大流量 + 状态 */}
      <div className="mfc-card-head">
        <div className="mfc-card-title">
          <span className="mfc-addr">{device.address}</span>
          <span className="mfc-gas">{device.gas_type}</span>
          <span className="mfc-max">{device.max_flow_sccm} sccm</span>
        </div>
        <div className="mfc-status" style={{ color: getStatusColor() }}>●</div>
      </div>

      {/* 主体：左控制 + 右图表 */}
      <div className="mfc-card-main">
        {/* 左侧：流量数值 + 输入控制 */}
        <div className="mfc-control">
          <div className="mfc-values">
            <div className="mfc-value-row">
              <span className="mfc-label">实际</span>
              <span className="mfc-flow">{formatFlow(device.flow_sccm)}</span>
              <span className="mfc-unit">sccm</span>
            </div>
            <div className="mfc-value-row">
              <span className="mfc-label">设定</span>
              <span className="mfc-flow mfc-flow-set">{formatFlow(device.set_flow)}</span>
              <span className="mfc-unit">sccm</span>
            </div>
          </div>

          <div className="mfc-input-row">
            <input
              type="number"
              value={flowInputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={disabled || isSettingFlow || loading}
              min="0"
              max={device.max_flow_sccm}
              step="0.1"
              className="mfc-input"
              placeholder="sccm"
            />
            <Button
              variant="primary"
              size="small"
              loading={isSettingFlow}
              onClick={handleSetFlow}
              disabled={disabled || loading}
            >
              设置
            </Button>
          </div>
          {error && <div className="mfc-error">{error}</div>}
        </div>

        {/* 右侧：双柱状图水平并排 */}
        <div className="mfc-bars">
          <div className="mfc-bar-col">
            <div className="mfc-bar-wrap">
              <div className="mfc-bar-bg">
                <div className="mfc-bar-fill mfc-bar-actual" style={{ height: `${getFlowBarHeight()}%` }} />
              </div>
            </div>
            <span className="mfc-bar-label">{getPercent(device.flow_sccm)}%</span>
          </div>
          <div className="mfc-bar-col">
            <div className="mfc-bar-wrap">
              <div className="mfc-bar-bg">
                <div className="mfc-bar-fill mfc-bar-setpoint" style={{ height: `${getSetFlowBarHeight()}%` }} />
              </div>
            </div>
            <span className="mfc-bar-label">{getPercent(device.set_flow)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MFCDeviceCard;