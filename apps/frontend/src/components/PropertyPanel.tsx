import React, { useState } from 'react';
import { ElectrochemicalNode, getNodeConfig, WorkstationType } from '../nodes/types';
import { useCanvasStore } from '../stores/canvasStore';

interface PropertyPanelProps {
  selectedWorkstation: WorkstationType | null;
}

export const PropertyPanel = React.forwardRef<HTMLDivElement, PropertyPanelProps>(
  ({ selectedWorkstation }, ref) => {
    const { selectedNode: node, updateNode } = useCanvasStore();
    const [activeTab, setActiveTab] = useState<'basic' | 'parameters' | 'data'>('basic');

    if (!node) {
      return (
        <div className="property-panel glass" ref={ref}>
          <div className="property-panel-header">
            <h2 className="property-panel-title">属性面板</h2>
          </div>
          <div className="empty-state">
            <div className="empty-icon">🖱️</div>
            <div className="empty-text">未选择节点</div>
            <div className="empty-subtitle">请在画布中选择一个节点以查看其属性</div>
          </div>
        </div>
      );
    }

    const updateNodeData = (updates: Partial<ElectrochemicalNode['data']>) => {
      const updatedNode = {
        ...node,
        data: {
          ...node.data,
          ...updates,
          updatedAt: new Date(),
        },
      };
      updateNode(updatedNode);
    };

    const updateParameters = (parameters: Record<string, any>) => {
      updateNodeData({ parameters });
    };

    const hasBackendSupport = () => {
      if (!selectedWorkstation) return false;
      if (selectedWorkstation === 'zahner-zennium') {
        return [
          'startup',
          'shutdown',
          'eis_potentiostatic',
          'eis_galvanostatic',
          'ocp_measurement',
          'chronoamperometry',
          'chronopotentiometry',
          'voltage_ramp',
          'current_ramp',
          'lsv_measurement',
        ].includes(node.type);
      }
      // change_temperature节点对所有工作站都支持
      if (node.type === 'change_temperature') {
        return true;
      }
      return false;
    };

    const renderBasicProperties = () => (
      <div className="properties-section">
        <h3 className="section-title">基本属性</h3>
        <div className="property-group">
          <label className="property-label">描述</label>
          <textarea
            value={node.data.description || ''}
            onChange={(e) => updateNodeData({ description: e.target.value })}
            className="property-textarea glass"
            placeholder="输入节点描述"
            rows={3}
          />
        </div>
        <div className="property-group">
          <label className="property-label">节点状态</label>
          <div className="status-indicator glass">
            <span className={`status-dot ${hasBackendSupport() ? 'status-ready' : 'status-error'}`} />
            <span className="status-text">{hasBackendSupport() ? '有效' : '无效'}</span>
            <span className="status-subtitle">{hasBackendSupport() ? '有后端支持' : '无后端支持'}</span>
          </div>
        </div>
      </div>
    );

    const renderParameters = () => {
      const config = getNodeConfig(node.type);
      const defaults: Record<string, any> = config?.defaultParameters || {};
      if (!defaults || Object.keys(defaults).length === 0) {
        return (
          <div className="empty-state">
            <div className="empty-icon">⚙️</div>
            <div className="empty-text">该节点类型暂无参数配置</div>
          </div>
        );
      }

      const renderParameterInput = (key: string, defaultValue: any, currentValue: any) => {
        // change_temperature节点的特殊处理
        if (node.type === 'change_temperature') {
          return renderChangeTemperatureInput(key, defaultValue, currentValue);
        }

        if (typeof defaultValue === 'boolean') {
          return (
            <select
              value={(currentValue ?? defaultValue) ? 'true' : 'false'}
              onChange={(e) => updateParameters({ ...node.data.parameters, [key]: e.target.value === 'true' })}
              className="property-select glass"
            >
              <option value="true">启用</option>
              <option value="false">禁用</option>
            </select>
          );
        }
        if (typeof defaultValue === 'number') {
          return (
            <input
              type="number"
              value={currentValue ?? defaultValue}
              onChange={(e) => updateParameters({ ...node.data.parameters, [key]: Number(e.target.value) })}
              className="property-input glass"
            />
          );
        }
        return (
          <input
            type="text"
            value={currentValue ?? defaultValue}
            onChange={(e) => updateParameters({ ...node.data.parameters, [key]: e.target.value })}
            className="property-input glass"
          />
        );
      };

      // change_temperature节点的专用输入组件
      const renderChangeTemperatureInput = (key: string, defaultValue: any, currentValue: any) => {
        // 只显示用户可输入的参数
        if (key === 'current_temperature' || key === 'calculated_duration' ||
            key === 'tolerance' || key === 'stabilization_time') {
          return (
            <input
              type="text"
              value={currentValue ?? defaultValue}
              disabled
              className="property-input glass disabled"
              title="运行时自动计算"
            />
          );
        }

        if (key === 'target_temperature') {
          return (
            <div className="temperature-input-group">
              <input
                type="number"
                value={currentValue ?? defaultValue}
                onChange={(e) => {
                  const value = e.target.value;
                  // 只允许数字输入
                  if (!/^\d*$/.test(value)) return;

                  const numValue = Number(value);
                  // 边界检查和静默修正
                  const correctedValue = Math.max(25, Math.min(1000, numValue));

                  updateParameters({
                    ...node.data.parameters,
                    [key]: correctedValue
                  });
                }}
                onBlur={(e) => {
                  const value = e.target.value;
                  if (!value) {
                    updateParameters({
                      ...node.data.parameters,
                      [key]: defaultValue
                    });
                    return;
                  }

                  const numValue = Number(value);
                  const correctedValue = Math.max(25, Math.min(1000, numValue));

                  if (correctedValue !== numValue) {
                    updateParameters({
                      ...node.data.parameters,
                      [key]: correctedValue
                    });
                  }
                }}
                onKeyDown={(e) => {
                  // 阻止非数字输入
                  if (!/^\d$/.test(e.key) &&
                      !['Backspace', 'Delete', 'Tab', 'Enter', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                    e.preventDefault();
                  }
                }}
                className="property-input glass"
                min={25}
                max={1000}
                step={1}
                title="目标温度 (25-1000°C)"
              />
              <span className="input-unit">°C</span>
            </div>
          );
        }

        if (key === 'rate') {
          return (
            <div className="temperature-input-group">
              <input
                type="number"
                value={currentValue ?? defaultValue}
                onChange={(e) => {
                  const value = e.target.value;
                  // 允许数字和一位小数点
                  if (!/^\d*\.?\d?$/.test(value)) return;

                  const numValue = Number(value);
                  // 边界检查和静默修正
                  const correctedValue = Math.max(0.1, Math.min(20, numValue));

                  updateParameters({
                    ...node.data.parameters,
                    [key]: correctedValue
                  });
                }}
                onBlur={(e) => {
                  const value = e.target.value;
                  if (!value) {
                    updateParameters({
                      ...node.data.parameters,
                      [key]: defaultValue
                    });
                    return;
                  }

                  const numValue = Number(value);
                  const correctedValue = Math.max(0.1, Math.min(20, numValue));

                  if (correctedValue !== numValue) {
                    updateParameters({
                      ...node.data.parameters,
                      [key]: correctedValue
                    });
                  }
                }}
                onKeyDown={(e) => {
                  // 允许数字、小数点和控制键
                  if (!/^\d$/.test(e.key) &&
                      e.key !== '.' &&
                      !['Backspace', 'Delete', 'Tab', 'Enter', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                    e.preventDefault();
                  }

                  // 防止多个小数点
                  if (e.key === '.' && e.currentTarget.value.includes('.')) {
                    e.preventDefault();
                  }
                }}
                className="property-input glass"
                min={0.1}
                max={20}
                step={0.1}
                title="温度变化速率 (0.1-20 °C/min)"
              />
              <span className="input-unit">°C/min</span>
            </div>
          );
        }

        return (
          <input
            type="text"
            value={currentValue ?? defaultValue}
            disabled
            className="property-input glass disabled"
            title="系统参数"
          />
        );
      };

      return (
        <div className="properties-section">
          <h3 className="section-title">参数</h3>
          {Object.entries(defaults).map(([key, defaultValue]) => (
            <div key={key} className="property-group">
              <label className="property-label">{key}</label>
              <div className="property-value">
                {renderParameterInput(key, defaultValue, (node.data.parameters || {})[key])}
              </div>
            </div>
          ))}
        </div>
      );
    };

    const renderDataProperties = () => (
      <div className="properties-section">
        <h3 className="section-title">数据</h3>
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <div className="empty-text">暂无数据</div>
        </div>
      </div>
    );

    return (
      <div className="property-panel glass" ref={ref}>
        <div className="property-panel-header">
          <h2 className="property-panel-title">属性面板</h2>
          <div className="property-panel-subtitle">{node.name}</div>
        </div>
        <div className="property-tabs">
          <button
            className={`btn btn-property-tab glass ${activeTab === 'basic' ? 'btn-primary' : ''}`}
            onClick={() => setActiveTab('basic')}
          >
            <span className="btn-icon">📋</span>
            <span className="btn-text">基本</span>
          </button>
          <button
            className={`btn btn-property-tab glass ${activeTab === 'parameters' ? 'btn-primary' : ''}`}
            onClick={() => setActiveTab('parameters')}
          >
            <span className="btn-icon">⚙️</span>
            <span className="btn-text">参数</span>
          </button>
          <button
            className={`btn btn-property-tab glass ${activeTab === 'data' ? 'btn-primary' : ''}`}
            onClick={() => setActiveTab('data')}
          >
            <span className="btn-icon">📊</span>
            <span className="btn-text">数据</span>
          </button>
        </div>
        <div className="property-panel-content">
          <div className="property-content">
            {activeTab === 'basic' && renderBasicProperties()}
            {activeTab === 'parameters' && renderParameters()}
            {activeTab === 'data' && renderDataProperties()}
          </div>
        </div>
      </div>
    );
  }
);

