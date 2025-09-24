import React, { useState } from 'react';
import { MeasurementType } from '@zahnerflow/types';

interface NodeComponentProps {
  node: any;
  onUpdate: (node: any) => void;
}

interface ParameterInputProps {
  label: string;
  type: 'number' | 'text' | 'select';
  value: any;
  onChange: (value: any) => void;
  step?: number;
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
  placeholder?: string;
  unit?: string;
}

const ParameterInput: React.FC<ParameterInputProps> = ({
  label,
  type,
  value,
  onChange,
  step = 0.001,
  min,
  max,
  options,
  placeholder,
  unit
}) => {
  if (type === 'select' && options) {
    return (
      <div className="parameter-group">
        <label className="parameter-label">{label}</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="parameter-select"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="parameter-group">
      <label className="parameter-label">
        {label}
        {unit && <span className="parameter-unit">({unit})</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(type === 'number' ? parseFloat(e.target.value) : e.target.value)}
        step={step}
        min={min}
        max={max}
        className="parameter-input"
        placeholder={placeholder}
      />
    </div>
  );
};

export const EISGalvanostaticNode: React.FC<NodeComponentProps> = ({ node, onUpdate }) => {
  const [parameters, setParameters] = useState(node.parameters || {
    measurement_type: MeasurementType.EIS_GALVANOSTATIC,
    output_path: 'C:\\THALES\\temp\\eis_data',
    naming_mode: 'COUNTER',
    counter: 1,
    filename: 'eis_galvanostatic',
    measurement_duration: 60.0,
    sampling_interval: 1.0,
    enable_dc_bias: false,
    eis_lower_frequency: 0.1,
    eis_upper_frequency: 100000.0,
    eis_start_frequency: 1000.0,
    eis_lower_periods: 4,
    eis_upper_periods: 20,
    eis_lower_steps: 5,
    eis_upper_steps: 10,
    eis_scan_direction: 'START_TO_MIN',
    eis_scan_strategy: 'SINGLE_SINE',
    eis_amplitude: 0.01,
    eis_current: 0.01
  });

  const handleParameterChange = (key: string, value: any) => {
    const newParameters = { ...parameters, [key]: value };
    setParameters(newParameters);
    onUpdate({ ...node, parameters: newParameters });
  };

  return (
    <div className="node-content">
      <div className="node-header">
        <span className="node-icon">📊</span>
        <span className="node-title">恒电流EIS测量</span>
      </div>

      <div className="node-parameters">
        <ParameterInput
          label="输出路径"
          type="text"
          value={parameters.output_path}
          onChange={(value) => handleParameterChange('output_path', value)}
          placeholder="/path/to/output"
        />

        <ParameterInput
          label="文件名"
          type="text"
          value={parameters.filename}
          onChange={(value) => handleParameterChange('filename', value)}
          placeholder="eis_data"
        />

        <ParameterInput
          label="命名模式"
          type="select"
          value={parameters.naming_mode}
          onChange={(value) => handleParameterChange('naming_mode', value)}
          options={[
            { value: 'COUNTER', label: '计数器' },
            { value: 'DATE_TIME', label: '日期时间' },
            { value: 'INDIVIDUAL', label: '独立' }
          ]}
        />

        <ParameterInput
          label="计数器起始值"
          type="number"
          value={parameters.counter}
          onChange={(value) => handleParameterChange('counter', value)}
          min={1}
          step={1}
        />

        <ParameterInput
          label="起始频率 (Hz)"
          type="number"
          value={parameters.eis_start_frequency}
          onChange={(value) => handleParameterChange('eis_start_frequency', value)}
          min={0.001}
          step={0.1}
        />

        <ParameterInput
          label="最低频率 (Hz)"
          type="number"
          value={parameters.eis_lower_frequency}
          onChange={(value) => handleParameterChange('eis_lower_frequency', value)}
          min={0.001}
          step={0.1}
        />

        <ParameterInput
          label="最高频率 (Hz)"
          type="number"
          value={parameters.eis_upper_frequency}
          onChange={(value) => handleParameterChange('eis_upper_frequency', value)}
          min={0.001}
          step={0.1}
        />

        <ParameterInput
          label="低频段周期数"
          type="number"
          value={parameters.eis_lower_periods}
          onChange={(value) => handleParameterChange('eis_lower_periods', value)}
          min={1}
          step={1}
        />

        <ParameterInput
          label="高频段周期数"
          type="number"
          value={parameters.eis_upper_periods}
          onChange={(value) => handleParameterChange('eis_upper_periods', value)}
          min={1}
          step={1}
        />

        <ParameterInput
          label="低频段步数"
          type="number"
          value={parameters.eis_lower_steps}
          onChange={(value) => handleParameterChange('eis_lower_steps', value)}
          min={1}
          step={1}
        />

        <ParameterInput
          label="高频段步数"
          type="number"
          value={parameters.eis_upper_steps}
          onChange={(value) => handleParameterChange('eis_upper_steps', value)}
          min={1}
          step={1}
        />

        <ParameterInput
          label="扫描方向"
          type="select"
          value={parameters.eis_scan_direction}
          onChange={(value) => handleParameterChange('eis_scan_direction', value)}
          options={[
            { value: 'START_TO_MIN', label: '起始到最小' },
            { value: 'START_TO_MAX', label: '起始到最大' },
            { value: 'MIN_TO_START', label: '最小到起始' },
            { value: 'MAX_TO_START', label: '最大到起始' }
          ]}
        />

        <ParameterInput
          label="扫描策略"
          type="select"
          value={parameters.eis_scan_strategy}
          onChange={(value) => handleParameterChange('eis_scan_strategy', value)}
          options={[
            { value: 'SINGLE_SINE', label: '单正弦' },
            { value: 'MULTI_SINE', label: '多正弦' },
            { value: 'NOISE', label: '噪声' }
          ]}
        />

        <ParameterInput
          label="测量幅度 (A)"
          type="number"
          value={parameters.eis_current}
          onChange={(value) => handleParameterChange('eis_current', value)}
          step={0.001}
        />

        <ParameterInput
          label="启用直流偏置"
          type="select"
          value={parameters.enable_dc_bias}
          onChange={(value) => handleParameterChange('enable_dc_bias', value)}
          options={[
            { value: 'true', label: '是' },
            { value: 'false', label: '否' }
          ]}
        />

        <ParameterInput
          label="测量持续时间 (s)"
          type="number"
          value={parameters.measurement_duration}
          onChange={(value) => handleParameterChange('measurement_duration', value)}
          min={1}
          step={0.1}
        />

        <ParameterInput
          label="采样间隔 (s)"
          type="number"
          value={parameters.sampling_interval}
          onChange={(value) => handleParameterChange('sampling_interval', value)}
          min={0.1}
          step={0.1}
        />
      </div>
    </div>
  );
};