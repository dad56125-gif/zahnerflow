import { NodeType, NodeCategory } from '@zahnerflow/types';

type NodeIconKey = string;

// 节点配置元数据（静态配置，非运行时数据）
export interface NodeConfig {
  type: NodeType;
  name: string;
  category: NodeCategory;
  description: string;
  icon: NodeIconKey;
  defaultParameters?: Record<string, any>;
}

export type NodeChartKind = 'ivt' | 'eis';

export interface NodeSummaryField {
  label: string;
  keys: string[];
}

export interface NodePresentationSpec {
  chartKind?: NodeChartKind;
  chartGroup?: {
    key: string;
    label: string;
  };
  summaryFields: NodeSummaryField[];
}

// 分组名称映射
export const NODE_CATEGORY_NAMES: Record<NodeCategory, string> = {
  device: '设备',
  basic_measurement: '基础测量',
  advanced_measurement: '高级测量',
  flow_control: '流程控制'
};

// 核心：所有节点的详细静态配置
export const NODE_CONFIGS: Record<NodeType, NodeConfig> = {
  // --- 设备控制 ---
  startup: {
    type: 'startup',
    name: '启动程序',
    category: 'device',
    description: '连接并启动电化学工作站程序，为后续的电化学测量建立可用的设备运行环境。',
    icon: 'startup',
    defaultParameters: {
      host: 'localhost'
    }
  },

  shutdown: {
    type: 'shutdown',
    name: '停止程序',
    category: 'device',
    description: '结束当前电化学工作站程序，在工作流收尾或不再需要设备时释放对应的运行资源。',
    icon: 'shutdown',
    defaultParameters: {}
  },

  change_temperature: {
    type: 'change_temperature',
    name: '改变温度',
    category: 'device',
    description: '控制 Furnace 以指定速率升温或降温至目标温度，并在到达目标后按设定时间稳定，适合在测量前建立热环境。',
    icon: 'change_temperature',
    defaultParameters: {
      targetTemperature: 25,
      rate: 5.0,
      currentTemperature: 0,
      calculatedDuration: 0,
      tolerance: 0.5,
      stabilizationTime: 30
    }
  },

  change_gas_flow: {
    type: 'change_gas_flow',
    name: '更改气体流量',
    category: 'device',
    description: '控制指定 MFC 通道的气体流量至目标值，并等待流量稳定，为后续实验步骤提供一致的气氛条件。',
    icon: 'change_gas_flow',
    defaultParameters: {
      deviceSelection: '1:N2',
      deviceAddress: 1,
      gasType: 'N2',
      targetFlowRate: 50,
      currentFlowRate: 0,
      maxFlowSccm: 200,
      stabilizationTime: 10
    }
  },

  // --- 基础测量 ---
  eis_potentiostatic: {
    type: 'eis_potentiostatic',
    name: '恒电位EIS',
    category: 'basic_measurement',
    description: '在恒定电位或指定直流偏置下进行电化学阻抗谱扫描，用于分析体系在不同频率下的阻抗响应。',
    icon: 'eis_potentiostatic',
    defaultParameters: {
      eisLowerFrequency: 0.1,
      eisUpperFrequency: 300000,
      eisStartFrequency: 0.1,
      enableDcBias: false,
      eisPotential: 0.0,
      eis_amplitude: 0.025,
      eisLowerPeriods: 4,
      eisUpperPeriods: 20,
      eisLowerSteps: 5,
      eisUpperSteps: 10,
      eisScanDirection: 'START_TO_MAX',
      eisScanStrategy: 'SINGLE_SINE'
    }
  },

  eis_galvanostatic: {
    type: 'eis_galvanostatic',
    name: '恒电流EIS',
    category: 'basic_measurement',
    description: '在恒定电流或指定直流偏置下进行电化学阻抗谱扫描，用于分析体系在不同频率下的阻抗响应。',
    icon: 'eis_galvanostatic',
    defaultParameters: {
      eisLowerFrequency: 0.05,
      eisUpperFrequency: 300000,
      eisStartFrequency: 0.05,
      eis_amplitude: 0.02,
      eisCurrent: 0.0,
      eisLowerPeriods: 4,
      eisUpperPeriods: 20,
      eisLowerSteps: 5,
      eisUpperSteps: 10,
      eisScanDirection: 'START_TO_MAX',
      eisScanStrategy: 'SINGLE_SINE'
    }
  },

  ocp_measurement: {
    type: 'ocp_measurement',
    name: '开路电位测量',
    category: 'basic_measurement',
    description: '断开外加极化后记录体系的开路电位随时间变化，可用于观察电位稳定性或评估电池状态。',
    icon: 'ocp_measurement',
    defaultParameters: {
      check_battery_health: false,
      measurementDuration: 60.0,
      samplingInterval: 1.0
    }
  },

  chronoamperometry: {
    type: 'chronoamperometry',
    name: '计时安培法',
    category: 'basic_measurement',
    description: '施加恒定电位并记录电流随时间的变化，用于观察瞬态电流响应、反应动力学或扩散过程。',
    icon: 'chronoamperometry',
    defaultParameters: {
      polarizationVoltage: 1.0,
      measurementDuration: 60.0,
      samplingInterval: 0.1,
      min_current: -1.0,
      max_current: 1.0
    }
  },

  chronopotentiometry: {
    type: 'chronopotentiometry',
    name: '计时电位法',
    category: 'basic_measurement',
    description: '施加恒定电流并记录电位随时间的变化，用于观察电位响应、极化行为及体系随时间的变化。',
    icon: 'chronopotentiometry',
    defaultParameters: {
      polarizationCurrent: 10e-3,
      measurementDuration: 60.0,
      samplingInterval: 0.1,
      min_voltage: -4.0,
      max_voltage: 4.0
    }
  },

  voltage_ramp: {
    type: 'voltage_ramp',
    name: '电压斜坡',
    category: 'basic_measurement',
    description: '按设定的电压范围和时间连续扫描，同时记录电流响应，用于获得线性扫描伏安曲线并分析氧化还原行为。',
    icon: 'voltage_ramp',
    defaultParameters: {
      start_voltage: -0.5,
      startVoltageReference: 'absolute',
      end_voltage: 0.8,
      endVoltageReference: 'absolute',
      measurementDuration: 130.0,
      samplingInterval: 1.0,
      min_current: -1.0,
      max_current: 1.0
    }
  },

  current_ramp: {
    type: 'current_ramp',
    name: '电流斜坡',
    category: 'basic_measurement',
    description: '按设定的电流范围和时间连续改变电流，同时记录电位响应，用于分析体系的动态极化特征。',
    icon: 'current_ramp',
    defaultParameters: {
      startCurrent: -10e-3,
      endCurrent: 10e-3,
      measurementDuration: 60.0,
      samplingInterval: 1.0,
      min_voltage: -4.0,
      max_voltage: 4.0
    }
  },

  // --- 流程控制 ---
  loop_start: {
    type: 'loop_start',
    name: '循环开始',
    category: 'flow_control',
    description: '标记循环区域的开始，并设置该区域需要重复执行的次数；它必须与对应的循环结束节点配对使用。',
    icon: 'loop_start',
    defaultParameters: {
      loopCount: 1
    }
  },

  loop_end: {
    type: 'loop_end',
    name: '循环结束',
    category: 'flow_control',
    description: '标记循环区域的结束位置；执行时返回循环开始节点，直到达到设定的循环次数。',
    icon: 'loop_end',
    defaultParameters: {}
  },

  wait_delay: {
    type: 'wait_delay',
    name: '等待',
    category: 'flow_control',
    description: '让工作流暂停指定时长后再继续执行，适合等待设备状态、温度或气体流量完成自然稳定。',
    icon: 'wait_delay',
    defaultParameters: {
      duration: 1.0
    }
  },

  scheduled_start: {
    type: 'scheduled_start',
    name: '定时',
    category: 'flow_control',
    description: '将工作流暂停至指定的时刻，再继续执行后续节点，适合安排定时实验或与外部过程对齐。',
    icon: 'scheduled_start',
    defaultParameters: {
      hour: 0,
      minute: 0,
      nextDay: false
    }
  },

  workflow_block: {
    type: 'workflow_block',
    name: '工作流块',
    category: 'flow_control',
    description: '将已归档的实验记录作为一个组合步骤引用到当前工作流中，便于复用经过验证的节点序列。',
    icon: 'workflow_block',
    defaultParameters: {
      workflowId: '',
      workflowName: '',
      workflowShortId: '',
      nodeCount: 0,
      hasNestedWorkflowBlock: false
    }
  },

  // --- 高级测量 ---
  galvanostatic_switching: {
    type: 'galvanostatic_switching',
    name: '恒电流切换',
    category: 'advanced_measurement',
    description: '在两个电流设定值之间按周期交替切换，并记录电位响应，用于研究周期性电流激励下的体系行为。',
    icon: 'galvanostatic_switching',
    defaultParameters: {
      current_1: 0.0,
      current_2: 10e-3,
      holdTime1: 30.0,
      holdTime2: 30.0,
      cycles: 5,
      samplingInterval: 0.5,
      min_voltage: -4.0,
      max_voltage: 4.0
    }
  },

  potentiostatic_switching: {
    type: 'potentiostatic_switching',
    name: '恒电位切换',
    category: 'advanced_measurement',
    description: '在两个电位设定值之间按周期交替切换，并记录电流响应，用于研究周期性电位激励下的体系行为。',
    icon: 'potentiostatic_switching',
    defaultParameters: {
      potential_1: 0.0,
      potential_2: 0.5,
      holdTime1: 30.0,
      holdTime2: 30.0,
      cycles: 5,
      samplingInterval: 0.5,
      min_current: -1.0,
      max_current: 1.0
    }
  },

  galvanostatic_step_ramp: {
    type: 'galvanostatic_step_ramp',
    name: '恒电流阶梯',
    category: 'advanced_measurement',
    description: '按设定步长逐级改变电流，每个电流台阶保持固定时间并记录电位响应，用于获得分段极化特征。',
    icon: 'galvanostatic_step_ramp',
    defaultParameters: {
      startCurrent: 0.1,
      endCurrent: 1.0,
      stepCurrent: 0.1,
      hold_time: 30.0,
      samplingInterval: 1.0,
      min_voltage: -4.0,
      max_voltage: 4.0
    }
  },

  potentiostatic_step_ramp: {
    type: 'potentiostatic_step_ramp',
    name: '恒电位阶梯',
    category: 'advanced_measurement',
    description: '按设定步长逐级改变电位，每个电位台阶保持固定时间并记录电流响应，用于获得分段极化特征。',
    icon: 'potentiostatic_step_ramp',
    defaultParameters: {
      start_potential: 0.0,
      end_potential: 1.0,
      stepPotential: 0.1,
      hold_time: 30.0,
      samplingInterval: 1.0,
      min_current: -1.0,
      max_current: 1.0
    }
  }
};

// 节点的图表能力、图表分组和报告摘要字段只在此处定义。
export const NODE_PRESENTATION_SPECS: Record<NodeType, NodePresentationSpec> = {
  startup: {
    summaryFields: [{ label: '主机', keys: ['host'] }],
  },
  shutdown: { summaryFields: [] },
  change_temperature: {
    summaryFields: [
      { label: '目标温度', keys: ['targetTemperature', 'temperature'] },
      { label: '升温速率', keys: ['rate'] },
      { label: '稳定时间', keys: ['stabilizationTime'] },
    ],
  },
  change_gas_flow: {
    summaryFields: [
      { label: '气体', keys: ['gasType'] },
      { label: '设备地址', keys: ['deviceAddress', 'address'] },
      { label: '目标流量', keys: ['targetFlowRate', 'flowSccm', 'sccm'] },
      { label: '稳定时间', keys: ['stabilizationTime'] },
    ],
  },
  eis_potentiostatic: {
    chartKind: 'eis',
    chartGroup: { key: 'eis_potentiostatic', label: '恒电位EIS' },
    summaryFields: [
      { label: '直流偏置', keys: ['enableDcBias'] },
      { label: '偏置电位', keys: ['eisPotential'] },
      { label: '振幅', keys: ['eis_amplitude'] },
      { label: '频率范围', keys: ['eisLowerFrequency', 'eisUpperFrequency'] },
    ],
  },
  eis_galvanostatic: {
    chartKind: 'eis',
    chartGroup: { key: 'eis_galvanostatic', label: '恒电流EIS' },
    summaryFields: [
      { label: '偏置电流', keys: ['eisCurrent'] },
      { label: '振幅', keys: ['eis_amplitude'] },
      { label: '频率范围', keys: ['eisLowerFrequency', 'eisUpperFrequency'] },
    ],
  },
  ocp_measurement: {
    chartKind: 'ivt',
    chartGroup: { key: 'ocp', label: 'OCP' },
    summaryFields: [
      { label: '测量时长', keys: ['measurementDuration'] },
      { label: '采样间隔', keys: ['samplingInterval'] },
    ],
  },
  chronoamperometry: {
    chartKind: 'ivt',
    chartGroup: { key: 'chrono', label: '计时法' },
    summaryFields: [
      { label: '极化电压', keys: ['polarizationVoltage'] },
      { label: '测量时长', keys: ['measurementDuration'] },
      { label: '采样间隔', keys: ['samplingInterval'] },
    ],
  },
  chronopotentiometry: {
    chartKind: 'ivt',
    chartGroup: { key: 'chrono', label: '计时法' },
    summaryFields: [
      { label: '极化电流', keys: ['polarizationCurrent'] },
      { label: '测量时长', keys: ['measurementDuration'] },
      { label: '采样间隔', keys: ['samplingInterval'] },
    ],
  },
  voltage_ramp: {
    chartKind: 'ivt',
    chartGroup: { key: 'ramp', label: '斜坡' },
    summaryFields: [
      { label: '起始电压', keys: ['start_voltage', 'startVoltage'] },
      { label: '结束电压', keys: ['end_voltage', 'endVoltage'] },
      { label: '测量时长', keys: ['measurementDuration'] },
    ],
  },
  current_ramp: {
    chartKind: 'ivt',
    chartGroup: { key: 'ramp', label: '斜坡' },
    summaryFields: [
      { label: '起始电流', keys: ['startCurrent', 'start_current'] },
      { label: '结束电流', keys: ['endCurrent', 'end_current'] },
      { label: '测量时长', keys: ['measurementDuration'] },
    ],
  },
  loop_start: {
    summaryFields: [{ label: '循环次数', keys: ['loopCount'] }],
  },
  loop_end: { summaryFields: [] },
  wait_delay: {
    summaryFields: [{ label: '等待时长', keys: ['duration'] }],
  },
  scheduled_start: {
    summaryFields: [
      { label: '小时', keys: ['hour'] },
      { label: '分钟', keys: ['minute'] },
      { label: '次日', keys: ['nextDay'] },
    ],
  },
  workflow_block: {
    summaryFields: [
      { label: '工作流', keys: ['workflowName', 'workflowShortId', 'workflowId'] },
      { label: '节点数', keys: ['nodeCount'] },
    ],
  },
  galvanostatic_switching: {
    chartKind: 'ivt',
    chartGroup: { key: 'switching_step', label: '开关/阶跃' },
    summaryFields: [
      { label: '电流1', keys: ['current_1', 'current1'] },
      { label: '电流2', keys: ['current_2', 'current2'] },
      { label: '保持时间1', keys: ['holdTime1'] },
      { label: '保持时间2', keys: ['holdTime2'] },
      { label: '循环次数', keys: ['cycles'] },
    ],
  },
  potentiostatic_switching: {
    chartKind: 'ivt',
    chartGroup: { key: 'switching_step', label: '开关/阶跃' },
    summaryFields: [
      { label: '电位1', keys: ['potential_1', 'potential1'] },
      { label: '电位2', keys: ['potential_2', 'potential2'] },
      { label: '保持时间1', keys: ['holdTime1'] },
      { label: '保持时间2', keys: ['holdTime2'] },
      { label: '循环次数', keys: ['cycles'] },
    ],
  },
  galvanostatic_step_ramp: {
    chartKind: 'ivt',
    chartGroup: { key: 'switching_step', label: '开关/阶跃' },
    summaryFields: [
      { label: '起始电流', keys: ['startCurrent', 'start_current'] },
      { label: '结束电流', keys: ['endCurrent', 'end_current'] },
      { label: '阶梯电流', keys: ['stepCurrent', 'step_current'] },
      { label: '保持时间', keys: ['hold_time', 'holdTime'] },
    ],
  },
  potentiostatic_step_ramp: {
    chartKind: 'ivt',
    chartGroup: { key: 'switching_step', label: '开关/阶跃' },
    summaryFields: [
      { label: '起始电位', keys: ['start_potential', 'startPotential'] },
      { label: '结束电位', keys: ['end_potential', 'endPotential'] },
      { label: '阶梯电位', keys: ['stepPotential', 'step_potential'] },
      { label: '保持时间', keys: ['hold_time', 'holdTime'] },
    ],
  },
};

export function getNodeDisplayName(type: string): string {
  return NODE_CONFIGS[type as NodeType]?.name ?? type;
}

export function getNodePresentation(type: string): NodePresentationSpec | undefined {
  return NODE_PRESENTATION_SPECS[type as NodeType];
}

export function getNodeChartKind(type: string): NodeChartKind | undefined {
  return getNodePresentation(type)?.chartKind;
}

function resolvePresentationParameters(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  const nested = record.config ?? record.data ?? record.parameters;
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : record;
}

export function formatPresentationNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return String(Number(value.toPrecision(12)));
}

function formatPresentationValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) {
    return formatPresentationNumber(value);
  }
  return String(value);
}

export function summarizeNodeParameters(type: string, raw: unknown): string {
  const params = resolvePresentationParameters(raw);
  const spec = getNodePresentation(type);
  const fields = spec?.summaryFields ?? [];
  const parts = fields.flatMap((field) => {
    const values = field.keys
      .map(key => params[key])
      .filter(value => value !== undefined && value !== null && value !== '');
    if (values.length === 0) return [];
    return [`${field.label}: ${values.map(formatPresentationValue).join('–')}`];
  });

  return parts.length > 0 ? parts.join(' | ') : '-';
}

function descriptionParameter(params: Record<string, unknown>, keys: string[], fallback = '未设置'): string {
  const value = keys.map(key => params[key]).find(entry => entry !== undefined && entry !== null && entry !== '');
  return value === undefined ? fallback : formatPresentationValue(value);
}

function descriptionNumber(params: Record<string, unknown>, keys: string[], unit: string, fallback = '未设置'): string {
  return `${descriptionParameter(params, keys, fallback)}${unit}`;
}

/** 将节点用途与当前参数组合成面向用户的解释性说明。 */
export function getNodeDescription(type: string, raw: unknown): string {
  const params = resolvePresentationParameters(raw);
  const base = NODE_CONFIGS[type as NodeType]?.description || '该节点暂无说明。';

  switch (type as NodeType) {
    case 'change_temperature':
      return `${base} 当前会将温度调整到 ${descriptionNumber(params, ['targetTemperature', 'temperature'], ' ℃')}，按 ${descriptionNumber(params, ['rate'], ' ℃/min')} 变化，并在到达目标后稳定 ${descriptionNumber(params, ['stabilizationTime'], ' s')}。`;
    case 'change_gas_flow':
      return `${base} 当前选择 ${descriptionParameter(params, ['gasType'], '目标气体')}，目标流量为 ${descriptionNumber(params, ['targetFlowRate', 'flowSccm', 'sccm'], ' sccm')}，达到设定值后继续稳定 ${descriptionNumber(params, ['stabilizationTime'], ' s')}。`;
    case 'eis_potentiostatic': {
      const biasEnabled = params.enableDcBias === true || params.enableDcBias === 'true';
      const biasText = biasEnabled
        ? `直流偏置已打开，将额外施加 ${descriptionNumber(params, ['eisPotential'], ' V')} 的电位`
        : '直流偏置未打开，不会额外施加直流电位';
      return `${base} ${biasText}；交流振幅为 ${descriptionNumber(params, ['eis_amplitude'], ' V')}，频率从 ${descriptionNumber(params, ['eisLowerFrequency'], ' Hz')} 到 ${descriptionNumber(params, ['eisUpperFrequency'], ' Hz')} 扫描。`;
    }
    case 'eis_galvanostatic':
      return `${base} 测量时以 ${descriptionNumber(params, ['eisCurrent'], ' A')} 作为直流电流，交流振幅为 ${descriptionNumber(params, ['eis_amplitude'], ' A')}，频率从 ${descriptionNumber(params, ['eisLowerFrequency'], ' Hz')} 到 ${descriptionNumber(params, ['eisUpperFrequency'], ' Hz')} 扫描。`;
    case 'ocp_measurement':
      return `${base} 节点将在 ${descriptionNumber(params, ['measurementDuration'], ' s')} 内每隔 ${descriptionNumber(params, ['samplingInterval'], ' s')} 记录一次电位，整个过程不施加外部电压或电流。`;
    case 'chronoamperometry':
      return `${base} 测量期间会保持 ${descriptionNumber(params, ['polarizationVoltage'], ' V')} 的极化电压，并持续 ${descriptionNumber(params, ['measurementDuration'], ' s')}、每隔 ${descriptionNumber(params, ['samplingInterval'], ' s')} 记录电流。`;
    case 'chronopotentiometry':
      return `${base} 测量期间会保持 ${descriptionNumber(params, ['polarizationCurrent'], ' A')} 的极化电流，并持续 ${descriptionNumber(params, ['measurementDuration'], ' s')}、每隔 ${descriptionNumber(params, ['samplingInterval'], ' s')} 记录电位。`;
    case 'voltage_ramp':
      return `${base} 电压将从 ${descriptionNumber(params, ['start_voltage', 'startVoltage'], ' V')} 变化到 ${descriptionNumber(params, ['end_voltage', 'endVoltage'], ' V')}，在 ${descriptionNumber(params, ['measurementDuration'], ' s')} 内完成扫描。`;
    case 'current_ramp':
      return `${base} 电流将从 ${descriptionNumber(params, ['startCurrent', 'start_current'], ' A')} 变化到 ${descriptionNumber(params, ['endCurrent', 'end_current'], ' A')}，在 ${descriptionNumber(params, ['measurementDuration'], ' s')} 内完成扫描。`;
    case 'loop_start':
      return `${base} 当前循环次数为 ${descriptionParameter(params, ['loopCount'])}；循环开始与循环结束之间的所有节点都会按此次数重复执行。`;
    case 'loop_end':
      return `${base} 执行到这里会返回对应的循环开始节点；实际重复次数由循环开始节点的“循环次数”参数决定。`;
    case 'wait_delay':
      return `${base} 当前会暂停 ${descriptionNumber(params, ['duration'], ' s')}，暂停期间不执行后续节点，时间到后再继续。`;
    case 'scheduled_start':
      return `${base} 当前计划时间为 ${descriptionParameter(params, ['hour'], '小时')}时 ${descriptionParameter(params, ['minute'], '分钟')}分${params.nextDay ? '（次日）' : ''}，到达该时刻后才会继续执行。`;
    case 'workflow_block':
      return `${base} 当前引用“${descriptionParameter(params, ['workflowName', 'workflowShortId', 'workflowId'])}”，执行时会把其中的 ${descriptionParameter(params, ['nodeCount'], '若干')} 个节点作为一个组合步骤运行。`;
    case 'galvanostatic_switching':
      return `${base} 当前会在 ${descriptionNumber(params, ['current_1', 'current1'], ' A')} 与 ${descriptionNumber(params, ['current_2', 'current2'], ' A')} 之间切换，每个状态保持 ${descriptionNumber(params, ['holdTime1'], ' s')} / ${descriptionNumber(params, ['holdTime2'], ' s')}，共 ${descriptionParameter(params, ['cycles'])} 个循环。`;
    case 'potentiostatic_switching':
      return `${base} 当前会在 ${descriptionNumber(params, ['potential_1', 'potential1'], ' V')} 与 ${descriptionNumber(params, ['potential_2', 'potential2'], ' V')} 之间切换，每个状态保持 ${descriptionNumber(params, ['holdTime1'], ' s')} / ${descriptionNumber(params, ['holdTime2'], ' s')}，共 ${descriptionParameter(params, ['cycles'])} 个循环。`;
    case 'galvanostatic_step_ramp':
      return `${base} 电流将从 ${descriptionNumber(params, ['startCurrent', 'start_current'], ' A')} 开始，以 ${descriptionNumber(params, ['stepCurrent', 'step_current'], ' A')} 为步长增加到 ${descriptionNumber(params, ['endCurrent', 'end_current'], ' A')}，每阶保持 ${descriptionNumber(params, ['hold_time', 'holdTime'], ' s')}。`;
    case 'potentiostatic_step_ramp':
      return `${base} 电位将从 ${descriptionNumber(params, ['start_potential', 'startPotential'], ' V')} 开始，以 ${descriptionNumber(params, ['stepPotential', 'step_potential'], ' V')} 为步长增加到 ${descriptionNumber(params, ['end_potential', 'endPotential'], ' V')}，每阶保持 ${descriptionNumber(params, ['hold_time', 'holdTime'], ' s')}。`;
    case 'startup':
      return `${base} 当前连接主机为 ${descriptionParameter(params, ['host'])}，启动成功后工作流才会继续执行。`;
    case 'shutdown':
      return `${base} 工作流执行到此节点后结束工作站程序；该节点不需要额外参数。`;
    default:
      return `${base} 当前参数：${summarizeNodeParameters(type, raw)}。`;
  }
}

// 节点分组列表
export const NODE_GROUPS: Record<NodeCategory, NodeType[]> = {
  device: ['change_temperature', 'change_gas_flow'],
  basic_measurement: [
    'eis_potentiostatic',
    'eis_galvanostatic',
    'chronopotentiometry',
    'chronoamperometry',
    'voltage_ramp',
    'current_ramp',
    'ocp_measurement'
  ],
  advanced_measurement: [
    'potentiostatic_switching',
    'galvanostatic_switching',
    'potentiostatic_step_ramp',
    'galvanostatic_step_ramp'
  ],
  flow_control: ['loop_start', 'loop_end', 'wait_delay', 'scheduled_start', 'workflow_block']
};

// Zahner 特有配置 (复用通用配置)
export const ZAHNER_NODE_CONFIGS = { ...NODE_CONFIGS };
export const ZAHNER_NODE_GROUPS = { ...NODE_GROUPS };
