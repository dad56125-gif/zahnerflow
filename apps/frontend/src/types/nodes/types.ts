// 工作站类型 (从共享包导入)
import { WorkstationType, MeasurementType } from '@zahnerflow/types';

// 节点类型定义 - 基于设备层实际提供的方法
export type NodeType =
  // 设备控制
  | 'startup'      // 启动程序
  | 'shutdown'     // 停止程序
  | 'change_temperature'  // 改变温度
  | 'change_gas_flow'     // 改变气体流量

  // 基础测量 - 对应设备层的8个测量方法
  | 'eis_potentiostatic'     // 恒电位EIS测量
  | 'eis_galvanostatic'     // 恒电流EIS测量
  | 'ocp_measurement'       // 开路电位测量
  | 'chronoamperometry'     // 计时安培法
  | 'chronopotentiometry'   // 计时电位法
  | 'voltage_ramp'          // 电压斜坡测量
  | 'current_ramp'          // 电流斜坡测量
  | 'lsv_measurement'      // 线性扫描伏安法

  // 流程控制
  | 'loop_start'           // 循环开始节点
  | 'loop_end'             // 循环结束节点
  | 'wait_delay'           // 等待/延时节点


// 重新导出WorkstationType和MeasurementType
export type { WorkstationType, MeasurementType };

// Zahner Zennium 特有的节点类型
export type ZahnerNodeType =
  | 'startup'
  | 'shutdown'
  | 'change_temperature'
  | 'change_gas_flow'
  | 'eis_potentiostatic'
  | 'eis_galvanostatic'
  | 'ocp_measurement'
  | 'chronoamperometry'
  | 'chronopotentiometry'
  | 'voltage_ramp'
  | 'current_ramp'
  | 'lsv_measurement'
  | 'loop_start'
  | 'loop_end'
  | 'wait_delay';


// 节点分类
export type NodeCategory =
  | 'device'
  | 'basic_measurement'
  | 'flow_control';

// 端口类型
export interface Port {
  id: string;
  name: string;
  dataType: 'flow' | 'data' | 'control';
  description?: string;
}

// 节点数据结构
export interface NodeData {
  name: string;
  description: string;
  parameters?: Record<string, any>;
  results?: any;
  createdAt: Date;
  updatedAt: Date;
}

// 节点状态 (使用共享包中的定义)
import { NodeStatus } from '@zahnerflow/types';

// 重新导出NodeStatus
export type { NodeStatus };

// 节点样式
export interface NodeStyle {
  width?: number;
  height?: number;
  background?: string;
  borderColor?: string;
  borderRadius?: string;
  textColor?: string;
  icon?: string;
}

// 电化学节点接口
export interface ElectrochemicalNode {
  id: string;
  type: NodeType;
  name: string;
  category: NodeCategory;
  position: { x: number; y: number };
  data: NodeData;
  status: NodeStatus;
  input: Port;           // 只有一个输入
  output: Port;          // 只有一个输出
  style: NodeStyle;
}

// 节点配置
export interface NodeConfig {
  type: NodeType;
  name: string;
  category: NodeCategory;
  description: string;
  icon: string;
  input: Port;
  output: Port;
  style: NodeStyle;
  defaultParameters?: Record<string, any>;
}

// 节点分组
export interface NodeGroup {
  category: NodeCategory;
  name: string;
  nodes: NodeType[];
}

// 节点配置映射
export const NODE_CONFIGS: Record<NodeType, NodeConfig> = {
  // 设备控制
  startup: {
    type: 'startup',
    name: '启动程序',
    category: 'device',
    description: '启动电化学工作站程序 (FastAPI)',
    icon: '🚀',
    input: {
      id: 'input',
      name: '输入',
      dataType: 'flow',
      description: '流程输入'
    },
    output: {
      id: 'output',
      name: '输出',
      dataType: 'flow',
      description: '流程输出'
    },
    style: {
      width: 140,
      height: 60,
      background: 'linear-gradient(135deg, #4CAF50, #45a049)',
      borderColor: '#45a049',
      borderRadius: '8px',
      textColor: '#ffffff',
      icon: '🚀'
    },
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
    input: {
      id: 'input',
      name: '输入',
      dataType: 'flow',
      description: '流程输入'
    },
    output: {
      id: 'output',
      name: '输出',
      dataType: 'flow',
      description: '流程输出'
    },
    style: {
      width: 140,
      height: 60,
      background: 'linear-gradient(135deg, #f44336, #d32f2f)',
      borderColor: '#d32f2f',
      borderRadius: '8px',
      textColor: '#ffffff',
      icon: '🛑'
    }
  },

  change_temperature: {
    type: 'change_temperature',
    name: '改变温度',
    category: 'device',
    description: 'Furnace自动温度控制节点',
    icon: '🌡️',
    input: {
      id: 'input',
      name: '输入',
      dataType: 'flow',
      description: '流程输入'
    },
    output: {
      id: 'output',
      name: '输出',
      dataType: 'flow',
      description: '流程输出'
    },
    style: {
      width: 140,
      height: 60,
      background: 'linear-gradient(135deg, #FF6B35, #F4511E)',
      borderColor: '#F4511E',
      borderRadius: '8px',
      textColor: '#ffffff',
      icon: '🌡️'
    },
    defaultParameters: {
      target_temperature: 25,     // 目标温度(°C)
      rate: 5.0,                  // 温度变化速率(°C/min)
      current_temperature: 0,     // 当前温度(°C，运行时查询)
      calculated_duration: 0,     // 计算时间(分钟，运行时计算)
      tolerance: 0.5,             // 温度容差(°C)
      stabilization_time: 30      // 稳定时间(秒)
    }
  },

  change_gas_flow: {
    type: 'change_gas_flow',
    name: '更改气体流量',
    category: 'device',
    description: 'MFC气体流量控制节点',
    icon: '💨',
    input: {
      id: 'input',
      name: '输入',
      dataType: 'flow',
      description: '流程输入'
    },
    output: {
      id: 'output',
      name: '输出',
      dataType: 'flow',
      description: '流程输出'
    },
    style: {
      width: 140,
      height: 60,
      background: 'linear-gradient(135deg, #2196F3, #1976D2)',
      borderColor: '#1976D2',
      borderRadius: '8px',
      textColor: '#ffffff',
      icon: '💨'
    },
    defaultParameters: {
      device_selection: '1:N2',        // 设备选择(地址:气体类型)
      device_address: 1,               // 解析出的设备地址
      gas_type: 'N2',                  // 解析出的气体类型
      target_flow_rate: 50,            // 目标流量(sccm)
      current_flow_rate: 0,            // 当前流量(sccm, 运行时查询)
      max_flow_sccm: 200,              // 该设备的最大流量
      stabilization_time: 10           // 稳定时间(秒)
    }
  },

  // 基础测量 - 恒电位EIS测量
  eis_potentiostatic: {
    type: 'eis_potentiostatic',
    name: '恒电位EIS',
    category: 'basic_measurement',
    description: '恒电位电化学阻抗谱测量 (FastAPI)',
    icon: '📊',
    input: {
      id: 'input',
      name: '输入',
      dataType: 'flow',
      description: '流程输入'
    },
    output: {
      id: 'output',
      name: '输出',
      dataType: 'data',
      description: 'EIS数据输出'
    },
    style: {
      width: 140,
      height: 60,
      background: 'linear-gradient(135deg, #9C27B0, #7B1FA2)',
      borderColor: '#7B1FA2',
      borderRadius: '8px',
      textColor: '#ffffff',
      icon: '📊'
    },
    defaultParameters: {
      eis_lower_frequency: 0.2,
      eis_upper_frequency: 100000,
      eis_start_frequency: 1000,
      enable_dc_bias: false,
      eis_potential: 0.0,
      eis_amplitude: 0.025,
      eis_lower_periods: 4,
      eis_upper_periods: 20,
      eis_lower_steps: 5,
      eis_upper_steps: 10,
      eis_scan_direction: 'START_TO_MIN',
      eis_scan_strategy: 'SINGLE_SINE'
    }
  },

  // 恒电流EIS测量
  eis_galvanostatic: {
    type: 'eis_galvanostatic',
    name: '恒电流EIS',
    category: 'basic_measurement',
    description: '恒电流电化学阻抗谱测量 (FastAPI)',
    icon: '📊',
    input: {
      id: 'input',
      name: '输入',
      dataType: 'flow',
      description: '流程输入'
    },
    output: {
      id: 'output',
      name: '输出',
      dataType: 'data',
      description: 'EIS数据输出'
    },
    style: {
      width: 140,
      height: 60,
      background: 'linear-gradient(135deg, #9C27B0, #7B1FA2)',
      borderColor: '#7B1FA2',
      borderRadius: '8px',
      textColor: '#ffffff',
      icon: '📊'
    },
    defaultParameters: {
      eis_lower_frequency: 10,
      eis_upper_frequency: 10000,
      eis_start_frequency: 100,
      eis_amplitude: 0.001,
      eis_current: 0.0,
      eis_lower_periods: 20,
      eis_upper_periods: 4,
      eis_lower_steps: 10,
      eis_upper_steps: 5,
      eis_scan_direction: 'START_TO_MAX',
      eis_scan_strategy: 'SINGLE_SINE'
    }
  },

  ocp_measurement: {
    type: 'ocp_measurement',
    name: '开路电位测量',
    category: 'basic_measurement',
    description: '开路电位测量 (FastAPI)',
    icon: '🔋',
    input: {
      id: 'input',
      name: '输入',
      dataType: 'flow',
      description: '流程输入'
    },
    output: {
      id: 'output',
      name: '输出',
      dataType: 'data',
      description: 'OCP数据输出'
    },
    style: {
      width: 140,
      height: 60,
      background: 'linear-gradient(135deg, #FF9800, #F57C00)',
      borderColor: '#F57C00',
      borderRadius: '8px',
      textColor: '#ffffff',
      icon: '🔋'
    },
    defaultParameters: {
      measurement_duration: 60.0,
      sampling_interval: 1.0
    }
  },

  chronoamperometry: {
    type: 'chronoamperometry',
    name: '计时安培法',
    category: 'basic_measurement',
    description: '计时安培法测量 (FastAPI)',
    icon: '⏱️',
    input: {
      id: 'input',
      name: '输入',
      dataType: 'flow',
      description: '流程输入'
    },
    output: {
      id: 'output',
      name: '输出',
      dataType: 'data',
      description: 'CA数据输出'
    },
    style: {
      width: 140,
      height: 60,
      background: 'linear-gradient(135deg, #2196F3, #1976D2)',
      borderColor: '#1976D2',
      borderRadius: '8px',
      textColor: '#ffffff',
      icon: '⏱️'
    },
    defaultParameters: {
      polarization_voltage: 1.0,
      measurement_duration: 60.0,
      sampling_interval: 0.1,
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
    input: {
      id: 'input',
      name: '输入',
      dataType: 'flow',
      description: '流程输入'
    },
    output: {
      id: 'output',
      name: '输出',
      dataType: 'data',
      description: 'CP数据输出'
    },
    style: {
      width: 140,
      height: 60,
      background: 'linear-gradient(135deg, #00BCD4, #0097A7)',
      borderColor: '#0097A7',
      borderRadius: '8px',
      textColor: '#ffffff',
      icon: '⏰'
    },
    defaultParameters: {
      polarization_current: 10e-3,
      measurement_duration: 60.0,
      sampling_interval: 0.1,
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
    input: {
      id: 'input',
      name: '输入',
      dataType: 'flow',
      description: '流程输入'
    },
    output: {
      id: 'output',
      name: '输出',
      dataType: 'data',
      description: 'LSV数据输出'
    },
    style: {
      width: 140,
      height: 60,
      background: 'linear-gradient(135deg, #4CAF50, #388E3C)',
      borderColor: '#388E3C',
      borderRadius: '8px',
      textColor: '#ffffff',
      icon: '📈'
    },
    defaultParameters: {
      start_voltage: -0.5,
      end_voltage: 0.8,
      voltage_reference: 'absolute',
      measurement_duration: 130.0,
      sampling_interval: 1.0,
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
    input: {
      id: 'input',
      name: '输入',
      dataType: 'flow',
      description: '流程输入'
    },
    output: {
      id: 'output',
      name: '输出',
      dataType: 'data',
      description: '电流扫描数据输出'
    },
    style: {
      width: 140,
      height: 60,
      background: 'linear-gradient(135deg, #FF5722, #D84315)',
      borderColor: '#D84315',
      borderRadius: '8px',
      textColor: '#ffffff',
      icon: '📉'
    },
    defaultParameters: {
      start_current: -10e-3,
      end_current: 10e-3,
      measurement_duration: 60.0,
      sampling_interval: 1.0,
      min_voltage: -4.0,
      max_voltage: 4.0
    }
  },

  lsv_measurement: {
    type: 'lsv_measurement',
    name: '线性扫描伏安法',
    category: 'basic_measurement',
    description: '线性扫描伏安法测量 (LSV)',
    icon: '🔬',
    input: {
      id: 'input',
      name: '输入',
      dataType: 'flow',
      description: '流程输入'
    },
    output: {
      id: 'output',
      name: '输出',
      dataType: 'data',
      description: 'LSV数据输出'
    },
    style: {
      width: 140,
      height: 60,
      background: 'linear-gradient(135deg, #795548, #5D4037)',
      borderColor: '#5D4037',
      borderRadius: '8px',
      textColor: '#ffffff',
      icon: '🔬'
    },
    defaultParameters: {
      start_voltage: -0.5,
      end_voltage: 0.8,
      voltage_reference: 'absolute',
      measurement_duration: 130.0,
      sampling_interval: 1.0,
      min_current: -1.0,
      max_current: 1.0
    }
  },

  // 流程控制节点
  loop_start: {
    type: 'loop_start',
    name: '循环开始',
    category: 'flow_control',
    description: '定义循环参数和开始位置',
    icon: '🔄',
    input: {
      id: 'input',
      name: '输入',
      dataType: 'flow',
      description: '流程输入'
    },
    output: {
      id: 'output',
      name: '输出',
      dataType: 'flow',
      description: '流程输出'
    },
    style: {
      width: 140,
      height: 60,
      background: 'linear-gradient(135deg, #FF9800, #F57C00)',
      borderColor: '#F57C00',
      borderRadius: '8px',
      textColor: '#ffffff',
      icon: '🔄'
    },
    defaultParameters: {
      loop_count: 1,
      loop_variable: 'i',
      start_value: 0,
      step: 1
    }
  },
  loop_end: {
    type: 'loop_end',
    name: '循环结束',
    category: 'flow_control',
    description: '标记循环结束位置',
    icon: '⏹️',
    input: {
      id: 'input',
      name: '输入',
      dataType: 'flow',
      description: '流程输入'
    },
    output: {
      id: 'output',
      name: '输出',
      dataType: 'flow',
      description: '流程输出'
    },
    style: {
      width: 140,
      height: 60,
      background: 'linear-gradient(135deg, #F44336, #D32F2F)',
      borderColor: '#D32F2F',
      borderRadius: '8px',
      textColor: '#ffffff',
      icon: '⏹️'
    },
    defaultParameters: {}
  },

  // 等待/延时节点
  wait_delay: {
    type: 'wait_delay',
    name: '等待/延时',
    category: 'flow_control',
    description: '在工作流执行过程中插入指定时间的等待',
    icon: '⏱️',
    input: {
      id: 'input',
      name: '输入',
      dataType: 'flow',
      description: '流程输入'
    },
    output: {
      id: 'output',
      name: '输出',
      dataType: 'flow',
      description: '流程输出'
    },
    style: {
      width: 140,
      height: 60,
      background: 'linear-gradient(135deg, #FF9800, #F57C00)',
      borderColor: '#F57C00',
      borderRadius: '8px',
      textColor: '#ffffff',
      icon: '⏱️'
    },
    defaultParameters: {
      duration: 1.0,
      description: '',
      allow_cancel: true,
      progress_updates: true
    }
  }
};

// 节点分组
export const NODE_GROUPS: Record<NodeCategory, NodeType[]> = {
  device: ['startup', 'shutdown', 'change_temperature', 'change_gas_flow'],
  basic_measurement: [
    'eis_potentiostatic',
    'eis_galvanostatic',
    'ocp_measurement',
    'chronoamperometry',
    'chronopotentiometry',
    'voltage_ramp',
    'current_ramp',
    'lsv_measurement'
  ],
  flow_control: ['loop_start', 'loop_end', 'wait_delay']
};

// 节点分组名称
export const NODE_CATEGORY_NAMES: Record<NodeCategory, string> = {
  device: '设备',
  basic_measurement: '基础测量',
  flow_control: '流程控制'
};

// 工具函数：获取节点配置
export function getNodeConfig(type: NodeType): NodeConfig {
  return NODE_CONFIGS[type];
}

// 工具函数：获取节点分类名称
export function getNodeCategoryName(category: NodeCategory): string {
  return NODE_CATEGORY_NAMES[category];
}

// 工具函数：创建默认节点数据
export function createDefaultNodeData(type: NodeType): NodeData {
  const config = getNodeConfig(type);
  return {
    name: config.name,
    description: config.description,
    parameters: { ...config.defaultParameters },
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

// 工作站特定的节点配置
export const ZAHNER_NODE_CONFIGS: Record<ZahnerNodeType, NodeConfig> = {
  // 继承通用节点配置
  startup: {
    ...NODE_CONFIGS.startup,
    type: 'startup' as ZahnerNodeType,
    defaultParameters: {
      ...NODE_CONFIGS.startup.defaultParameters,
      workstation: 'zahner-zennium'
    }
  },
  shutdown: {
    ...NODE_CONFIGS.shutdown,
    type: 'shutdown' as ZahnerNodeType,
    defaultParameters: {
      ...NODE_CONFIGS.shutdown.defaultParameters,
      workstation: 'zahner-zennium'
    }
  },
  change_temperature: {
    ...NODE_CONFIGS.change_temperature,
    type: 'change_temperature' as ZahnerNodeType,
    defaultParameters: {
      ...NODE_CONFIGS.change_temperature.defaultParameters,
      workstation: 'zahner-zennium'
    }
  },
  change_gas_flow: {
    ...NODE_CONFIGS.change_gas_flow,
    type: 'change_gas_flow' as ZahnerNodeType,
    defaultParameters: {
      ...NODE_CONFIGS.change_gas_flow.defaultParameters,
      workstation: 'zahner-zennium'
    }
  },
  eis_potentiostatic: {
    ...NODE_CONFIGS.eis_potentiostatic,
    type: 'eis_potentiostatic' as ZahnerNodeType,
    defaultParameters: {
      ...NODE_CONFIGS.eis_potentiostatic.defaultParameters,
      workstation: 'zahner-zennium'
    }
  },
  eis_galvanostatic: {
    ...NODE_CONFIGS.eis_galvanostatic,
    type: 'eis_galvanostatic' as ZahnerNodeType,
    defaultParameters: {
      ...NODE_CONFIGS.eis_galvanostatic.defaultParameters,
      workstation: 'zahner-zennium'
    }
  },
  ocp_measurement: {
    ...NODE_CONFIGS.ocp_measurement,
    type: 'ocp_measurement' as ZahnerNodeType,
    defaultParameters: {
      ...NODE_CONFIGS.ocp_measurement.defaultParameters,
      workstation: 'zahner-zennium'
    }
  },
  chronoamperometry: {
    ...NODE_CONFIGS.chronoamperometry,
    type: 'chronoamperometry' as ZahnerNodeType,
    defaultParameters: {
      ...NODE_CONFIGS.chronoamperometry.defaultParameters,
      workstation: 'zahner-zennium'
    }
  },
  chronopotentiometry: {
    ...NODE_CONFIGS.chronopotentiometry,
    type: 'chronopotentiometry' as ZahnerNodeType,
    defaultParameters: {
      ...NODE_CONFIGS.chronopotentiometry.defaultParameters,
      workstation: 'zahner-zennium'
    }
  },
  voltage_ramp: {
    ...NODE_CONFIGS.voltage_ramp,
    type: 'voltage_ramp' as ZahnerNodeType,
    defaultParameters: {
      ...NODE_CONFIGS.voltage_ramp.defaultParameters,
      workstation: 'zahner-zennium'
    }
  },
  current_ramp: {
    ...NODE_CONFIGS.current_ramp,
    type: 'current_ramp' as ZahnerNodeType,
    defaultParameters: {
      ...NODE_CONFIGS.current_ramp.defaultParameters,
      workstation: 'zahner-zennium'
    }
  },
  lsv_measurement: {
    ...NODE_CONFIGS.lsv_measurement,
    type: 'lsv_measurement' as ZahnerNodeType,
    defaultParameters: {
      ...NODE_CONFIGS.lsv_measurement.defaultParameters,
      workstation: 'zahner-zennium'
    }
  },
  loop_start: {
    ...NODE_CONFIGS.loop_start,
    type: 'loop_start' as ZahnerNodeType,
    defaultParameters: {
      ...NODE_CONFIGS.loop_start.defaultParameters
    }
  },
  loop_end: {
    ...NODE_CONFIGS.loop_end,
    type: 'loop_end' as ZahnerNodeType,
    defaultParameters: {
      ...NODE_CONFIGS.loop_end.defaultParameters
    }
  },
  wait_delay: {
    ...NODE_CONFIGS.wait_delay,
    type: 'wait_delay' as ZahnerNodeType,
    defaultParameters: {
      ...NODE_CONFIGS.wait_delay.defaultParameters
    }
  }
};

// 工作站特定的节点分组
export const ZAHNER_NODE_GROUPS: Record<NodeCategory, ZahnerNodeType[]> = {
  device: ['startup', 'shutdown', 'change_temperature', 'change_gas_flow'],
  basic_measurement: [
    'eis_potentiostatic',
    'eis_galvanostatic',
    'ocp_measurement',
    'chronoamperometry',
    'chronopotentiometry',
    'voltage_ramp',
    'current_ramp',
    'lsv_measurement'
  ],
  flow_control: ['loop_start', 'loop_end', 'wait_delay']
};

// 工具函数：根据工作站获取节点配置
export function getNodeConfigByWorkstation(type: string, workstation: WorkstationType): NodeConfig {
  if (workstation === 'zahner-zennium') {
    const config = ZAHNER_NODE_CONFIGS[type as ZahnerNodeType];
    return config;
  }
  return NODE_CONFIGS[type as NodeType];
}

// 工具函数：根据工作站获取节点分组
export function getNodeGroupsByWorkstation(workstation: WorkstationType): Record<NodeCategory, string[]> {
  if (workstation === 'zahner-zennium') {
    return ZAHNER_NODE_GROUPS;
  }
  return NODE_GROUPS;
}

// 工具函数：验证节点连接
export function validateNodeConnection(sourceType: NodeType, targetType: NodeType): boolean {
  const sourceConfig = getNodeConfig(sourceType);
  const targetConfig = getNodeConfig(targetType);

  // 检查数据类型兼容性
  return sourceConfig.output.dataType === 'flow' ||
         targetConfig.input.dataType === 'flow' ||
         sourceConfig.output.dataType === targetConfig.input.dataType;
}

// 工具函数：创建默认节点数据（带工作站支持）
// 注意：不再自动生成loop_id，循环配对基于遍历顺序
export function createDefaultNodeDataWithWorkstation(type: string, workstation: WorkstationType): NodeData {
  const config = getNodeConfigByWorkstation(type, workstation);

  // 创建参数的深拷贝
  const parameters = { ...config.defaultParameters };

  return {
    name: config.name,
    description: config.description,
    parameters,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

// 循环节点接口定义
export interface LoopStartNode extends ElectrochemicalNode {
  type: 'loop_start';
  data: NodeData & {
    parameters: {
      loop_count: number;
      loop_variable: string;
      start_value: number;
      step: number;
    };
  };
}

export interface LoopEndNode extends ElectrochemicalNode {
  type: 'loop_end';
  data: NodeData & {
    parameters: {};
  };
}

// 循环上下文接口（内部使用）
export interface LoopContext {
  loop_id: string;
  start_node: LoopStartNode;
  end_node: LoopEndNode;
  level: number;
  iterations: number;
  current_iteration: number;
  variable_name: string;
  variable_value: number;
}

// 循环配对信息
export interface LoopPair {
  start_node_id: string;
  end_node_id: string;
  loop_id: string;
  level: number;
}