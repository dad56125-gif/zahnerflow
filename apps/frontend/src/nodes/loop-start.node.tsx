import React, { useState, useEffect } from 'react';
import { LoopStartNode } from './types';

import { ParameterInput } from '../components/ParameterInput';

interface NodeComponentProps {
  node: LoopStartNode;
  onUpdate: (node: LoopStartNode) => void;
}

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

      
    </div>
  );
};