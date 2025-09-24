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

export const ChronoamperometryNode: React.FC<NodeComponentProps> = ({ node, onUpdate }) => {
  const [parameters, setParameters] = useState(node.parameters || {
    measurement_type: MeasurementType.CHRONOAMPEROMETRY,
    output_path: '/tmp/ca_data',
    naming_mode: 'COUNTER',
    counter: 1,
    filename: 'ca_data',
    measurement_duration: 60.0,
    sampling_interval: 1.0,
    polarization_voltage: 1.0,
    min_current: -1.0,
    max_current: 1.0
  });

  const handleParameterChange = (key: string, value: any) => {
    const newParameters = { ...parameters, [key]: value };
    setParameters(newParameters);
    onUpdate({ ...node, parameters: newParameters });
  };

  return (
    <div className="node-content">
      <div className="node-header">
        <span className="node-icon">⏱️</span>
        <span className="node-title">计时安培法</span>
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
          placeholder="ca_data"
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
          label="极化电压 (V)"
          type="number"
          value={parameters.polarization_voltage}
          onChange={(value) => handleParameterChange('polarization_voltage', value)}
          step={0.001}
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

        <ParameterInput
          label="最小电流 (A)"
          type="number"
          value={parameters.min_current}
          onChange={(value) => handleParameterChange('min_current', value)}
          step={0.001}
        />

        <ParameterInput
          label="最大电流 (A)"
          type="number"
          value={parameters.max_current}
          onChange={(value) => handleParameterChange('max_current', value)}
          step={0.001}
        />
      </div>
    </div>
  );
};