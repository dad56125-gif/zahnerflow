import React, { useState } from 'react';
import { ElectrochemicalNode, getNodeConfig, WorkstationType } from '../nodes/types';

interface PropertyPanelProps {
  node: ElectrochemicalNode;
  onUpdate: (updatedNode: ElectrochemicalNode) => void;
  selectedWorkstation: WorkstationType | null;
}

export const PropertyPanel: React.FC<PropertyPanelProps> = ({ node, onUpdate, selectedWorkstation }) => {
  const [activeTab, setActiveTab] = useState<'basic' | 'parameters' | 'data'>('basic');

  const updateNodeData = (updates: Partial<ElectrochemicalNode['data']>) => {
    const updatedNode = {
      ...node,
      data: {
        ...node.data,
        ...updates,
        updatedAt: new Date()
      }
    };
    onUpdate(updatedNode);
  };

  const updateParameters = (parameters: Record<string, any>) => {
    updateNodeData({ parameters });
  };

  // 检查节点是否有后端支持
  const hasBackendSupport = () => {
    if (!selectedWorkstation) return false;

    if (selectedWorkstation === 'zahner-zennium') {
      return [
        'startup', 'shutdown', 'eis_potentiostatic', 'eis_galvanostatic', 'ocp_measurement',
        'chronoamperometry', 'chronopotentiometry', 'voltage_ramp', 'current_ramp', 'lsv_measurement'
      ].includes(node.type);
    }

    return false; // Gamry工作站暂无后端支持
  };

  const renderBasicProperties = () => (
    <div className="properties-section">
      <h3 className="section-title">
        基本属性
      </h3>
      
      <div className="property-group">
        <label className="property-label">
          描述
        </label>
        <textarea
          value={node.data.description || ''}
          onChange={(e) => updateNodeData({ description: e.target.value })}
          className="property-textarea glass"
          placeholder="输入节点描述"
          rows={3}
        />
      </div>

      <div className="property-group">
        <label className="property-label">
          节点状态
        </label>
        <div className="status-indicator glass">
          <span className={`status-dot ${hasBackendSupport() ? 'status-ready' : 'status-error'}`} />
          <span className="status-text">
            {hasBackendSupport() ? '有效' : '无效'}
          </span>
          <span className="status-subtitle">
            ({hasBackendSupport() ? '有后端支持' : '无后端支持'})
          </span>
        </div>
      </div>
    </div>
  );

  const renderParameters = () => {
    const config = getNodeConfig(node.type);
    if (!config.defaultParameters || Object.keys(config.defaultParameters).length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-icon">⚙️</div>
          <div className="empty-text">该节点类型暂无参数配置</div>
        </div>
      );
    }

    const renderParameterInput = (key: string, defaultValue: any, currentValue: any) => {
      // 处理枚举类型
      const enumValues = {
        eis_scan_direction: ['START_TO_MAX', 'START_TO_MIN'],
        eis_scan_strategy: ['SINGLE_SINE', 'MULTI_SINE'],
        voltage_reference: ['absolute', 'ocv'],
        scanDirection: ['START_TO_MAX', 'MAX_TO_START', 'START_TO_MIN', 'MIN_TO_START'],
        scanStrategy: ['SINGLE_SINE', 'MULTI_SINE', 'NOISE'],
        potentiostatMode: ['POTMODE_POTENTIOSTATIC', 'POTMODE_GALVANOSTATIC'],
        fileNaming: ['COUNTER', 'DATE_TIME', 'INDIVIDUAL']
      };

      // 布尔值处理
      if (typeof defaultValue === 'boolean') {
        return (
          <select
            value={currentValue ?? defaultValue}
            onChange={(e) => {
              updateParameters({
                ...node.data.parameters,
                [key]: e.target.value === 'true'
              });
            }}
            className="property-select glass"
          >
            <option value="true">启用</option>
            <option value="false">禁用</option>
          </select>
        );
      }

      if (key in enumValues) {
        return (
          <select
            value={currentValue ?? defaultValue}
            onChange={(e) => {
              updateParameters({
                ...node.data.parameters,
                [key]: e.target.value
              });
            }}
            className="property-select glass"
          >
            {enumValues[key as keyof typeof enumValues].map((value: string) => (
              <option key={value} value={value}>
                {getParameterEnumLabel(key, value)}
              </option>
            ))}
          </select>
        );
      }

      // 处理数字类型
      if (typeof defaultValue === 'number') {
        // 支持科学计数法解析
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

        return (
          <input
            type="text"
            value={currentValue ?? defaultValue}
            onChange={(e) => {
              const value = parseScientificNotation(e.target.value);
              updateParameters({
                ...node.data.parameters,
                [key]: value
              });
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

      // 处理字符串类型
      return (
        <input
          type="text"
          value={currentValue ?? defaultValue}
          onChange={(e) => {
            updateParameters({
              ...node.data.parameters,
              [key]: e.target.value
            });
          }}
          className="property-input glass"
          placeholder={getParameterPlaceholder(key)}
        />
      );
    };

    return (
      <div className="properties-section">
        {Object.entries(config.defaultParameters).map(([key, defaultValue]) => (
          <div className="property-group" key={key}>
            <label className="property-label">
              {getParameterLabel(key)}
            </label>
            {renderParameterInput(key, defaultValue, node.data.parameters?.[key])}
          </div>
        ))}
      </div>
    );
  };

  const renderDataProperties = () => (
    <div className="properties-section">
      <h3 className="section-title">
        数据属性
      </h3>

      <div className="property-group">
        <label className="property-label">
          创建时间
        </label>
        <div className="property-value glass">
          {new Date(node.data.createdAt).toLocaleString()}
        </div>
      </div>

      <div className="property-group">
        <label className="property-label">
          更新时间
        </label>
        <div className="property-value glass">
          {new Date(node.data.updatedAt).toLocaleString()}
        </div>
      </div>

      {node.data.results && (
        <div className="property-group">
          <label className="property-label">
            执行结果
          </label>
          <div className="results-container glass">
            <pre className="results-json">
              {JSON.stringify(node.data.results, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );

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
      counter: '计数器起始值'
    };
    return labels[key] || key;
  };

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
      counter: '输入计数器起始值，通常为1'
    };
    return placeholders[key] || `输入${getParameterLabel(key)}`;
  };

  return (
    <div className="property-panel glass">
      {/* 标题 */}
      <div className="property-panel-header">
        <h2 className="property-panel-title">
          属性面板
        </h2>
        <div className="property-panel-subtitle">
          {node.name}
        </div>
      </div>

      {/* 标签页 */}
      <div className="property-tabs">
        <button
          className={`btn glass ${activeTab === 'basic' ? 'btn-primary' : ''}`}
          onClick={() => setActiveTab('basic')}
        >
          <span className="btn-icon">📋</span>
          <span className="btn-text">基本</span>
        </button>
        
        <button
          className={`btn glass ${activeTab === 'parameters' ? 'btn-primary' : ''}`}
          onClick={() => setActiveTab('parameters')}
        >
          <span className="btn-icon">⚙️</span>
          <span className="btn-text">参数</span>
        </button>
        
        <button
          className={`btn glass ${activeTab === 'data' ? 'btn-primary' : ''}`}
          onClick={() => setActiveTab('data')}
        >
          <span className="btn-icon">📊</span>
          <span className="btn-text">数据</span>
        </button>
      </div>

      {/* 内容区域 */}
      <div className="property-panel-content">
        <div className="property-content">
          {activeTab === 'basic' && renderBasicProperties()}
          {activeTab === 'parameters' && renderParameters()}
          {activeTab === 'data' && renderDataProperties()}
        </div>
      </div>
    </div>
  );
};