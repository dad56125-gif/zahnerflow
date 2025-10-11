import React, { useState } from 'react';
import { ParameterInput } from '../components/ParameterInput';

interface NodeComponentProps {
  node: any;
  onUpdate: (node: any) => void;
}

export const WaitDelayNode: React.FC<NodeComponentProps> = ({ node, onUpdate }) => {
  const [parameters, setParameters] = useState(node.data?.parameters || {
    duration: 1.0,
    description: '',
    allow_cancel: true,
    progress_updates: true
  });

  const handleParameterChange = (key: string, value: any) => {
    const newParameters = { ...parameters, [key]: value };
    setParameters(newParameters);

    const updatedNode = {
      ...node,
      data: {
        ...node.data,
        parameters: newParameters,
        updatedAt: new Date()
      }
    };
    onUpdate(updatedNode);
  };

  return (
    <div className="node-content">
      <div className="node-header">
        <span className="node-icon">⏱️</span>
        <span className="node-title">等待/延时</span>
      </div>

      <div className="node-parameters">
        <ParameterInput
          label="等待时长"
          type="number"
          value={parameters.duration}
          onChange={(value) => handleParameterChange('duration', value)}
          min={0.1}
          max={86400}
          step={0.1}
          unit="秒"
          placeholder="1.0"
          required={true}
        />

        <ParameterInput
          label="描述"
          type="text"
          value={parameters.description}
          onChange={(value) => handleParameterChange('description', value)}
          placeholder="等待的目的或说明"
          maxLength={200}
        />

        <ParameterInput
          label="允许取消"
          type="boolean"
          value={parameters.allow_cancel}
          onChange={(value) => handleParameterChange('allow_cancel', value)}
        />

        <ParameterInput
          label="进度更新"
          type="boolean"
          value={parameters.progress_updates}
          onChange={(value) => handleParameterChange('progress_updates', value)}
        />
      </div>

      <div className="node-status">
        {parameters.duration > 10 && parameters.progress_updates && (
          <div className="status-info">
            <span className="status-icon">ℹ️</span>
            <span className="status-text">长时间等待将显示进度更新</span>
          </div>
        )}
      </div>
    </div>
  );
};