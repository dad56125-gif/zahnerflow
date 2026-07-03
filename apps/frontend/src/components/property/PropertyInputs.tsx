import React, { useState, useEffect } from 'react';
import { Dropdown } from '../shared/Dropdown';
import { getParameterEnumLabel, getParameterPlaceholder, enumValues } from './propertyConfig';
import { MfcDeviceInfo } from '../../modules/mfc/mfcTypes';
import {
  FURNACE_TEMPERATURE_MAX_C,
  FURNACE_TEMPERATURE_MIN_C,
  FURNACE_TEMPERATURE_RANGE_LABEL
} from '../../modules/furnace/temperatureLimits';

const NUMBER_INPUT_PATTERN = /^[-+]?(?:\d+\.?\d*|\.\d*)?(?:[eE][-+]?\d*)?[kKmMuUμnN]?$/;
const NUMERIC_SUFFIX_MULTIPLIERS: Record<string, number> = {
  k: 1e3,
  K: 1e3,
  m: 1e-3,
  M: 1e6,
  u: 1e-6,
  U: 1e-6,
  μ: 1e-6,
  n: 1e-9,
  N: 1e-9,
};

const parseNumericInput = (input: string, fallback: number): number => {
  const trimmed = input.trim();
  if (!trimmed) return fallback;

  const suffix = trimmed.slice(-1);
  const multiplier = NUMERIC_SUFFIX_MULTIPLIERS[suffix];
  const numericPart = multiplier ? trimmed.slice(0, -1) : trimmed;
  const value = Number(numericPart);

  return Number.isFinite(value) ? value * (multiplier || 1) : fallback;
};

// --- 基础 Props ---
interface BaseInputProps {
  paramKey: string;
  value: any;
  defaultValue: any;
  onChange: (key: string, val: any) => void;
  // Dropdown 相关 props，由父组件传递
  dropdownState: {
    isOpen: boolean;
    isHiding: boolean;
    position: any;
    open: (id: string, e: React.MouseEvent) => void;
    close: (id: string) => void;
  };
  disabled?: boolean;
}

// --- 标准输入组件 ---
// ✅ 使用本地 state 暂存输入，只在 onBlur 时更新 store
export const StandardInput: React.FC<BaseInputProps & { type?: 'text' | 'number' }> = ({
  paramKey, value, defaultValue, onChange, type = 'text', disabled
}) => {
  const externalValue = value ?? defaultValue;
  const [localValue, setLocalValue] = useState(externalValue);
  const [isFocused, setIsFocused] = useState(false);

  // 外部值变化时同步（仅在未聚焦时）
  useEffect(() => {
    if (!isFocused) {
      setLocalValue(externalValue);
    }
  }, [externalValue, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (type === 'number') {
      if (NUMBER_INPUT_PATTERN.test(e.target.value)) {
        setLocalValue(e.target.value);
      }
    } else {
      setLocalValue(e.target.value);
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    if (type === 'number') {
      const fallback = Number(defaultValue ?? 0);
      const parsed = parseNumericInput(e.target.value, Number.isFinite(fallback) ? fallback : 0);
      onChange(paramKey, parsed);
    } else {
      onChange(paramKey, localValue);
    }
  };

  return (
    <input
      type="text"
      value={localValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className="input"
      placeholder={getParameterPlaceholder(paramKey)}
      disabled={disabled}
    />
  );
};

// --- 枚举/布尔 下拉组件 ---
export const EnumInput: React.FC<BaseInputProps & { options?: string[] }> = ({
  paramKey, value, defaultValue, onChange, dropdownState, options, disabled
}) => {
  const dropdownId = `enum-${paramKey}`;
  const val = value ?? defaultValue;

  // 处理 boolean 转换
  const isBool = typeof defaultValue === 'boolean';
  const effectiveOptions = isBool ? ['true', 'false'] : (options || enumValues[paramKey] || []);

  const getLabel = (v: string | boolean) => {
    // 优先尝试获取翻译标签 (即使是 boolean 也可以有翻译)
    const translated = getParameterEnumLabel(paramKey, String(v));
    if (translated !== String(v)) return translated;

    if (isBool) return v ? '启用' : '禁用';
    return translated;
  };

  return (
    <div className="dropdown-wrapper">
      <button
        type="button"
        className="btn btn--md btn--secondary btn--block dropdown-trigger"
        onClick={(e) => !disabled && dropdownState.open(dropdownId, e)}
        disabled={disabled}
      >
        <span>{getLabel(val)}</span>
        <svg className={`dropdown__arrow ${dropdownState.isOpen && dropdownState.position ? 'is-rotated' : ''}`} viewBox="-10 -6 20 12" width="12" height="12">
          <path d="M -8 -3 L 0 5 L 8 -3" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <Dropdown
        isOpen={dropdownState.isOpen && dropdownState.position?.id === dropdownId}
        isHiding={dropdownState.isHiding}
        onClose={() => dropdownState.close(dropdownId)}
        position={dropdownState.position || { top: 0, left: 0, width: 0 }}
      >
        {effectiveOptions.map((opt) => (
          <div
            key={opt}
            className={`dropdown__option ${String(val) === opt ? 'is-selected' : ''}`}
            onClick={() => {
              const finalVal = isBool ? (opt === 'true') : opt;
              onChange(paramKey, finalVal);
              dropdownState.close(dropdownId);
            }}
          >
            {getLabel(isBool ? (opt === 'true') : opt)}
          </div>
        ))}
      </Dropdown>
    </div>
  );
};

// --- Temperature 专用组件 (简化版) ---
// ✅ 统一使用本地 state，只在 onBlur 时更新 store
export const TemperatureInput: React.FC<BaseInputProps> = (props) => {
  const { paramKey, value, defaultValue, onChange } = props;
  const externalValue = value ?? defaultValue;
  const [localValue, setLocalValue] = useState(externalValue);
  const [isFocused, setIsFocused] = useState(false);

  // 外部值变化时同步（仅在未聚焦时）
  useEffect(() => {
    if (!isFocused) {
      setLocalValue(externalValue);
    }
  }, [externalValue, isFocused]);

  // 只读属性
  if (['currentTemperature', 'calculatedDuration', 'tolerance', 'stabilizationTime'].includes(paramKey)) {
    return (
      <input
        type="text"
        value={externalValue}
        disabled
        className="input glass disabled"
        placeholder={getParameterPlaceholder(paramKey)}
        title="运行时自动计算"
      />
    );
  }

  if (paramKey === 'targetTemperature') {
    return (
      <input
        type="text"
        value={localValue}
        onChange={(e) => {
          const val = e.target.value;
          if (/^\d*$/.test(val)) {
            setLocalValue(val);
          }
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={(e) => {
          setIsFocused(false);
          const val = e.target.value;
          if (!val) {
            onChange(paramKey, defaultValue);
            setLocalValue(defaultValue);
            return;
          }
          const numValue = Number(val);
          const correctedValue = Math.max(
            FURNACE_TEMPERATURE_MIN_C,
            Math.min(FURNACE_TEMPERATURE_MAX_C, numValue)
          );
          onChange(paramKey, correctedValue);
          setLocalValue(correctedValue);
        }}
        className="input glass"
        min={FURNACE_TEMPERATURE_MIN_C}
        max={FURNACE_TEMPERATURE_MAX_C}
        step={1}
        placeholder={getParameterPlaceholder(paramKey)}
        title={`目标温度 (${FURNACE_TEMPERATURE_RANGE_LABEL})`}
      />
    );
  }

  if (paramKey === 'rate') {
    return (
      <input
        type="text"
        value={localValue}
        onChange={(e) => {
          const val = e.target.value;
          if (/^\d*\.?\d?$/.test(val)) {
            setLocalValue(val);
          }
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={(e) => {
          setIsFocused(false);
          const val = e.target.value;
          if (!val) {
            onChange(paramKey, defaultValue);
            setLocalValue(defaultValue);
            return;
          }
          const numValue = Number(val);
          const correctedValue = Math.max(0.1, Math.min(20, numValue));
          onChange(paramKey, correctedValue);
          setLocalValue(correctedValue);
        }}
        className="input glass"
        min={0.1}
        max={20}
        step={0.1}
        placeholder={getParameterPlaceholder(paramKey)}
        title="温度变化速率 (0.1-20 °C/min)"
      />
    );
  }

  return <StandardInput {...props} type="number" />;
};

// --- MFC 专用组件 (简化版) ---
// ✅ 统一使用本地 state，只在 onBlur 时更新 store
export const GasFlowInput: React.FC<BaseInputProps & { availableDevices: MfcDeviceInfo[] }> = (props) => {
  const { paramKey, availableDevices, value, defaultValue, onChange, dropdownState } = props;
  const externalValue = value ?? defaultValue;
  const [localValue, setLocalValue] = useState(externalValue);
  const [isFocused, setIsFocused] = useState(false);

  // 外部值变化时同步（仅在未聚焦时）
  useEffect(() => {
    if (!isFocused) {
      setLocalValue(externalValue);
    }
  }, [externalValue, isFocused]);

  if (paramKey === 'deviceSelection') {
    const dropdownId = 'mfc-device-selection';
    const currentValue = value ?? defaultValue;

    // 转换真实设备信息为下拉选择格式
    const deviceOptions = availableDevices.length > 0
      ? availableDevices.map(d => ({
        value: `${d.address}:${d.gasType}`,
        label: `${d.address}:${d.gasType}`,
        maxFlow: d.maxFlowSccm
      }))
      : [{ value: '', label: '未检测到MFC设备', maxFlow: 0 }];

    const selectedDevice = deviceOptions.find(d => d.value === currentValue);
    const label = selectedDevice?.label || '选择设备';

    return (
      <div className="dropdown-wrapper">
        <button
          type="button"
          className="btn btn--md btn--secondary btn--block dropdown-trigger"
          onClick={(e) => dropdownState.open(dropdownId, e)}
          title="选择MFC设备和气体类型"
        >
          <span>{label}</span>
          <svg className={`dropdown__arrow ${dropdownState.isOpen && dropdownState.position?.id === dropdownId ? 'is-rotated' : ''}`} viewBox="-10 -6 20 12" width="12" height="12">
            <path d="M -8 -3 L 0 5 L 8 -3" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <Dropdown
          isOpen={dropdownState.isOpen && dropdownState.position?.id === dropdownId}
          isHiding={dropdownState.isHiding}
          onClose={() => dropdownState.close(dropdownId)}
          position={dropdownState.position || { top: 0, left: 0, width: 0 }}
        >
          {deviceOptions.map(d => (
            <div key={d.value} className={`dropdown__option ${currentValue === d.value ? 'is-selected' : ''}`} onClick={() => {
              if (d.value) {
                // 只需要触发 deviceSelection，RightPanel 会处理所有字段更新
                onChange('deviceSelection', d.value);
              }
              dropdownState.close(dropdownId);
            }}>
              {d.label}
            </div>
          ))}
        </Dropdown>
      </div>
    )
  }

  if (paramKey === 'targetFlowRate') {
    const maxFlow = 200; // MFC 最大流量上限 200 sccm
    return (
      <input
        type="text"
        value={localValue}
        onChange={(e) => {
          const val = e.target.value;
          if (/^\d*\.?\d?$/.test(val)) {
            setLocalValue(val);
          }
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={(e) => {
          setIsFocused(false);
          const val = e.target.value;
          if (!val) {
            onChange(paramKey, defaultValue);
            setLocalValue(defaultValue);
            return;
          }
          const numValue = Number(val);
          const correctedValue = Math.max(0, Math.min(maxFlow, numValue));
          onChange(paramKey, correctedValue);
          setLocalValue(correctedValue);
        }}
        className="input glass"
        min={0}
        max={maxFlow}
        step={0.1}
        placeholder={getParameterPlaceholder(paramKey)}
        title={`目标流量 (0-${maxFlow} sccm)`}
      />
    );
  }

  // 禁用运行时自动计算的参数
  if (['currentFlowRate', 'deviceAddress', 'gasType', 'maxFlowSccm', 'stabilizationTime'].includes(paramKey)) {
    return <input type="text" value={externalValue} disabled className="input glass disabled" />;
  }

  return <StandardInput {...props} type="number" />;
};
