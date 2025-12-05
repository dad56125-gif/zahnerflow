// --- START OF FILE PropertyPanel.tsx ---

import React, { useState, useEffect, useMemo } from 'react'; // ✅ 新增 useMemo, useEffect
import { ElectrochemicalNode, WorkstationType } from '../types/NodeInterfaces';
// ✅ 引入 store 获取节点列表
import { useCanvasStore } from '../workflow';
import { useMfc } from '../modules/mfc';
import { NodeChart } from './NodeChart';
// ✅ 引入统一的 SystemState Hook
import { useSystemState } from '../workflow/executionStore';

// ✅ 修改：从 NodeUtilities 导入存储逻辑
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

// ✅ 定义哪些节点类型支持图表显示
const MEASUREMENT_NODE_TYPES = [
  'eis_potentiostatic',
  'eis_galvanostatic',
  'ocp_measurement',
  'chronoamperometry',
  'chronopotentiometry',
  'voltage_ramp',
  'current_ramp',
  'lsv_measurement'
  // 如果 change_temperature 有实时温度曲线，也可以加进去，否则移除
];

interface PropertyPanelProps {
  selectedWorkstation: WorkstationType | null;
}

export const PropertyPanel = React.forwardRef<HTMLDivElement, PropertyPanelProps>(
  ({ selectedWorkstation }, ref) => {
    // ✅ 获取 nodes 列表用于计算 index
    const { selectedNode: node, updateNode, nodes } = useCanvasStore();

    // ✅ 获取实时系统状态
    const systemState = useSystemState();
    const [activeTab, setActiveTab] = useState<'basic' | 'parameters' | 'chart'>('basic');
    // 强制刷新触发器（当保存默认值后触发重渲染）
    const [_, setRefreshTrigger] = useState(0);
    const [mfcState] = useMfc();

    // ✅ 新增：判断当前节点是否支持图表
    const supportsChart = useMemo(() => {
        return node && MEASUREMENT_NODE_TYPES.includes(node.type);
    }, [node]);

    // ✅ 新增：当节点切换时，如果新节点不支持图表且当前停留在图表页，强制切回 basic
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

    const updateNodeData = (updates: Partial<ElectrochemicalNode['data']>) => {
      updateNode({
        ...node,
        data: {
          ...node.data,
          ...updates,
          updatedAt: new Date(),
        },
      });
    };

    const updateParameters = (newParams: Record<string, any>) => {
      updateNodeData({ parameters: newParams });
    };

    const handleParamChange = (key: string, value: any) => {
        const currentParams = node.data.parameters || {};

        if (key === 'device_selection' && node.type === 'change_gas_flow') {
            const [address, gasType] = (value as string).split(':');
            const device = mfcState.availableDevices.find(d => d.address === Number(address) && d.gas_type === gasType);
            updateParameters({
                ...currentParams,
                device_selection: value,
                device_address: Number(address),
                gas_type: gasType,
                max_flow_sccm: device?.max_flow_sccm || 200
            });
        } else {
            updateParameters({ ...currentParams, [key]: value });
        }
    };

    const saveDefaults = () => {
        if (!node.data.parameters) return;
        // 使用从 NodeUtilities 导入的函数
        saveEffectiveDefaultParameters(node.type, node.data.parameters);
        setRefreshTrigger(prev => prev + 1);
    };

    const isDefault = () => {
        const defaults = getEffectiveDefaultParameters(node.type);
        const current = node.data.parameters || {};
        for (const k in defaults) {
            if (['current_temperature', 'calculated_duration'].includes(k)) continue;
            if (String(current[k]) !== String(defaults[k])) return false;
        }
        return true;
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
      if (node.type === 'change_temperature') return true;
      if (node.type === 'change_gas_flow') return true;
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
            className="textarea glass"
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

    const renderParameterField = (key: string, defaultValue: any) => {
        const currentValue = (node.data.parameters || {})[key];
        const props = {
            paramKey: key,
            value: currentValue,
            defaultValue,
            onChange: handleParamChange,
            dropdownState: dropdownContext
        };

        if (node.type === 'change_temperature') return <TemperatureInput {...props} />;
        if (node.type === 'change_gas_flow') return <GasFlowInput {...props} availableDevices={mfcState.availableDevices} />;
        // 使用 propertyConfig 中的配置来判断是否为枚举
        // 注意：这里需要一个更健壮的判断方式，或直接复用 propertyConfig 的 enumValues
        // 简单起见，这里复用 propertyConfig.tsx 中的 enumValues 键检查
        // 由于 enumValues 没在这里导入，使用硬编码检查或导入它
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
            <span className="property-panel-subtitle">{node.name}</span>
          </h3>
        </div>
        <div className="property-panel-content">
          <div className="property-content">
            <div className="property-tabs">
              <button
                className={`btn_base btn_layout btn_style_common btn_small glass ${activeTab === 'basic' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('basic')}
              >
                <span className="btn-icon">📋</span><span className="btn-text">基本</span>
              </button>
              <button
                className={`btn_base btn_layout btn_style_common btn_small glass ${activeTab === 'parameters' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('parameters')}
              >
                <span className="btn-icon">⚙️</span><span className="btn-text">参数</span>
              </button>

              {/* ✅ 修改：条件渲染图表按钮 */}
              {supportsChart && (
                <button
                    className={`btn_base btn_layout btn_style_common btn_small glass ${activeTab === 'chart' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setActiveTab('chart')}
                >
                    <span className="btn-icon">📈</span><span className="btn-text">图表</span>
                </button>
              )}
            </div>
                      {/* Content Rendering */}
            {activeTab === 'basic' && renderBasicProperties()}
            {activeTab === 'parameters' && renderParameters()}

            {/* ✅ 修改：确保只有支持且选中时才渲染 */}
            {activeTab === 'chart' && supportsChart && node && (
              <NodeChart
                nodeId={node.id}
                // ✅ 传入真实的索引
                nodeIndex={nodes.findIndex(n => n.id === node.id) === -1 ? 0 : nodes.findIndex(n => n.id === node.id)}
                nodeConfig={node.data}
                // ✅ 传入真实的系统状态
                systemState={systemState}
              />
            )}
          </div>
        </div>
      </div>
    );
  }
);