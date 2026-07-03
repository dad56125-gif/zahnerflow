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
    description: '启动电化学工作站程序 (FastAPI)',
    icon: '🚀',
    defaultParameters: {
      host: 'localhost'
    }
  },

  shutdown: {
    type: 'shutdown',
    name: '停止程序',
    category: 'device',
    description: '停止电化学工作站程序',
    icon: '🛑',
    defaultParameters: {}
  },

  change_temperature: {
    type: 'change_temperature',
    name: '改变温度',
    category: 'device',
    description: 'Furnace自动温度控制节点',
    icon: '🌡️',
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
    description: 'MFC气体流量控制节点',
    icon: '💨',
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
    description: '恒电位电化学阻抗谱测量 (FastAPI)',
    icon: '📊',
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
    description: '恒电流电化学阻抗谱测量 (FastAPI)',
    icon: '📊',
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
    description: '开路电位测量 (FastAPI)',
    icon: '🔋',
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
    description: '计时安培法测量 (FastAPI)',
    icon: '⏱️',
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
    description: '计时电位法测量 (FastAPI)',
    icon: '⏰',
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
    description: '电压斜坡测量 (线性扫描伏安法)',
    icon: '📈',
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
    description: '电流斜坡测量 (电位动态扫描)',
    icon: '📉',
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
    description: '定义循环参数和开始位置',
    icon: '🔄',
    defaultParameters: {
      loopCount: 1
    }
  },

  loop_end: {
    type: 'loop_end',
    name: '循环结束',
    category: 'flow_control',
    description: '标记循环结束位置',
    icon: '⏹️',
    defaultParameters: {}
  },

  wait_delay: {
    type: 'wait_delay',
    name: '等待',
    category: 'flow_control',
    description: '在工作流执行过程中插入指定时间的等待',
    icon: '⏱️',
    defaultParameters: {
      duration: 1.0
    }
  },

  scheduled_start: {
    type: 'scheduled_start',
    name: '定时',
    category: 'flow_control',
    description: '等待到指定时间后继续执行工作流',
    icon: '⏱️',
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
    description: '引用一个已归档工作流作为组合步骤',
    icon: '▣',
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
    description: '在两个电流值之间周期性切换',
    icon: '⇄',
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
    description: '在两个电位值之间周期性切换',
    icon: '⇅',
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
    description: '电流阶梯式变化，每阶保持固定时间',
    icon: '▁▂▃▄',
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
    description: '电位阶梯式变化，每阶保持固定时间',
    icon: '▁▂▃▄',
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
