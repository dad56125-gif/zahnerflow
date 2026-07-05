import React, { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SIMULATOR_SETTINGS,
  SIMULATOR_SETTINGS_EVENT,
  SimulatorSettings,
  loadSimulatorSettings,
  saveSimulatorSettings,
} from '../../modules/simulator/simulatorSettings';
import { writeDeveloperMode } from '../../modules/simulator/developerMode';

interface SimulatorControlPanelProps {
  onClose: () => void;
}

const furnaceProfiles = [
  { value: 'normal', label: '正常响应' },
  { value: 'timeout', label: '串口超时' },
  { value: 'invalid-response', label: '响应长度错误' },
  { value: 'disconnect', label: '设备断开' },
] as const;

const mfcProfiles = [
  { value: 'normal', label: '正常响应' },
  { value: 'timeout', label: '通信超时' },
  { value: 'protocol-error', label: '协议错误' },
  { value: 'scan-empty', label: '扫描无设备' },
  { value: 'disconnect', label: '设备断开' },
] as const;

const zahnerProfiles = [
  { value: 'normal', label: '正常测量' },
  { value: 'connect-fail', label: '连接拒绝' },
  { value: 'measure-fail', label: '测量失败' },
  { value: 'timeout', label: '测量超时' },
  { value: 'disconnect', label: '连接断开' },
] as const;

export const SimulatorControlPanel: React.FC<SimulatorControlPanelProps> = ({ onClose }) => {
  const [settings, setSettings] = useState<SimulatorSettings>(() => loadSimulatorSettings());

  useEffect(() => {
    setSettings(loadSimulatorSettings());
  }, []);

  useEffect(() => {
    const handleSettings = (event: Event) => {
      const customEvent = event as CustomEvent<SimulatorSettings>;
      if (customEvent.detail) setSettings(customEvent.detail);
    };
    window.addEventListener(SIMULATOR_SETTINGS_EVENT, handleSettings);
    return () => window.removeEventListener(SIMULATOR_SETTINGS_EVENT, handleSettings);
  }, []);

  const activeCount = useMemo(
    () => Object.values(settings.devices).filter((device) => device.enabled).length,
    [settings]
  );

  const updateSettings = (next: SimulatorSettings) => {
    setSettings(next);
    saveSimulatorSettings(next);
  };

  const setMasterEnabled = (enabled: boolean) => updateSettings({ ...settings, enabled });

  const reset = () => updateSettings(DEFAULT_SIMULATOR_SETTINGS);

  const exitDeveloperMode = () => {
    updateSettings(DEFAULT_SIMULATOR_SETTINGS);
    writeDeveloperMode(false);
    onClose();
  };

  return (
    <section className="modal__content sim-modal" role="dialog" aria-modal="true" aria-label="模拟控制面板">
      <div className="modal__header sim-modal__header">
        <div>
          <span className="sim-modal__eyebrow">Hidden Lab Controls</span>
          <h3>模拟控制面板</h3>
        </div>
        <button className="btn btn--sm btn--ghost btn--icon btn--rounded modal__close" onClick={onClose}>✕</button>
      </div>

      <div className="modal__body sim-modal__body">
        <div className="sim-panel__master">
          <div>
            <div className="sim-panel__master-title">模拟总开关</div>
            <div className="sim-panel__master-subtitle">
              当前 {settings.enabled ? `启用 ${activeCount} 个设备模拟` : '使用真实连接参数'}
            </div>
          </div>
          <label className="switch" title="启用或关闭全部模拟注入">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) => setMasterEnabled(event.target.checked)}
            />
            <span className="switch__track"><span className="switch__thumb" /></span>
          </label>
        </div>

        <div className="sim-panel__grid">
          <DeviceProfileCard
            title="Furnace"
            description="连接时改用 COM_SIMULATOR，并控制炉温状态/串口故障。"
            enabled={settings.devices.furnace.enabled}
            profile={settings.devices.furnace.profile}
            options={furnaceProfiles}
            onEnabledChange={(enabled) => updateSettings({
              ...settings,
              devices: { ...settings.devices, furnace: { ...settings.devices.furnace, enabled } },
            })}
            onProfileChange={(profile) => updateSettings({
              ...settings,
              devices: { ...settings.devices, furnace: { ...settings.devices.furnace, profile } },
            })}
          />
          <DeviceProfileCard
            title="MFC"
            description="连接时改用 COM_SIMULATOR，并控制扫描、协议和流量状态。"
            enabled={settings.devices.mfc.enabled}
            profile={settings.devices.mfc.profile}
            options={mfcProfiles}
            onEnabledChange={(enabled) => updateSettings({
              ...settings,
              devices: { ...settings.devices, mfc: { ...settings.devices.mfc, enabled } },
            })}
            onProfileChange={(profile) => updateSettings({
              ...settings,
              devices: { ...settings.devices, mfc: { ...settings.devices.mfc, profile } },
            })}
          />
          <DeviceProfileCard
            title="ZAHNER"
            description="启动工作流时改用 host=simulator，并控制连接/测量故障。"
            enabled={settings.devices.zahner.enabled}
            profile={settings.devices.zahner.profile}
            options={zahnerProfiles}
            onEnabledChange={(enabled) => updateSettings({
              ...settings,
              devices: { ...settings.devices, zahner: { ...settings.devices.zahner, enabled } },
            })}
            onProfileChange={(profile) => updateSettings({
              ...settings,
              devices: { ...settings.devices, zahner: { ...settings.devices.zahner, profile } },
            })}
          />
        </div>
      </div>

      <div className="modal__footer sim-panel__footer">
        <span>入口：连续点击顶部版本号 5 次解锁开发者模式，再点击 SIM 打开</span>
        <div className="sim-panel__footer-actions">
          <button className="btn btn--sm btn--secondary" onClick={reset}>恢复真实模式</button>
          <button className="btn btn--sm btn--ghost" onClick={exitDeveloperMode}>退出开发者模式</button>
        </div>
      </div>
    </section>
  );
};

type DeviceProfileCardProps<T extends string> = {
  title: string;
  description: string;
  enabled: boolean;
  profile: T;
  options: readonly { value: T; label: string }[];
  onEnabledChange: (enabled: boolean) => void;
  onProfileChange: (profile: T) => void;
};

function DeviceProfileCard<T extends string>({
  title,
  description,
  enabled,
  profile,
  options,
  onEnabledChange,
  onProfileChange,
}: DeviceProfileCardProps<T>) {
  return (
    <article className={`sim-device ${enabled ? 'is-enabled' : ''}`}>
      <div className="sim-device__header">
        <div>
          <h4>{title}</h4>
          <p>{description}</p>
        </div>
        <label className="switch" title={`${enabled ? '关闭' : '开启'} ${title} 模拟`}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
          />
          <span className="switch__track"><span className="switch__thumb" /></span>
        </label>
      </div>
      <fieldset className="sim-device__field" disabled={!enabled}>
        <legend>模拟工况</legend>
        <div className="sim-device__options">
          {options.map((option) => (
            <label key={option.value} className={`sim-choice ${profile === option.value ? 'is-selected' : ''}`}>
              <input
                type="radio"
                name={`sim-profile-${title}`}
                value={option.value}
                checked={profile === option.value}
                onChange={() => onProfileChange(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </article>
  );
}

export default SimulatorControlPanel;
