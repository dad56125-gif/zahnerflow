// 参数标签配置
export const getParameterLabel = (key: string, nodeType?: string): string => {
  // 根据节点类型确定EIS幅值单位
  const getEisAmplitudeUnit = () => nodeType === 'eis_galvanostatic' ? '(A)' : '(V)';

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

// 参数占位符配置
export const getParameterPlaceholder = (key: string): string => {
  const placeholders: Record<string, string> = {
    potential: '输入电位值，单位：伏特',
    current: '输入电流值，单位：安培',
    polarization_voltage: '输入极化电压，单位：伏特',
    polarization_current: '输入极化电流，单位：安培',
    measurement_duration: '输入测量持续时间，单位：秒',
    sampling_interval: '输入采样间隔，单位：秒',
    min_voltage: '输入最小电压安全限，单位：伏特',
    max_voltage: '输入最大电压安全限，单位：伏特',
    min_current: '输入最小电流安全限，单位：安培',
    max_current: '输入最大电流安全限，单位：安培',
    start_voltage: '输入起始电位，单位：伏特',
    end_voltage: '输入结束电位，单位：伏特',
    start_current: '输入起始电流，单位：安培',
    end_current: '输入结束电流，单位：安培',
    eis_lower_frequency: '输入低频限制，单位：赫兹',
    eis_upper_frequency: '输入高频限制，单位：赫兹',
    eis_start_frequency: '输入起始频率，单位：赫兹',
    eis_lower_periods: '输入低频区测量周期数',
    eis_upper_periods: '输入高频区测量周期数',
    eis_lower_steps: '输入低频区每十倍频程扫描点数',
    eis_upper_steps: '输入高频区每十倍频程扫描点数',
    eis_amplitude: '输入交流扰动幅值',
    eis_potential: '输入直流偏置电位，单位：伏特',
    eis_current: '输入直流偏置电流，单位：安培',
    mode: '选择模式',
    loop_count: '输入循环次数',
    loop_variable: '输入循环变量名',
    start_value: '输入起始值',
    step: '输入步长',
    target_temperature: '输入目标温度，单位：摄氏度',
    rate: '输入温度变化速率，单位：摄氏度每分钟',
    tolerance: '输入温度容差，单位：摄氏度',
    target_flow_rate: '输入目标流量，单位：sccm',
    device_selection: '选择设备',
    description: '输入节点描述'
  };
  return placeholders[key] || `输入${getParameterLabel(key)}`;
};

// 枚举值配置
export const enumValues: Record<string, string[]> = {
  eis_scan_direction: ['START_TO_MAX', 'START_TO_MIN'],
  eis_scan_strategy: ['SINGLE_SINE', 'MULTI_SINE'],
  start_voltage_reference: ['absolute', 'ocv'],
  end_voltage_reference: ['absolute', 'ocv'],
  scanDirection: ['START_TO_MAX', 'MAX_TO_START', 'START_TO_MIN', 'MIN_TO_START'],
  scanStrategy: ['SINGLE_SINE', 'MULTI_SINE', 'NOISE'],
  potentiostatMode: ['POTMODE_POTENTIOSTATIC', 'POTMODE_GALVANOSTATIC'],
  fileNaming: ['COUNTER', 'DATE_TIME', 'INDIVIDUAL']
};

// 枚举标签配置
export const getParameterEnumLabel = (key: string, value: string): string => {
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

// 隐藏参数配置
export const getHiddenParameters = (nodeType: string): string[] => {
  if (nodeType === 'change_temperature') return ['current_temperature', 'calculated_duration', 'tolerance', 'stabilization_time'];
  if (nodeType === 'change_gas_flow') return ['current_flow_rate', 'device_address', 'gas_type', 'max_flow_sccm', 'stabilization_time'];
  return [];
};