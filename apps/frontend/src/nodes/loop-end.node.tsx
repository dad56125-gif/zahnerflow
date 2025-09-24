import React, { useState } from 'react';
import { LoopEndNode } from './types';

interface NodeComponentProps {
  node: LoopEndNode;
  onUpdate: (node: LoopEndNode) => void;
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

export const LoopEndNodeComponent: React.FC<NodeComponentProps> = ({ node, onUpdate }) => {
  const [loopId, setLoopId] = useState<string>(node.data.parameters?.loop_id || '');

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

  const handleLoopIdChange = (value: string) => {
    setLoopId(value);
    updateParameter('loop_id', value);
  };

  return (
    <div className="node-content loop-end-node">
      <div className="node-header">
        <h3 className="node-title">⏹️ 循环结束</h3>
        <p className="node-description">标记循环结束位置</p>
      </div>

      <div className="node-parameters">
        <ParameterInput
          label="配对循环ID"
          type="text"
          value={loopId}
          onChange={handleLoopIdChange}
          placeholder="必须与循环开始节点的ID匹配"
          required={true}
        />
      </div>

      <div className="node-status">
        <div className="status-indicator">
          <span className={`status-dot ${loopId ? 'active' : 'inactive'}`}></span>
          <span className="status-text">
            {loopId ? '已配对' : '等待配对'}
          </span>
        </div>
      </div>

      <div className="node-help">
        <h4 className="help-title">使用说明：</h4>
        <ul className="help-list">
          <li>循环ID必须与对应的循环开始节点ID完全一致</li>
          <li>循环结束节点将标记循环区域的结束位置</li>
          <li>系统会自动检测循环开始和结束节点的配对关系</li>
          <li>配对成功后，循环区域会显示为[ ]包围的区域</li>
        </ul>
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
          border-color: #F44336;
        }

        .node-status {
          background: #f5f5f5;
          border-radius: 6px;
          padding: 8px;
          margin-bottom: 16px;
        }

        .status-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ccc;
        }

        .status-dot.active {
          background: #4CAF50;
        }

        .status-dot.inactive {
          background: #f44336;
        }

        .status-text {
          font-size: 11px;
          font-weight: 500;
        }

        .node-help {
          background: #e3f2fd;
          border-radius: 6px;
          padding: 8px;
          border-left: 3px solid #2196F3;
        }

        .help-title {
          margin: 0 0 8px 0;
          font-size: 12px;
          font-weight: 600;
          color: #1976D2;
        }

        .help-list {
          margin: 0;
          padding-left: 16px;
          font-size: 11px;
          color: #555;
        }

        .help-list li {
          margin-bottom: 4px;
        }

        .help-list li:last-child {
          margin-bottom: 0;
        }
      `}</style>
    </div>
  );
};