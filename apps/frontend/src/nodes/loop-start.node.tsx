import React, { useState, useEffect } from 'react';
import { LoopStartNode } from './types';

interface NodeComponentProps {
  node: LoopStartNode;
  onUpdate: (node: LoopStartNode) => void;
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
  required?: boolean;
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
  unit,
  required = false
}) => {
  if (type === 'select' && options) {
    return (
      <div className="parameter-group">
        <label className="parameter-label">
          {label}
          {required && <span className="required-mark">*</span>}
        </label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="parameter-select"
          required={required}
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
        {required && <span className="required-mark">*</span>}
        {unit && <span className="parameter-unit">({unit})</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
        step={step}
        min={min}
        max={max}
        placeholder={placeholder}
        className="parameter-input"
        onWheel={(e) => e.preventDefault()} // 禁用滚轮
        required={required}
      />
    </div>
  );
};

export const LoopStartNodeComponent: React.FC<NodeComponentProps> = ({ node, onUpdate }) => {
  const [loopCount, setLoopCount] = useState<number>(node.data.parameters?.loop_count || 1);
  const [loopVariable, setLoopVariable] = useState<string>(node.data.parameters?.loop_variable || 'i');
  const [startValue, setStartValue] = useState<number>(node.data.parameters?.start_value || 0);
  const [step, setStep] = useState<number>(node.data.parameters?.step || 1);
  const [loopId, setLoopId] = useState<string>(node.data.parameters?.loop_id || '');

  // 生成唯一的循环ID（如果为空）
  useEffect(() => {
    if (!loopId) {
      const generatedId = `loop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setLoopId(generatedId);
      updateParameter('loop_id', generatedId);
    }
  }, [loopId]);

  const updateParameter = (key: string, value: any) => {
    const updatedNode = {
      ...node,
      data: {
        ...node.data,
        parameters: {
          ...node.data.parameters,
          [key]: value
        }
      }
    };
    onUpdate(updatedNode);
  };

  const handleLoopCountChange = (value: number) => {
    if (value < 1) value = 1;
    if (value > 1000) value = 1000; // 限制最大循环次数
    setLoopCount(value);
    updateParameter('loop_count', value);
  };

  const handleLoopVariableChange = (value: string) => {
    // 验证变量名格式
    const sanitizedValue = value.replace(/[^a-zA-Z0-9_]/g, '');
    if (sanitizedValue !== value) {
      alert('循环变量名只能包含字母、数字和下划线');
      return;
    }
    setLoopVariable(sanitizedValue);
    updateParameter('loop_variable', sanitizedValue);
  };

  const handleStartValueChange = (value: number) => {
    setStartValue(value);
    updateParameter('start_value', value);
  };

  const handleStepChange = (value: number) => {
    if (value === 0) {
      alert('步长不能为0');
      return;
    }
    setStep(value);
    updateParameter('step', value);
  };

  const handleLoopIdChange = (value: string) => {
    setLoopId(value);
    updateParameter('loop_id', value);
  };

  return (
    <div className="node-content loop-start-node">
      <div className="node-header">
        <h3 className="node-title">🔄 循环开始</h3>
        <p className="node-description">定义循环参数和开始位置</p>
      </div>

      <div className="node-parameters">
        <ParameterInput
          label="循环次数"
          type="number"
          value={loopCount}
          onChange={handleLoopCountChange}
          min={1}
          max={1000}
          step={1}
          required={true}
        />

        <ParameterInput
          label="循环变量名"
          type="text"
          value={loopVariable}
          onChange={handleLoopVariableChange}
          placeholder="例如: i, j, k"
          required={true}
        />

        <ParameterInput
          label="起始值"
          type="number"
          value={startValue}
          onChange={handleStartValueChange}
          step={1}
          required={true}
        />

        <ParameterInput
          label="步长"
          type="number"
          value={step}
          onChange={handleStepChange}
          step={0.1}
          required={true}
        />

        <ParameterInput
          label="循环ID"
          type="text"
          value={loopId}
          onChange={handleLoopIdChange}
          placeholder="自动生成或手动输入"
          required={true}
        />
      </div>

      <div className="node-info">
        <div className="info-item">
          <span className="info-label">变量使用:</span>
          <span className="info-value">${loopVariable}</span>
        </div>
        <div className="info-item">
          <span className="info-label">预期值范围:</span>
          <span className="info-value">
            {startValue} → {startValue + (loopCount - 1) * step}
          </span>
        </div>
      </div>

      <style>{`
        .node-content {
          padding: 12px;
          min-width: 280px;
        }

        .node-header {
          margin-bottom: 16px;
          text-align: center;
        }

        .node-title {
          margin: 0 0 4px 0;
          font-size: 16px;
          font-weight: 600;
          color: #333;
        }

        .node-description {
          margin: 0;
          font-size: 12px;
          color: #666;
        }

        .node-parameters {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 16px;
        }

        .parameter-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .parameter-label {
          font-size: 12px;
          font-weight: 500;
          color: #555;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .required-mark {
          color: #f44336;
          font-weight: bold;
        }

        .parameter-unit {
          color: #888;
          font-weight: normal;
        }

        .parameter-input,
        .parameter-select {
          padding: 6px 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 12px;
          background: white;
          transition: border-color 0.2s;
        }

        .parameter-input:focus,
        .parameter-select:focus {
          outline: none;
          border-color: #FF9800;
        }

        .node-info {
          background: #f5f5f5;
          border-radius: 6px;
          padding: 8px;
          font-size: 11px;
        }

        .info-item {
          display: flex;
          justify-content: space-between;
          margin-bottom: 4px;
        }

        .info-item:last-child {
          margin-bottom: 0;
        }

        .info-label {
          color: #666;
          font-weight: 500;
        }

        .info-value {
          color: #333;
          font-family: monospace;
        }
      `}</style>
    </div>
  );
};