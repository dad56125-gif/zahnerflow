import { NodeType, NodeConfig, NodeCategory } from './NodeInterfaces';

// 分组名称映射
export const NODE_CATEGORY_NAMES: Record<NodeCategory, string> = {
  device: '设备',
  basic_measurement: '基础测量',
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
      target_temperature: 25,
      rate: 5.0,
      current_temperature: 0,
      calculated_duration: 0,
      tolerance: 0.5,
      stabilization_time: 30
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
      device_selection: '1:N2',
      device_address: 1,
      gas_type: 'N2',
      target_flow_rate: 50,
      current_flow_rate: 0,
      max_flow_sccm: 200,
      stabilization_time: 10
    }
  },

  // --- 基础测量 ---
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
      eis_lower_frequency: 0.05,
      eis_upper_frequency: 300000,
      eis_start_frequency: 0.05,
      eis_amplitude: 0.02,
      eis_current: 0.0,
      eis_lower_periods: 4,
      eis_upper_periods: 20,
      eis_lower_steps: 5,
      eis_upper_steps: 10,
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
      start_voltage_reference: 'absolute',
      end_voltage: 0.8,
      end_voltage_reference: 'absolute',
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

  // --- 流程控制 ---
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

// 节点分组列表
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

// Zahner 特有配置 (目前直接复用通用配置，未来可在此扩展)
export const ZAHNER_NODE_CONFIGS = { ...NODE_CONFIGS };
export const ZAHNER_NODE_GROUPS = { ...NODE_GROUPS };