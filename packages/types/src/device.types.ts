// Zahner 设备通信协议类型定义

// 测量类型枚举 - 基于设备层实际提供的方法
export enum MeasurementType {
  EIS_POTENTIOSTATIC = 'eis_potentiostatic',
  EIS_GALVANOSTATIC = 'eis_galvanostatic',
  OCP = 'ocp',
  CHRONOAMPEROMETRY = 'chronoamperometry',
  CHRONOPOTENTIOMETRY = 'chronopotentiometry',
  VOLTAGE_RAMP = 'voltage_ramp',
  CURRENT_RAMP = 'current_ramp',
  LSV = 'lsv'
}

// 节点状态枚举
export enum NodeState {
  READY = 'ready',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused'
}

// 执行状态枚举
export enum ExecutionState {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

// 基础通信接口
export interface DeviceStatus {
  connected: boolean;
  busy: boolean;
  lastActivity: Date;
  capabilities: string[];
  error?: string;
}

// 设备能力接口
export interface DeviceCapabilities {
  supported_measurements: MeasurementType[];
  potentiostat_modes: string[];
  scan_directions: string[];
  scan_strategies: string[];
  max_frequency: number;
  min_frequency: number;
  max_current: number;
  min_current: number;
  max_voltage: number;
  min_voltage: number;
}

// 基础数据接口 - Furnace
export interface ProgramSegment {
  id: number;          // 顺序段号，从 1 开始
  temperature: number; // 目标温度（℃）
  time: number;        // 保温时长（分钟）
}

export interface FurnacePreset {
  name: string;        // 预设名，唯一
  createdAt: string;   // ISO 时间
  updatedAt: string;   // ISO 时间
  summary?: string;    // 可选摘要
  segments: ProgramSegment[];
}

// 基础数据接口 - MFC
export interface MfcDeviceInfo {
  address: number;        // 设备地址
  gas_type: string;       // 气体类型
  max_flow_sccm: number;  // 满量程（sccm）
}

export interface MfcStatus {
  address: number;
  flow_percent: number;              // 实际流量百分比（0-100）
  flow_sccm: number;                 // 实际流量（sccm）
  digital_setpoint_percent: number;  // 数字通道设定百分比（0-100）
  active_setpoint_percent: number;   // 实际生效设定百分比（0-100）
}

export interface MfcSetpointRequest {
  address: number;
  sccm: number; // 目标流量（sccm）
}

// 采样数据接口
export interface FurnaceSample {
  ts: string;        // ISO 时间戳
  pv: number;        // Process Value 实测温度（℃）
  sv: number;        // Set Value 目标温度（℃）
  mv: number;        // Manipulated Value 输出百分比（0-100）
  segment: number;   // 当前段号
  segmentTime: number;    // 当前段已运行时间（秒）
  segmentTimeSet: number; // 当前段设定时间（秒）
}

export interface MfcSample {
  ts: string;         // ISO 时间戳
  address: number;    // 设备地址
  flow_sccm: number;  // 实测流量（sccm）
  flow_percent: number;              // 实测流量百分比（0-100）
  digital_setpoint_percent: number;  // 数字通道设定百分比
  active_setpoint_percent: number;   // 实际生效设定百分比
}
