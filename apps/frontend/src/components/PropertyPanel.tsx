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

