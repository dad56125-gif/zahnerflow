import { WorkstationType, MeasurementType, NodeStatus } from '@zahnerflow/types';

// 重新导出共享类型
export type { WorkstationType, MeasurementType, NodeStatus };

// 节点核心类型枚举
export type NodeType =
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

// Zahner 特有的类型 (如果需要区分)
export type ZahnerNodeType = NodeType;

// 节点分类
export type NodeCategory = 'device' | 'basic_measurement' | 'flow_control';

// 端口定义
export interface Port {
  id: string;
  name: string;
  dataType: 'flow' | 'data' | 'control';
  description?: string;
}

// 节点UI样式定义
export interface NodeStyle {
  width?: number;
  height?: number;
  background?: string;
  borderColor?: string;
  borderRadius?: string;
  textColor?: string;
  icon?: string;
}

// 节点配置对象的结构定义
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

// 节点数据载荷
export interface NodeData {
  name: string;
  description: string;
  parameters?: Record<string, any>;
  results?: any;
  createdAt: Date;
  updatedAt: Date;
}

// React Flow 节点主结构
export interface ElectrochemicalNode {
  id: string;
  type: NodeType;
  name: string;
  category: NodeCategory;
  position: { x: number; y: number };
  data: NodeData;
  status: NodeStatus;
  input: Port;
  output: Port;
  style: NodeStyle;
}