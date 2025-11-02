import React, { useState } from 'react';
import { ElectrochemicalNode, getNodeConfig, WorkstationType } from '../nodes/types';
import { useCanvasStore } from '../stores/canvasStore';

interface PropertyPanelProps {
  selectedWorkstation: WorkstationType | null;
}

// 辅助函数：获取可用MFC设备列表
const getAvailableMfcDevices = () => {
  // 从MFC WebSocket服务或缓存获取已连接的设备信息
  // 这里使用静态示例，实际应该从MFC服务动态获取
  return [
    { value: '1:N2', label: '设备1: 氮气 (N2)', maxFlow: 200 },
    { value: '2:O2', label: '设备2: 氧气 (O2)', maxFlow: 150 },
    { value: '3:H2', label: '设备3: 氢气 (H2)', maxFlow: 100 },
    { value: '4:Ar', label: '设备4: 氩气 (Ar)', maxFlow: 180 },
  ];
};

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

    // 科学计数法解析函数
    const parseScientificNotation = (input: string): number => {
      const trimmed = input.trim().toLowerCase();

      // 处理 k/K (千)
      if (trimmed.endsWith('k')) {
        return parseFloat(trimmed.slice(0, -1)) * 1000;
      }
      // 处理 m/M (毫)
      if (trimmed.endsWith('m')) {
        return parseFloat(trimmed.slice(0, -1)) * 0.001;
      }
      // 处理 M (兆)
      if (trimmed.endsWith('M')) {
        return parseFloat(trimmed.slice(0, -1)) * 1000000;
      }
      // 处理 u/μ (微)
      if (trimmed.endsWith('u') || trimmed.endsWith('μ')) {
        return parseFloat(trimmed.slice(0, -1)) * 0.000001;
      }
      // 处理 n (纳)
      if (trimmed.endsWith('n')) {
        return parseFloat(trimmed.slice(0, -1)) * 0.000000001;
      }

      // 普通数字
      return parseFloat(trimmed) || 0;
    };

    // 获取参数标签
    const getParameterLabel = (key: string): string => {
      // 根据节点类型确定EIS幅值单位
      const getEisAmplitudeUnit = () => {
        return node.type === 'eis_galvanostatic' ? '(A)' : '(V)';
      };

      const labels: Record<string, string> = {
        // 通用测量参数
        polarization_voltage: '极化电压 (V)',
        polarization_current: '极化电流 (A)',
        measurement_duration: '测量持续时间 (s)',
        sampling_interval: '采样间隔 (s)',
        min_voltage: '最小电压安全限 (V)',
        max_voltage: '最大电压安全限 (V)',
        min_current: '最小电流安全限 (A)',
        max_current: '最大电流安全限 (A)',

        // 电位扫描参数
        start_voltage: '起始电位 (V)',
        end_voltage: '结束电位 (V)',
        voltage_reference: '电位参考模式',

        // 电流扫描参数
        start_current: '起始电流 (A)',
        end_current: '结束电流 (A)',

        // EIS测量参数
        eis_lower_frequency: '低频限制 (Hz)',
        eis_upper_frequency: '高频限制 (Hz)',
        eis_start_frequency: '起始频率 (Hz)',
        eis_lower_periods: '低频区测量周期数',
        eis_upper_periods: '高频区测量周期数',
        eis_lower_steps: '低频区每十倍频程扫描点数',
        eis_upper_steps: '高频区每十倍频程扫描点数',
        eis_scan_direction: '扫描方向',
        eis_scan_strategy: '扫描策略',
        eis_amplitude: `交流扰动幅值 ${getEisAmplitudeUnit()}`,
        eis_potential: '直流偏置电位 (V)',
        eis_current: '直流偏置电流 (A)',
        enable_dc_bias: '直流偏置',

        // 其他参数
        mode: '模式',
        potential: '电位 (V)',
        current: '电流 (A)',
        duration: '持续时间 (s)',
        interval: '间隔 (s)',
        start_value: '起始值 (V)',
        end_value: '结束值 (V)',
        scan_rate: '扫描速率 (V/s)',
        start_potential: '起始电位 (V)',
        end_potential: '结束电位 (V)',
        step_duration: '步进时长 (s)',
        step_increment: '步进增量 (V)',
        total_steps: '总步数',
        steps: '阶梯参数',
        power_duration: '发电时长 (s)',
        electrolysis_duration: '电解时长 (s)',
        cycles: '循环次数',
        value_sequence: '数值序列',
        duration_per_value: '每数值时长 (s)',
        loop_count: '循环次数',
        max_loops: '最大循环次数',
        condition: '条件',
        branch_mode: '分支模式',
        amplitude: '测量幅度 (V)',
        startFrequency: '起始频率 (Hz)',
        lowerFrequencyLimit: '最低频率限制 (Hz)',
        upperFrequencyLimit: '最高频率限制 (Hz)',
        lowerNumberOfPeriods: '低频段周期数',
        upperNumberOfPeriods: '高频段周期数',
        lowerStepsPerDecade: '低频段每十频程步数',
        upperStepsPerDecade: '高频段每十频程步数',
        scanDirection: '扫描方向',
        scanStrategy: '扫描策略',
        potentiostatMode: '恒电位仪模式',
        selectPotentiostat: '选择恒电位仪',
        outputPath: '输出路径',
        outputFileName: '输出文件名',
        fileNaming: '文件命名方式',
        counter: '计数器起始值',

        // 温度节点参数
        target_temperature: '目标温度 (°C)',
        rate: '温度变化速率 (°C/min)',
        current_temperature: '当前温度 (°C)',
        calculated_duration: '计算时长 (min)',
        tolerance: '温度容差 (°C)',
        stabilization_time: '稳定时间 (min)',

        // MFC流量节点参数
        device_selection: '设备选择',
        target_flow_rate: '目标流量 (sccm)',
        current_flow_rate: '当前流量 (sccm)',
        device_address: '设备地址',
        gas_type: '气体类型',
        max_flow_sccm: '最大流量 (sccm)'
      };
      return labels[key] || key;
    };

    // 获取枚举标签
    const getParameterEnumLabel = (key: string, value: string): string => {
      const enumLabels: Record<string, Record<string, string>> = {
        eis_scan_direction: {
          'START_TO_MAX': '从起始频率到最高频率',
          'START_TO_MIN': '从起始频率到最低频率'
        },
        eis_scan_strategy: {
          'SINGLE_SINE': '单正弦波',
          'MULTI_SINE': '多正弦波'
        },
        voltage_reference: {
          'absolute': '绝对电位',
          'ocv': '开路电位'
        },
        scanDirection: {
          'START_TO_MAX': '从起始到最大',
          'MAX_TO_START': '从最大到起始',
          'START_TO_MIN': '从起始到最小',
          'MIN_TO_START': '从最小到起始'
        },
        scanStrategy: {
          'SINGLE_SINE': '单正弦波',
          'MULTI_SINE': '多正弦波',
          'NOISE': '噪声'
        },
        potentiostatMode: {
          'POTMODE_POTENTIOSTATIC': '恒电位模式',
          'POTMODE_GALVANOSTATIC': '恒电流模式'
        },
        fileNaming: {
          'COUNTER': '计数器',
          'DATE_TIME': '日期时间',
          'INDIVIDUAL': '自定义'
        }
      };

      return enumLabels[key]?.[value] || value;
    };

    // 获取占位符
    const getParameterPlaceholder = (key: string): string => {
      const placeholders: Record<string, string> = {
        potential: '输入电位值，单位：伏特',
        current: '输入电流值，单位：安培',
        duration: '输入持续时间，单位：秒',
        scan_rate: '输入扫描速率，单位：伏特/秒',
        start_potential: '输入起始电位',
        end_potential: '输入结束电位',
        cycles: '输入循环次数',

        // EIS测量参数占位符
        amplitude: '输入测量幅度，通常为0.005-0.02V',
        startFrequency: '输入起始频率，通常为1000Hz',
        lowerFrequencyLimit: '输入最低频率限制，通常为10Hz',
        upperFrequencyLimit: '输入最高频率限制，通常为100kHz',
        lowerNumberOfPeriods: '输入低频段周期数，通常为3-10',
        upperNumberOfPeriods: '输入高频段周期数，通常为10-30',
        lowerStepsPerDecade: '输入低频段每十频程步数，通常为2-5',
        upperStepsPerDecade: '输入高频段每十频程步数，通常为5-10',
        outputPath: '输入文件输出路径，如：C:\\THALES\\temp',
        outputFileName: '输入输出文件名，如：eis_measurement',
        counter: '输入计数器起始值，通常为1',

        // 温度节点参数占位符
        target_temperature: '输入目标温度 (25-1000°C)',
        rate: '输入温度变化速率 (0.1-20 °C/min)',
        current_temperature: '当前温度（运行时显示）',
        calculated_duration: '计算时长（自动计算）',
        tolerance: '温度容差（系统参数）',
        stabilization_time: '稳定时间（系统参数）',

        // MFC流量节点占位符
        device_selection: '选择MFC设备和气体类型',
        target_flow_rate: '输入目标流量 (0.1-200 sccm)',
        current_flow_rate: '当前流量（运行时显示）',
        device_address: '设备地址（自动设置）',
        gas_type: '气体类型（自动设置）',
        max_flow_sccm: '最大流量（自动设置）'
      };
      return placeholders[key] || `输入${getParameterLabel(key)}`;
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
      // change_gas_flow节点对所有工作站都支持
      if (node.type === 'change_gas_flow') {
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

      // 枚举类型映射
      const enumValues: Record<string, string[]> = {
        eis_scan_direction: ['START_TO_MAX', 'START_TO_MIN'],
        eis_scan_strategy: ['SINGLE_SINE', 'MULTI_SINE'],
        voltage_reference: ['absolute', 'ocv'],
        scanDirection: ['START_TO_MAX', 'MAX_TO_START', 'START_TO_MIN', 'MIN_TO_START'],
        scanStrategy: ['SINGLE_SINE', 'MULTI_SINE', 'NOISE'],
        potentiostatMode: ['POTMODE_POTENTIOSTATIC', 'POTMODE_GALVANOSTATIC'],
        fileNaming: ['COUNTER', 'DATE_TIME', 'INDIVIDUAL']
      };

      const renderParameterInput = (key: string, defaultValue: any, currentValue: any) => {
        // change_temperature节点的特殊处理
        if (node.type === 'change_temperature') {
          return renderChangeTemperatureInput(key, defaultValue, currentValue);
        }

        // change_gas_flow节点的特殊处理
        if (node.type === 'change_gas_flow') {
          return renderChangeGasFlowInput(key, defaultValue, currentValue);
        }

        // 处理枚举类型
        if (key in enumValues) {
          return (
            <select
              value={currentValue ?? defaultValue}
              onChange={(e) => updateParameters({ ...node.data.parameters, [key]: e.target.value })}
              className="property-select glass"
            >
              {enumValues[key].map((value: string) => (
                <option key={value} value={value}>
                  {getParameterEnumLabel(key, value)}
                </option>
              ))}
            </select>
          );
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
              type="text"
              value={currentValue ?? defaultValue}
              onChange={(e) => {
                const value = parseScientificNotation(e.target.value);
                updateParameters({ ...node.data.parameters, [key]: value });
              }}
              onBlur={(e) => {
                // 失去焦点时格式化显示
                const value = parseScientificNotation(e.target.value);
                // 这里可以添加格式化逻辑，比如 1000 -> 1k
              }}
              onWheel={(e) => {
                // 禁用滚轮改变数值
                e.preventDefault();
              }}
              className="property-input glass"
              placeholder={getParameterPlaceholder(key)}
            />
          );
        }
        return (
          <input
            type="text"
            value={currentValue ?? defaultValue}
            onChange={(e) => updateParameters({ ...node.data.parameters, [key]: e.target.value })}
            className="property-input glass"
            placeholder={getParameterPlaceholder(key)}
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
              placeholder={getParameterPlaceholder(key)}
              title="运行时自动计算"
            />
          );
        }

        if (key === 'target_temperature') {
          return (
            <div className="temperature-input-group">
              <input
                type="text"
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
                placeholder={getParameterPlaceholder(key)}
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
                type="text"
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
                placeholder={getParameterPlaceholder(key)}
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

      // change_gas_flow节点的专用输入组件
      const renderChangeGasFlowInput = (key: string, defaultValue: any, currentValue: any) => {
        // 设备选择下拉组件
        if (key === 'device_selection') {
          const availableDevices = getAvailableMfcDevices();

          return (
            <select
              value={currentValue ?? defaultValue}
              onChange={(e) => {
                const selection = e.target.value;
                const [address, gasType] = selection.split(':');

                // 解析设备信息，更新相关参数
                const selectedDevice = availableDevices.find(d => d.value === selection);
                updateParameters({
                  ...node.data.parameters,
                  [key]: selection,
                  device_address: parseInt(address),
                  gas_type: gasType,
                  max_flow_sccm: selectedDevice?.maxFlow || 200
                });
              }}
              className="property-select glass"
              title="选择MFC设备和气体类型"
            >
              {availableDevices.map(device => (
                <option key={device.value} value={device.value}>
                  {device.label}
                </option>
              ))}
            </select>
          );
        }

        // 目标流量输入组件
        if (key === 'target_flow_rate') {
          const maxFlow = node.data.parameters?.max_flow_sccm || 200;

          return (
            <div className="flow-input-group">
              <input
                type="text"
                value={currentValue ?? defaultValue}
                onChange={(e) => {
                  const value = e.target.value;
                  // 允许数字和一位小数点
                  if (!/^\d*\.?\d?$/.test(value)) return;

                  const numValue = Number(value);
                  // 边界检查和静默修正
                  const correctedValue = Math.max(0, Math.min(maxFlow, numValue));

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
                  const correctedValue = Math.max(0, Math.min(maxFlow, numValue));

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
                min={0}
                max={maxFlow}
                step={0.1}
                placeholder={getParameterPlaceholder(key)}
                title={`目标流量 (0-${maxFlow} sccm)`}
              />
              <span className="input-unit">sccm</span>
            </div>
          );
        }

        // 禁用运行时自动计算的参数
        if (key === 'current_flow_rate' || key === 'stabilization_time' ||
            key === 'device_address' || key === 'gas_type' || key === 'max_flow_sccm') {
          return (
            <input
              type="text"
              value={currentValue ?? defaultValue}
              disabled
              className="property-input glass disabled"
              placeholder={getParameterPlaceholder(key)}
              title="运行时自动设置"
            />
          );
        }

        // 默认输入框（用于其他可能的参数）
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
              <label className="property-label">{getParameterLabel(key)}</label>
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

