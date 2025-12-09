// --- START OF FILE apps/frontend/src/components/PropertyPanel.tsx ---

import React, { useState, useEffect, useMemo } from 'react';
import { WorkstationType, WorkflowNode, NodeType } from '../types/Interfaces'; // 引入新类型
import { useCanvasStore } from '../canvas/canvasStore'; // 修正 store 路径
import { useMfc } from '../modules/mfc';
import { DataViewer } from './DataViewer';
// 确保 useSystemState 来自正确的执行 Store
import { useSystemState } from '../workflow/executionStore';

// 导入工具函数
import {
  getEffectiveDefaultParameters,
  saveEffectiveDefaultParameters
} from '../types/NodeUtilities';

import {
  getParameterLabel,
  getHiddenParameters
} from './propertyConfig';
import {
  StandardInput,
  EnumInput,
  TemperatureInput,
  GasFlowInput
} from './PropertyInputs';

// 静态配置（用于获取节点显示名称）
import { NODE_CONFIGS } from '../types/NodeConfiguration';

// 定义哪些节点类型支持图表显示
const MEASUREMENT_NODE_TYPES: NodeType[] = [
  'eis_potentiostatic',
  'eis_galvanostatic',
  'ocp_measurement',
  'chronoamperometry',
  'chronopotentiometry',
  'voltage_ramp',
  'current_ramp',
  'lsv_measurement'
];

interface PropertyPanelProps {
  selectedWorkstation: WorkstationType | null;
}

export const PropertyPanel = React.forwardRef<HTMLDivElement, PropertyPanelProps>(
  ({ selectedWorkstation }, ref) => {
    // 1. 从 Store 获取选中节点
    // 使用 selectedNodeId 从 nodes 数组中查找，确保数据是最新的
    const { nodes, selectedNodeId, updateNodeConfig } = useCanvasStore();
    const node = useMemo(() => nodes.find(n => n.id === selectedNodeId), [nodes, selectedNodeId]);

    // 2. 获取实时系统状态
    const systemState = useSystemState();
    const [activeTab, setActiveTab] = useState<'basic' | 'parameters' | 'chart'>('basic');
    const [_, setRefreshTrigger] = useState(0); // 强制刷新触发器
    const [mfcState] = useMfc();

    // 3. 判断图表支持
    const supportsChart = useMemo(() => {
      return node && MEASUREMENT_NODE_TYPES.includes(node.type);
    }, [node]);

    // 自动切回 basic tab
    useEffect(() => {
      if (!supportsChart && activeTab === 'chart') {
        setActiveTab('basic');
      }
    }, [supportsChart, activeTab]);

    // Dropdown 状态管理
    const [dropdownState, setDropdownState] = useState<{
      activeId: string | null;
      hidingId: string | null;
      positions: Record<string, any>;
    }>({
      activeId: null,
      hidingId: null,
      positions: {}
    });

    const handleOpenDropdown = (id: string, event: React.MouseEvent) => {
      const rect = event.currentTarget.getBoundingClientRect();
      setDropdownState(prev => ({
        ...prev,
        activeId: id,
        positions: {
          ...prev.positions,
          [id]: { top: rect.bottom + 4, left: rect.left, width: rect.width, id }
        }
      }));
    };

    const handleCloseDropdown = (id: string) => {
      setDropdownState(prev => ({ ...prev, hidingId: id }));
      setTimeout(() => {
        setDropdownState(prev => ({ ...prev, activeId: null, hidingId: null }));
      }, 250);
    };

    const dropdownContext = {
      isOpen: !!dropdownState.activeId,
      isHiding: !!dropdownState.hidingId,
      position: dropdownState.activeId ? dropdownState.positions[dropdownState.activeId] : null,
      open: handleOpenDropdown,
      close: handleCloseDropdown
    };

    if (!node) {
      return (
        <div className="property-panel glass" ref={ref}>
          <div className="property-panel-header">
            <h3 className="bar-header-title">
              <span className="property-panel-text">属性</span>
            </h3>
          </div>
          <div className="empty-state">
            <div className="empty-text">未选择节点</div>
            <div className="empty-subtitle">请在画布中选择一个节点以查看其属性</div>
          </div>
        </div>
      );
    }

    // 获取静态配置名称
    const nodeName = NODE_CONFIGS[node.type]?.name || node.type;

    // 参数更新逻辑：直接操作 config 对象
    const handleParamChange = (key: string, value: any) => {
      const currentConfig = node.config || {};

      if (key === 'device_selection' && node.type === 'change_gas_flow') {
        const [address, gasType] = (value as string).split(':');
        const device = mfcState.availableDevices.find(d => d.address === Number(address) && d.gas_type === gasType);
        updateNodeConfig(node.id, {
          ...currentConfig,
          device_selection: value,
          device_address: Number(address),
          gas_type: gasType,
          max_flow_sccm: device?.max_flow_sccm || 200
        });
      } else {
        updateNodeConfig(node.id, { ...currentConfig, [key]: value });
      }
    };

    const saveDefaults = () => {
      if (!node.config) return;
      saveEffectiveDefaultParameters(node.type, node.config);
      setRefreshTrigger(prev => prev + 1);
    };

    const isDefault = () => {
      const defaults = getEffectiveDefaultParameters(node.type);
      const current = node.config || {};
      for (const k in defaults) {
        // 忽略运行时动态参数
        if (['current_temperature', 'calculated_duration'].includes(k)) continue;
        if (String(current[k]) !== String(defaults[k])) return false;
      }
      return true;
    };

    const hasBackendSupport = () => {
      // 简单判断，所有测量节点和设备控制节点通常都有后端支持
      return true;
    };

    const renderBasicProperties = () => (
      <div className="properties-section">
        <h3 className="section-title">基本属性</h3>
        <div className="property-group">
          {/* 这里如果需要支持用户自定义节点名称，可以修改 node.name (如果在 Interface 中定义了) */}
          {/* 目前 WorkflowNode 结构里没有 name 字段，若有需求可添加 */}
          <label className="property-label">类型</label>
          <div className="property-value-static">{nodeName}</div>
        </div>
        <div className="property-group">
          <label className="property-label">ID</label>
          <div className="property-value-static text-xs text-gray-400">{node.id}</div>
        </div>
        <div className="property-group">
          <label className="property-label">节点状态</label>
          <div className="status-indicator glass">
            <span className={`status-dot ${hasBackendSupport() ? 'status-ready' : 'status-error'}`} />
            <span className="status-text">{hasBackendSupport() ? '有效' : '无效'}</span>
          </div>
        </div>
      </div>
    );

    const renderParameterField = (key: string, defaultValue: any) => {
      const currentValue = (node.config || {})[key];
      const props = {
        paramKey: key,
        value: currentValue,
        defaultValue,
        onChange: handleParamChange,
        dropdownState: dropdownContext
      };

      if (node.type === 'change_temperature') return <TemperatureInput {...props} />;
      if (node.type === 'change_gas_flow') return <GasFlowInput {...props} availableDevices={mfcState.availableDevices} />;

      // 枚举判断逻辑
      const isEnum = [
        'eis_scan_direction', 'eis_scan_strategy', 'start_voltage_reference',
        'end_voltage_reference', 'scanDirection', 'scanStrategy',
        'potentiostatMode', 'fileNaming'
      ].includes(key);

      if (isEnum || typeof defaultValue === 'boolean') {
        return <EnumInput {...props} />;
      }
      if (typeof defaultValue === 'number') return <StandardInput {...props} type="number" />;
      return <StandardInput {...props} />;
    };

    const renderParameters = () => {
      const effectiveDefaults = getEffectiveDefaultParameters(node.type);
      const hiddenParams = getHiddenParameters(node.type);
      const visibleParams = Object.entries(effectiveDefaults).filter(([k]) => !hiddenParams.includes(k));

      if (!effectiveDefaults || Object.keys(effectiveDefaults).length === 0) {
        return (
          <div className="empty-state">
            <div className="empty-icon">⚙️</div>
            <div className="empty-text">该节点类型暂无参数配置</div>
          </div>
        );
      }

      return (
        <div className="properties-section">
          <div className="kit_row">
            <div className="kit_row_left">
              <h3 className="section-title">参数</h3>
            </div>
            <div className="kit_row_right">
              <button
                onClick={saveDefaults}
                disabled={isDefault()}
                className={`btn btn_base btn_layout btn_style_common btn_mini glass ${isDefault() ? 'btn_primary' : 'btn_secondary'}`}
                title={isDefault() ? "当前参数已是工作流默认配置" : "将当前参数保存为工作流默认配置"}
              >
                <span className="btn-icon">{isDefault() ? '✅' : '💾'}</span>
                <span className="btn-text">
                  {isDefault() ? '当前工作流默认' : '设为工作流默认'}
                </span>
              </button>
            </div>
          </div>
          {visibleParams.map(([key, defVal]) => (
            <div key={key} className="property-group">
              <label className="property-label">{getParameterLabel(key, node.type)}</label>
              <div className="property-value">
                {renderParameterField(key, defVal)}
              </div>
            </div>
          ))}
        </div>
      );
    };

    return (
      <div className="property-panel glass" ref={ref}>
        <div className="property-panel-header">
          <h3 className="bar-header-title">
            <span className="property-panel-text">属性</span>
            <span className="property-panel-subtitle">{nodeName}</span>
          </h3>
        </div>
        <div className="property-panel-content">
          <div className="property-content">
            <div className="property-tabs">
              <button
                className={`btn_base btn_layout btn_style_common btn_small glass ${activeTab === 'basic' ? 'btn_primary' : 'btn_secondary'}`}
                onClick={() => setActiveTab('basic')}
              >
                <span className="btn-icon">📋</span><span className="btn-text">基本</span>
              </button>
              <button
                className={`btn_base btn_layout btn_style_common btn_small glass ${activeTab === 'parameters' ? 'btn_primary' : 'btn_secondary'}`}
                onClick={() => setActiveTab('parameters')}
              >
                <span className="btn-icon">⚙️</span><span className="btn-text">参数</span>
              </button>

              {supportsChart && (
                <button
                  className={`btn_base btn_layout btn_style_common btn_small glass ${activeTab === 'chart' ? 'btn_primary' : 'btn_secondary'}`}
                  onClick={() => setActiveTab('chart')}
                >
                  <span className="btn-icon">📊</span><span className="btn-text">数据</span>
                </button>
              )}
            </div>

            {activeTab === 'basic' && renderBasicProperties()}
            {activeTab === 'parameters' && renderParameters()}

            {activeTab === 'chart' && supportsChart && node && (
              <DataViewer
                isVisible={true}
                selectedNode={{
                  id: node.id,
                  type: node.type,
                  name: nodeName,
                  data: { results: node.config, updatedAt: new Date().toISOString() },
                  status: systemState?.currentStep?.nodeId === node.id ? 'running' : 'ready'
                }}
                showChart={false}
              />
            )}
          </div>
        </div>
      </div>
    );
  }
);