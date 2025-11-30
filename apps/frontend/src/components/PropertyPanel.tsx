import React, { useState, useRef, useEffect } from 'react';
import { ElectrochemicalNode, getNodeConfig, WorkstationType } from '../types/nodes';
import { useCanvasStore, useWorkflowParameterStore } from '../services/stores';
import { useMfc } from '../modules/mfc';
import { MfcDeviceInfo } from '../modules/mfc/mfcTypes';
import Portal from '../components/Portal';

interface PropertyPanelProps {
  selectedWorkstation: WorkstationType | null;
}

// 通用dropdown组件
interface DropdownProps {
  isOpen: boolean;
  isHiding: boolean;
  onClose: () => void;
  position: { top: number; left: number; width: number };
  children: React.ReactNode;
}

const Dropdown: React.FC<DropdownProps> = ({ isOpen, isHiding, onClose, position, children }) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || isHiding) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, isHiding, onClose]);

  if (!isOpen && !isHiding) return null;

  return (
    <Portal>
      <div
        ref={dropdownRef}
        className={`dropdown_base overlay_base ${isHiding ? 'hiding' : 'show'}`}
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          width: `${position.width}px`,
          pointerEvents: 'auto'
        } as React.CSSProperties}
      >
        <div className="dropdown_list">
          {children}
        </div>
      </div>
    </Portal>
  );
};

export const PropertyPanel = React.forwardRef<HTMLDivElement, PropertyPanelProps>(
  ({ selectedWorkstation }, ref) => {
    const { selectedNode: node, updateNode } = useCanvasStore();
    const {
      currentEditingWorkflowId,
      setWorkflowDefaultParameters,
      generateTemporaryWorkflowId,
      getWorkflowDefaultParameters
    } = useWorkflowParameterStore();
    const [activeTab, setActiveTab] = useState<'basic' | 'parameters' | 'data'>('basic');

    // Dropdown状态管理
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);
    const [hidingDropdown, setHidingDropdown] = useState<string | null>(null);
    const [dropdownPositions, setDropdownPositions] = useState<Record<string, { top: number; left: number; width: number }>>({});

    // Dropdown辅助函数
    const openDropdownMenu = (dropdownId: string, event: React.MouseEvent) => {
      const rect = event.currentTarget.getBoundingClientRect();
      setDropdownPositions(prev => ({
        ...prev,
        [dropdownId]: {
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width
        }
      }));
      setOpenDropdown(dropdownId);
    };

    const closeDropdownMenu = (dropdownId: string) => {
      setHidingDropdown(dropdownId);
      setTimeout(() => {
        setOpenDropdown(null);
        setHidingDropdown(null);
      }, 250); // 匹配CSS动画时长
    };

    // 获取真实的MFC设备信息
    const [mfcState] = useMfc();
    const { availableDevices } = mfcState;

    // 辅助函数：将真实MFC设备转换为下拉选择格式
    const getAvailableMfcDevices = () => {
      if (availableDevices.length === 0) {
        // 如果没有真实设备，返回空数组或显示提示信息
        return [
          { value: '', label: '未检测到MFC设备', maxFlow: 0 }
        ];
      }

      // 转换真实设备信息为下拉选择格式（按照文档要求：地址:气体类型）
      return availableDevices.map((device: MfcDeviceInfo) => ({
        value: `${device.address}:${device.gas_type}`,
        label: `${device.address}:${device.gas_type}`,
        maxFlow: device.max_flow_sccm
      }));
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

    // 检查当前节点参数是否与工作流默认参数相同
    const isCurrentParametersSameAsDefault = () => {
      if (!node || !node.data.parameters) {
        return false;
      }

      const defaultParameters = getWorkflowDefaultParameters(node.type);
      if (!defaultParameters) {
        return false;
      }

      // 深度比较两个参数对象
      const currentParams = node.data.parameters;
      const defaultParams = defaultParameters;

      // 比较所有键值对
      for (const key in currentParams) {
        if (currentParams[key] !== defaultParams[key]) {
          return false;
        }
      }

      // 确保默认参数中没有当前参数没有的键
      for (const key in defaultParams) {
        if (!(key in currentParams)) {
          return false;
        }
      }

      return true;
    };

    // 保存当前节点参数为工作流默认参数
    const saveAsWorkflowDefault = () => {
      if (!node || !node.data.parameters) {
        return;
      }

      // 如果没有当前编辑的工作流，创建一个临时工作流
      if (!currentEditingWorkflowId) {
        const tempWorkflowId = generateTemporaryWorkflowId();
        useWorkflowParameterStore.getState().setCurrentEditingWorkflowId(tempWorkflowId);
      }

      // 保存参数
      setWorkflowDefaultParameters(node.type, node.data.parameters);

      // 显示成功消息（可选）
      console.log(`✅ 已保存 ${node.name} 的参数为工作流默认配置`);
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
        start_voltage_reference: '起始电位参考模式',
        end_voltage: '结束电位 (V)',
        end_voltage_reference: '结束电位参考模式',

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
        start_value: '起始值（次数）',
        step: '步长',
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
        start_voltage_reference: {
          'absolute': '绝对电位',
          'ocv': '开路电位'
        },
        end_voltage_reference: {
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
        start_voltage_reference: ['absolute', 'ocv'],
        end_voltage_reference: ['absolute', 'ocv'],
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

        // 处理枚举类型 - 使用UIKit dropdown
        if (key in enumValues) {
          const dropdownId = `param-${key}`;
          const currentValue = (node.data.parameters || {})[key] ?? defaultValue;
          const selectedLabel = getParameterEnumLabel(key, currentValue);

          return (
            <div className="dropdown-wrapper" style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn_base btn_layout btn_style_common btn_medium btn_secondary glass"
                onClick={(e) => openDropdownMenu(dropdownId, e)}
                style={{ width: '100%', justifyContent: 'space-between' }}
              >
                <span>{selectedLabel}</span>
                <svg className={`dropdown-arrow ${openDropdown === dropdownId ? 'rotated' : ''}`} viewBox="-10 -6 20 12" width="12" height="12">
                  <path
                    d="M -8 -3 L 0 5 L 8 -3"
                    fill="none"
                    stroke="rgba(255,255,255,0.8)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              <Dropdown
                isOpen={openDropdown === dropdownId}
                isHiding={hidingDropdown === dropdownId}
                onClose={() => closeDropdownMenu(dropdownId)}
                position={dropdownPositions[dropdownId] || { top: 0, left: 0, width: 280 }}
              >
                {enumValues[key].map((value: string) => (
                  <div
                    key={value}
                    className={`dropdown_option ${currentValue === value ? 'selected' : ''}`}
                    onClick={() => {
                      updateParameters({ ...node.data.parameters, [key]: value });
                      closeDropdownMenu(dropdownId);
                    }}
                  >
                    {getParameterEnumLabel(key, value)}
                  </div>
                ))}
              </Dropdown>
            </div>
          );
        }

        if (typeof defaultValue === 'boolean') {
          const dropdownId = `bool-${key}`;
          const currentValue = (node.data.parameters || {})[key] ?? defaultValue;
          const selectedLabel = currentValue ? '启用' : '禁用';

          return (
            <div className="dropdown-wrapper" style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn_base btn_layout btn_style_common btn_medium btn_secondary glass"
                onClick={(e) => openDropdownMenu(dropdownId, e)}
                style={{ width: '100%', justifyContent: 'space-between' }}
              >
                <span>{selectedLabel}</span>
                <svg className={`dropdown-arrow ${openDropdown === dropdownId ? 'rotated' : ''}`} viewBox="-10 -6 20 12" width="12" height="12">
                  <path
                    d="M -8 -3 L 0 5 L 8 -3"
                    fill="none"
                    stroke="rgba(255,255,255,0.8)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              <Dropdown
                isOpen={openDropdown === dropdownId}
                isHiding={hidingDropdown === dropdownId}
                onClose={() => closeDropdownMenu(dropdownId)}
                position={dropdownPositions[dropdownId] || { top: 0, left: 0, width: 280 }}
              >
                <div
                  className={`dropdown_option ${currentValue === true ? 'selected' : ''}`}
                  onClick={() => {
                    updateParameters({ ...node.data.parameters, [key]: true });
                    closeDropdownMenu(dropdownId);
                  }}
                >
                  启用
                </div>
                <div
                  className={`dropdown_option ${currentValue === false ? 'selected' : ''}`}
                  onClick={() => {
                    updateParameters({ ...node.data.parameters, [key]: false });
                    closeDropdownMenu(dropdownId);
                  }}
                >
                  禁用
                </div>
              </Dropdown>
            </div>
          );
        }
        if (typeof defaultValue === 'number') {
          return (
            <input
              type="text"
              value={currentValue ?? defaultValue}
              onChange={(e) => {
                const input = e.target.value;
                // 允许空值和正在输入的数字（包括小数点）
                if (input === '' || /^-?\d*\.?\d*$/.test(input)) {
                  updateParameters({ ...node.data.parameters, [key]: input });
                }
              }}
              onBlur={(e) => {
                // 失去焦点时解析并转换为数值
                const value = parseScientificNotation(e.target.value);
                updateParameters({ ...node.data.parameters, [key]: value });
              }}
              onWheelCapture={(e) => {
                // 禁用滚轮改变数值 - 使用capture阶段避免被动监听器问题
                e.preventDefault();
                e.stopPropagation();
              }}
              className="input glass"
              placeholder={getParameterPlaceholder(key)}
            />
          );
        }
        return (
          <input
            type="text"
            value={currentValue ?? defaultValue}
            onChange={(e) => updateParameters({ ...node.data.parameters, [key]: e.target.value })}
            className="input glass"
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
              className="input glass disabled"
              placeholder={getParameterPlaceholder(key)}
              title="运行时自动计算"
            />
          );
        }

        if (key === 'target_temperature') {
          return (
            <input
              type="text"
              value={currentValue ?? defaultValue}
              onChange={(e) => {
                const value = e.target.value;
                // 只允许数字输入
                if (!/^\d*$/.test(value)) return;

                // 实时更新显示值，不进行边界检查
                updateParameters({
                  ...node.data.parameters,
                  [key]: value
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
                // 只在失去焦点时进行边界检查
                const correctedValue = Math.max(25, Math.min(1000, numValue));

                updateParameters({
                  ...node.data.parameters,
                  [key]: correctedValue
                });
              }}
              onKeyDown={(e) => {
                // 阻止非数字输入
                if (!/^\d$/.test(e.key) &&
                    !['Backspace', 'Delete', 'Tab', 'Enter', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                  e.preventDefault();
                }
              }}
              className="input glass"
              min={25}
              max={1000}
              step={1}
              placeholder={getParameterPlaceholder(key)}
              title="目标温度 (25-1000°C)"
            />
          );
        }

        if (key === 'rate') {
          return (
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
              className="input glass"
              min={0.1}
              max={20}
              step={0.1}
              placeholder={getParameterPlaceholder(key)}
              title="温度变化速率 (0.1-20 °C/min)"
            />
          );
        }

        return (
          <input
            type="text"
            value={currentValue ?? defaultValue}
            disabled
            className="input glass disabled"
            title="系统参数"
          />
        );
      };

      // change_gas_flow节点的专用输入组件
      const renderChangeGasFlowInput = (key: string, defaultValue: any, currentValue: any) => {
        // 设备选择下拉组件 - 使用UIKit dropdown
        if (key === 'device_selection') {
          const availableDevices = getAvailableMfcDevices();
          const dropdownId = `mfc-device-selection`;
          const currentValue = (node.data.parameters || {})[key] ?? defaultValue;
          const selectedDevice = availableDevices.find((d: { value: string; label: string; maxFlow: number }) => d.value === currentValue);
          const selectedLabel = selectedDevice?.label || '选择设备';

          return (
            <div className="dropdown-wrapper" style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn_base btn_layout btn_style_common btn_medium btn_secondary glass"
                onClick={(e) => openDropdownMenu(dropdownId, e)}
                style={{ width: '100%', justifyContent: 'space-between' }}
                title="选择MFC设备和气体类型"
              >
                <span>{selectedLabel}</span>
                <svg className={`dropdown-arrow ${openDropdown === dropdownId ? 'rotated' : ''}`} viewBox="-10 -6 20 12" width="12" height="12">
                  <path
                    d="M -8 -3 L 0 5 L 8 -3"
                    fill="none"
                    stroke="rgba(255,255,255,0.8)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              <Dropdown
                isOpen={openDropdown === dropdownId}
                isHiding={hidingDropdown === dropdownId}
                onClose={() => closeDropdownMenu(dropdownId)}
                position={dropdownPositions[dropdownId] || { top: 0, left: 0, width: 280 }}
              >
                {availableDevices.length > 0 ? (
                  availableDevices.map((device: { value: string; label: string; maxFlow: number }) => (
                    <div
                      key={device.value}
                      className={`dropdown_option ${currentValue === device.value ? 'selected' : ''}`}
                      onClick={() => {
                        const [address, gasType] = device.value.split(':');
                        updateParameters({
                          ...node.data.parameters,
                          [key]: device.value,
                          device_address: parseInt(address),
                          gas_type: gasType,
                          max_flow_sccm: device.maxFlow || 200
                        });
                        closeDropdownMenu(dropdownId);
                      }}
                    >
                      {device.label}
                    </div>
                  ))
                ) : (
                  <div className="dropdown_empty">未检测到MFC设备</div>
                )}
              </Dropdown>
            </div>
          );
        }

        // 目标流量输入组件
        if (key === 'target_flow_rate') {
          const maxFlow = node.data.parameters?.max_flow_sccm || 200;

          return (
            <input
              type="text"
              value={currentValue ?? defaultValue}
              onChange={(e) => {
                const value = e.target.value;
                // 允许数字和一位小数点
                if (!/^\d*\.?\d?$/.test(value)) return;

                // 实时更新显示值，不进行边界检查
                updateParameters({
                  ...node.data.parameters,
                  [key]: value
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
                // 只在失去焦点时进行边界检查
                const correctedValue = Math.max(0, Math.min(maxFlow, numValue));

                updateParameters({
                  ...node.data.parameters,
                  [key]: correctedValue
                });
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
              className="input glass"
              min={0}
              max={maxFlow}
              step={0.1}
              placeholder={getParameterPlaceholder(key)}
              title={`目标流量 (0-${maxFlow} sccm)`}
            />
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
              className="input glass disabled"
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
            className="input glass disabled"
            title="系统参数"
          />
        );
      };

      // 定义需要隐藏的自动计算参数
      const getHiddenParameters = (nodeType: string): string[] => {
        switch (nodeType) {
          case 'change_temperature':
            return ['current_temperature', 'calculated_duration', 'tolerance', 'stabilization_time'];
          case 'change_gas_flow':
            return ['current_flow_rate', 'device_address', 'gas_type', 'max_flow_sccm', 'stabilization_time'];
          default:
            return [];
        }
      };

      const hiddenParams = getHiddenParameters(node.type);

      // 过滤掉隐藏的参数
      const visibleParameters = Object.entries(defaults).filter(([key]) => !hiddenParams.includes(key));

      // 判断按钮状态
      const isDefaultButtonActive = isCurrentParametersSameAsDefault();

      return (
        <div className="properties-section">
          <div className="kit_row">
            <div className="kit_row_left">
              <h3 className="section-title">参数</h3>
            </div>
            <div className="kit_row_right">
              <button
                onClick={saveAsWorkflowDefault}
                className={`btn btn_base btn_layout btn_style_common btn_mini glass ${isDefaultButtonActive ? 'btn_primary' : 'btn_secondary'}`}
                disabled={isDefaultButtonActive}
                title={isDefaultButtonActive ? "当前参数已是工作流默认配置" : "将当前参数保存为工作流默认配置"}
              >
                <span className="btn-icon">{isDefaultButtonActive ? '✅' : '💾'}</span>
                <span className="btn-text">
                  {isDefaultButtonActive ? '当前工作流默认' : '设为工作流默认'}
                </span>
              </button>
            </div>
          </div>
          {visibleParameters.map(([key, defaultValue]) => (
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
                <span className="btn-icon">📋</span>
                <span className="btn-text">基本</span>
              </button>
              <button
                className={`btn_base btn_layout btn_style_common btn_small glass ${activeTab === 'parameters' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('parameters')}
              >
                <span className="btn-icon">⚙️</span>
                <span className="btn-text">参数</span>
              </button>
              <button
                className={`btn_base btn_layout btn_style_common btn_small glass ${activeTab === 'data' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('data')}
              >
                <span className="btn-icon">📊</span>
                <span className="btn-text">数据</span>
              </button>
            </div>
            {activeTab === 'basic' && renderBasicProperties()}
            {activeTab === 'parameters' && renderParameters()}
            {activeTab === 'data' && renderDataProperties()}
          </div>
        </div>
      </div>
    );
  }
);

