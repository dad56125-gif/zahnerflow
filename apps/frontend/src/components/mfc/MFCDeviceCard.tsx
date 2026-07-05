/**
 * MFC 设备卡片组件
 *
 * 显示单个MFC设备的状态和控制界面，集成真实的API调用
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { MfcDevice, DeviceCardProps } from '../../modules/mfc/mfcTypes';
import { SpacedCjkText } from '../common/SpacedCjkText';

interface MFCDeviceCardProps extends Omit<DeviceCardProps, 'device'> {
  device: MfcDevice;
  onSetFlow?: (address: number, sccm: number) => Promise<void>;
  loading?: boolean;
  disabled?: boolean;
}

const SET_FLOW_WAITING_DELAY_MS = 350;

/**
 * MFC 设备卡片组件
 */
export const MFCDeviceCard: React.FC<MFCDeviceCardProps> = ({
  device,
  onSetFlow,
  loading = false,
  disabled = false,
}) => {
  const [flowInputValue, setFlowInputValue] = useState<string>('');
  const [isSettingFlow, setIsSettingFlow] = useState(false);
  const [showSetFlowWaiting, setShowSetFlowWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settingFlowRef = useRef(false);

  useEffect(() => {
    if (!isSettingFlow) {
      setShowSetFlowWaiting(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setShowSetFlowWaiting(true);
    }, SET_FLOW_WAITING_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [isSettingFlow]);

  // 计算流量柱状图高度
  const getFlowBarHeight = useCallback(() => {
    if (device.maxFlowSccm === 0) return 0;
    return (device.flowSccm / device.maxFlowSccm) * 100;
  }, [device.flowSccm, device.maxFlowSccm]);

  const getSetFlowBarHeight = useCallback(() => {
    if (device.maxFlowSccm === 0) return 0;
    return (device.setFlow / device.maxFlowSccm) * 100;
  }, [device.setFlow, device.maxFlowSccm]);

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
    if (settingFlowRef.current) return;

    const submittedValue = flowInputValue.trim();
    const sccm = parseFloat(submittedValue);

    if (isNaN(sccm)) {
      setError('请输入有效数字');
      return;
    }
    if (sccm < 0 || sccm > device.maxFlowSccm) {
      setError(`范围 0 - ${device.maxFlowSccm}`);
      return;
    }

    settingFlowRef.current = true;
    setIsSettingFlow(true);
    setError(null);

    try {
      await onSetFlow?.(device.address, sccm);
      setFlowInputValue((current) => current.trim() === submittedValue ? '' : current);
    } catch (err) {
      setError(`失败: ${err instanceof Error ? err.message : '未知'}`);
      setFlowInputValue(device.setFlow.toString());
    } finally {
      settingFlowRef.current = false;
      setIsSettingFlow(false);
    }
  }, [flowInputValue, device.address, device.maxFlowSccm, device.setFlow, onSetFlow]);

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
    if (!device.maxFlowSccm) return '0';
    return ((flow / device.maxFlowSccm) * 100).toFixed(0);
  }, [device.maxFlowSccm]);
  const isActiveDevice = Number(device.setFlow) > 0;

  return (
    <div className={`mfc__card ${isActiveDevice ? 'is-active-device' : 'is-idle-device'} ${loading ? 'is-loading' : ''} ${disabled ? 'is-disabled' : ''}`}>
      {/* 头部：地址 + 气体 + 最大流量 + 状态 */}
      <div className="mfc__card-head">
        <div className="mfc__card-title">
          <span className="mfc__addr">{device.address}</span>
          <span className="mfc__gas">{device.gasType}</span>
          <span className="mfc__max">{device.maxFlowSccm} sccm</span>
        </div>
        <div className="mfc__status" style={{ color: getStatusColor() }}>●</div>
      </div>

      {/* 主体：左控制 + 右图表 */}
      <div className="mfc__card-main">
        {/* 左侧：流量数值 + 输入控制 */}
        <div className="mfc__control">
          <div className="mfc__values">
            <div className="mfc__value-row">
              <span className="mfc__label"><SpacedCjkText text="实际" /></span>
              <span className="mfc__flow">{formatFlow(device.flowSccm)}</span>
              <span className="mfc__unit">sccm</span>
            </div>
            <div className="mfc__value-row">
              <span className="mfc__label"><SpacedCjkText text="设定" /></span>
              <span className="mfc__flow mfc__flow--set">{formatFlow(device.setFlow)}</span>
              <span className="mfc__unit">sccm</span>
            </div>
          </div>

          <div className="mfc__input-row">
            <input
              type="number"
              value={flowInputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={disabled || loading}
              min="0"
              max={device.maxFlowSccm}
              step="0.1"
              className="input mfc__input"
              placeholder="sccm"
            />
            <button
              className="btn btn--sm btn--primary"
              onClick={handleSetFlow}
              disabled={disabled || loading}
              aria-busy={isSettingFlow}
              aria-disabled={disabled || loading || isSettingFlow}
            >
              <SpacedCjkText text={showSetFlowWaiting ? '等待' : '设置'} />
            </button>
          </div>
          {error && <div className="mfc__error"><SpacedCjkText text={error} /></div>}
        </div>

        {isActiveDevice && (
          <div className="mfc__bars">
            <div className="mfc__bar-col">
              <div className="mfc__bar-wrap">
                <div className="mfc__bar-bg">
                  <div className="mfc__bar-fill mfc__bar-fill--actual" style={{ height: `${getFlowBarHeight()}%` }} />
                </div>
              </div>
              <span className="mfc__bar-label">{getPercent(device.flowSccm)}%</span>
            </div>
            <div className="mfc__bar-col">
              <div className="mfc__bar-wrap">
                <div className="mfc__bar-bg">
                  <div className="mfc__bar-fill mfc__bar-fill--setpoint" style={{ height: `${getSetFlowBarHeight()}%` }} />
                </div>
              </div>
              <span className="mfc__bar-label">{getPercent(device.setFlow)}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MFCDeviceCard;
