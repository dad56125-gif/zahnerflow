// 参数标签配置
export const getParameterLabel = (key: string, nodeType?: string): string => {
  // 根据节点类型确定EIS幅值单位
  const getEisAmplitudeUnit = () => nodeType === 'eis_galvanostatic' ? '(A)' : '(V)';

  const labels: Record<string, string> = {
    // 通用测量参数
    polarizationVoltage: '极化电压 (V)',
    polarizationCurrent: '极化电流 (A)',
    measurementDuration: '测量持续时间 (s)',
    samplingInterval: '采样间隔 (s)',
    min_voltage: '最小电压安全限 (V)',
    max_voltage: '最大电压安全限 (V)',
    min_current: '最小电流安全限 (A)',
    max_current: '最大电流安全限 (A)',

    // 电位扫描参数
    start_voltage: '起始电位 (V)',
    startVoltageReference: '起始电位参考模式',
    end_voltage: '结束电位 (V)',
    endVoltageReference: '结束电位参考模式',

    // 电流扫描参数
    startCurrent: '起始电流 (A)',
    endCurrent: '结束电流 (A)',

    // EIS测量参数
    eisLowerFrequency: '低频限制 (Hz)',
    eisUpperFrequency: '高频限制 (Hz)',
    eisStartFrequency: '起始频率（由扫描方向自动确定）',
    eisLowerPeriods: '低频区测量周期数',
    eisUpperPeriods: '高频区测量周期数',
    eisLowerSteps: '低频区每十倍频程扫描点数',
    eisUpperSteps: '高频区每十倍频程扫描点数',
    eisScanDirection: '扫描方向（自动确定起始频率）',
    eisScanStrategy: '扫描策略',
    eis_amplitude: `交流扰动幅值 ${getEisAmplitudeUnit()}`,
    eisPotential: '直流偏置电位 (V)',
    eisCurrent: '直流偏置电流 (A)',
    enableDcBias: '直流偏置',

    // 其他参数
    mode: '模式',
    potential: '电位 (V)',
    current: '电流 (A)',
    duration: '持续时间 (s)',
    interval: '间隔 (s)',
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
    loopCount: '循环次数',
    max_loops: '最大循环次数',
    condition: '条件',
    branch_mode: '分支模式',
    amplitude: '测量幅度 (V)',
    potentiostatMode: '恒电位仪模式',
    selectPotentiostat: '选择恒电位仪',
    outputPath: '输出路径',
    outputFileName: '输出文件名',
    fileNaming: '文件命名方式',
    counter: '计数器起始值',

    // 温度节点参数
    targetTemperature: '目标温度 (°C)',
    rate: '温度变化速率 (°C/min)',
    currentTemperature: '当前温度 (°C)',
    calculatedDuration: '计算时长 (min)',
    tolerance: '温度容差 (°C)',

    // MFC流量节点参数
    deviceSelection: '设备选择',
    targetFlowRate: '目标流量 (sccm)',
    currentFlowRate: '当前流量 (sccm)',
    deviceAddress: '设备地址',
    gasType: '气体类型',
    maxFlowSccm: '最大流量 (sccm)',

    // 高级测量 - 切换节点参数
    current_1: '电流值 1 (A)',
    current_2: '电流值 2 (A)',
    potential_1: '电位值 1 (V)',
    potential_2: '电位值 2 (V)',
    holdTime1: '保持时间 1 (s)',
    holdTime2: '保持时间 2 (s)',

    // 高级测量 - 阶梯节点参数
    stepCurrent: '电流步长 (A)',
    stepPotential: '电位步长 (V)',
    hold_time: '每阶保持时间 (s)',
    check_battery_health: '测量模式',
    hour: '小时',
    minute: '分钟',
    nextDay: '次日执行',
    workflowId: '子工作流',
    workflowName: '工作流名称',
    workflowShortId: '工作流编号',
    nodeCount: '节点数'
  };
  return labels[key] || key;
};

// 参数占位符配置
export const getParameterPlaceholder = (key: string): string => {
  const placeholders: Record<string, string> = {
    potential: '输入电位值，单位：伏特',
    current: '输入电流值，单位：安培',
    polarizationVoltage: '输入极化电压，单位：伏特',
    polarizationCurrent: '输入极化电流，单位：安培',
    measurementDuration: '输入测量持续时间，单位：秒',
    samplingInterval: '输入采样间隔，单位：秒',
    min_voltage: '输入最小电压安全限，单位：伏特',
    max_voltage: '输入最大电压安全限，单位：伏特',
    min_current: '输入最小电流安全限，单位：安培',
    max_current: '输入最大电流安全限，单位：安培',
    start_voltage: '输入起始电位，单位：伏特',
    end_voltage: '输入结束电位，单位：伏特',
    startCurrent: '输入起始电流，单位：安培',
    endCurrent: '输入结束电流，单位：安培',
    eisLowerFrequency: '输入低频限制，单位：赫兹',
    eisUpperFrequency: '输入高频限制，单位：赫兹',
    eisStartFrequency: '由扫描方向自动确定',
    eisLowerPeriods: '输入低频区测量周期数',
    eisUpperPeriods: '输入高频区测量周期数',
    eisLowerSteps: '输入低频区每十倍频程扫描点数',
    eisUpperSteps: '输入高频区每十倍频程扫描点数',
    eis_amplitude: '输入交流扰动幅值',
    eisPotential: '输入直流偏置电位，单位：伏特',
    eisCurrent: '输入直流偏置电流，单位：安培',
    mode: '选择模式',
    loopCount: '输入循环次数',
    targetTemperature: '输入目标温度，单位：摄氏度',
    rate: '输入温度变化速率，单位：摄氏度每分钟',
    tolerance: '输入温度容差，单位：摄氏度',
    targetFlowRate: '输入目标流量，单位：sccm',
    deviceSelection: '选择设备',
    description: '输入节点描述',
    hour: '选择小时',
    minute: '选择分钟'
  };
  return placeholders[key] || `输入${getParameterLabel(key)}`;
};

// 枚举值配置
export const enumValues: Record<string, string[]> = {
  eisScanDirection: ['START_TO_MAX', 'START_TO_MIN'],
  eisScanStrategy: ['SINGLE_SINE', 'MULTI_SINE'],
  startVoltageReference: ['absolute', 'ocv'],
  endVoltageReference: ['absolute', 'ocv'],
  potentiostatMode: ['POTMODE_POTENTIOSTATIC', 'POTMODE_GALVANOSTATIC'],
  fileNaming: ['COUNTER', 'DATE_TIME', 'INDIVIDUAL']
};

// 枚举标签配置
export const getParameterEnumLabel = (key: string, value: string): string => {
  const enumLabels: Record<string, Record<string, string>> = {
    eisScanDirection: {
      'START_TO_MAX': '由低频扫向高频',
      'START_TO_MIN': '由高频扫向低频'
    },
    eisScanStrategy: {
      'SINGLE_SINE': '单正弦波',
      'MULTI_SINE': '多正弦波'
    },
    startVoltageReference: {
      'absolute': '绝对电位',
      'ocv': '开路电位'
    },
    endVoltageReference: {
      'absolute': '绝对电位',
      'ocv': '开路电位'
    },
    potentiostatMode: {
      'POTMODE_POTENTIOSTATIC': '恒电位模式',
      'POTMODE_GALVANOSTATIC': '恒电流模式'
    },
    fileNaming: {
      'COUNTER': '计数器',
      'DATE_TIME': '日期时间',
      'INDIVIDUAL': '自定义'
    },
    check_battery_health: {
      'true': '电池健康检测',
      'false': '普通测量'
    }
  };
  return enumLabels[key]?.[value] || value;
};

// 隐藏参数配置
export const getHiddenParameters = (nodeType: string): string[] => {
  if (nodeType === 'change_temperature') return ['currentTemperature', 'calculatedDuration', 'tolerance', 'stabilizationTime'];
  if (nodeType === 'change_gas_flow') return ['currentFlowRate', 'deviceAddress', 'gasType', 'maxFlowSccm', 'stabilizationTime'];
  if (nodeType === 'workflow_block') return ['workflowShortId', 'nodeCount', 'hasNestedWorkflowBlock'];
  if (nodeType === 'eis_galvanostatic' || nodeType === 'eis_potentiostatic') {
    return ['eisStartFrequency', 'eisLowerPeriods', 'eisUpperPeriods', 'eisLowerSteps', 'eisUpperSteps', 'eisScanStrategy'];
  }
  return [];
};
