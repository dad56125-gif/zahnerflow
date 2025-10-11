import React, { useState } from 'react';
import { LoopEndNode } from './types';
import '../styles/components.css';
import { ParameterInput } from '../components/ParameterInput';

interface NodeComponentProps {
  node: LoopEndNode;
  onUpdate: (node: LoopEndNode) => void;
}

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

      
    </div>
  );
};