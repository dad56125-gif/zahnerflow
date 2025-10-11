import React, { useState } from 'react';
import { MeasurementType } from '@zahnerflow/types';
import { ParameterInput } from '../components/ParameterInput';

interface NodeComponentProps {
  node: any;
  onUpdate: (node: any) => void;
}

export const ChronopotentiometryNode: React.FC<NodeComponentProps> = ({ node, onUpdate }) => {
  const [parameters, setParameters] = useState(node.parameters || {
    measurement_type: MeasurementType.CHRONOPOTENTIOMETRY,
    output_path: '/tmp/cp_data',
    naming_mode: 'COUNTER',
    counter: 1,
    filename: 'cp_data',
    measurement_duration: 60.0,
    sampling_interval: 1.0,
    polarization_current: 0.01,
    min_voltage: -4.0,
    max_voltage: 4.0
  });

  const handleParameterChange = (key: string, value: any) => {
    const newParameters = { ...parameters, [key]: value };
    setParameters(newParameters);
    onUpdate({ ...node, parameters: newParameters });
  };

  return (
    <div className="node-content">
      <div className="node-header">
        <span className="node-icon">⏰</span>
        <span className="node-title">计时电位法</span>
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
          placeholder="cp_data"
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
          label="极化电流 (A)"
          type="number"
          value={parameters.polarization_current}
          onChange={(value) => handleParameterChange('polarization_current', value)}
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
          label="最小电压 (V)"
          type="number"
          value={parameters.min_voltage}
          onChange={(value) => handleParameterChange('min_voltage', value)}
          step={0.001}
        />

        <ParameterInput
          label="最大电压 (V)"
          type="number"
          value={parameters.max_voltage}
          onChange={(value) => handleParameterChange('max_voltage', value)}
          step={0.001}
        />
      </div>
    </div>
  );
};