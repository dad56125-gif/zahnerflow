// Zahner 设备类型定义

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

// 输出配置接口
export interface OutputConfig {
  output_path: string;
  naming_mode?: string;
  counter?: number;
  filename?: string;
}

// 测量参数基础接口 - 匹配Python MeasureRequest结构
export interface BaseMeasurementParams {
  // 输出配置（必需）
  output_path: string;
  naming_mode?: string;
  counter?: number;
  filename?: string;

  // 通用时间参数
  measurement_duration?: number;
  sampling_interval?: number;

  // 通用直流偏置参数
  enable_dc_bias?: boolean;
}

// EIS测量参数 - 匹配Python MeasureRequest结构
export interface EISMeasurementParams extends BaseMeasurementParams {
  measurement_type: MeasurementType.EIS_POTENTIOSTATIC | MeasurementType.EIS_GALVANOSTATIC;

  // EIS频率参数
  eis_lower_frequency: number;
  eis_upper_frequency: number;
  eis_start_frequency: number;

  // EIS扫描参数
  eis_lower_periods: number;
  eis_upper_periods: number;
  eis_lower_steps: number;
  eis_upper_steps: number;
  eis_scan_direction: string;
  eis_scan_strategy: string;

  // EIS振幅参数
  eis_amplitude: number;
  eis_potential?: number;
  eis_current?: number;
}

// 开路电位测量参数
export interface OCPMeasurementParams extends BaseMeasurementParams {
  measurement_type: MeasurementType.OCP;
}

// 计时安培法参数 - 匹配Python MeasureRequest结构
export interface ChronoamperometryParams extends BaseMeasurementParams {
  measurement_type: MeasurementType.CHRONOAMPEROMETRY;
  polarization_voltage: number;
  min_current: number;
  max_current: number;
}

// 计时电位法参数 - 匹配Python MeasureRequest结构
export interface ChronopotentiometryParams extends BaseMeasurementParams {
  measurement_type: MeasurementType.CHRONOPOTENTIOMETRY;
  polarization_current: number;
  min_voltage: number;
  max_voltage: number;
}

// 电压斜坡参数 - 匹配Python MeasureRequest结构
export interface VoltageRampParams extends BaseMeasurementParams {
  measurement_type: MeasurementType.VOLTAGE_RAMP;
  start_voltage: number;
  end_voltage: number;
  voltage_reference: 'absolute' | 'ocv';
  min_current: number;
  max_current: number;
}

// 电流斜坡参数 - 匹配Python MeasureRequest结构
export interface CurrentRampParams extends BaseMeasurementParams {
  measurement_type: MeasurementType.CURRENT_RAMP;
  start_current: number;
  end_current: number;
  min_voltage: number;
  max_voltage: number;
}

// 线性扫描伏安法参数 - 匹配Python MeasureRequest结构（别名，指向电压斜坡）
export type LSVParams = Omit<VoltageRampParams, 'measurement_type'> & {
  measurement_type: MeasurementType.LSV;
};

// 统一测量参数类型
export type MeasurementParams =
  | EISMeasurementParams
  | OCPMeasurementParams
  | ChronoamperometryParams
  | ChronopotentiometryParams
  | VoltageRampParams
  | CurrentRampParams
  | LSVParams;

// 测量结果接口
export interface MeasurementResult {
  success: boolean;
  data?: {
    message: string;
    output_path?: string;
    output_file?: string;
    mode?: string;
    parameters?: Record<string, any>;
    statistics?: Record<string, any>;
  };
  metadata: {
    startTime: Date;
    endTime: Date;
    duration: number;
    device: string;
    measurement_type: MeasurementType;
  };
  error?: string;
}

// 设备状态接口
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

// 工作流状态接口
export interface WorkflowState {
  execution_id: string;
  status: ExecutionState;
  current_node?: string;
  completed_nodes: string[];
  start_time: Date;
  end_time?: Date;
  results: Record<string, any>;
  errors: string[];
}

// 状态机配置接口
export interface StateMachineConfig {
  states: Record<string, StateConfig>;
  transitions: Record<string, TransitionConfig>;
  initial_state: string;
  final_states: string[];
}

// 状态配置接口
export interface StateConfig {
  name: string;
  type: 'initial' | 'normal' | 'final';
  on_enter?: string[];
  on_exit?: string[];
  timeout?: number;
}

// 转换配置接口
export interface TransitionConfig {
  from: string;
  to: string;
  event: string;
  condition?: string;
  action?: string;
}

// --------------------
// Furnace & MFC types
// --------------------

// 炉温程序段（仅数字组合）
export interface ProgramSegment {
  id: number;          // 顺序段号，从 1 开始
  temperature: number; // 目标温度（℃），AI-518P: 以℃为单位（FastAPI 层再做 ×10）
  time: number;        // 保温时长（分钟）
}

// 炉温预设元信息
export interface FurnacePresetMeta {
  name: string;        // 预设名，唯一
  createdAt: string;   // ISO 时间
  updatedAt: string;   // ISO 时间
  summary?: string;    // 可选摘要
}

// 炉温预设
export interface FurnacePreset extends FurnacePresetMeta {
  segments: ProgramSegment[];
}

// MFC 设备信息（发现缓存）
export interface MfcDeviceInfo {
  address: number;        // 设备地址
  gas_type: string;       // 气体类型
  max_flow_sccm: number;  // 满量程（sccm）
}

// MFC 状态
export interface MfcStatus {
  address: number;
  flow_percent: number;              // 实际流量百分比（0-100）
  flow_sccm: number;                 // 实际流量（sccm）
  digital_setpoint_percent: number;  // 数字通道设定百分比（0-100）
  active_setpoint_percent: number;   // 实际生效设定百分比（0-100）
}

// MFC 设定请求
export interface MfcSetpointRequest {
  address: number;
  sccm: number; // 目标流量（sccm）
}

// Furnace 采样点
export interface FurnaceSample {
  ts: string;        // ISO 时间戳
  pv: number;        // Process Value 实测温度（℃）
  sv: number;        // Set Value 目标温度（℃）
  mv: number;        // Manipulated Value 输出百分比（0-100）
  segment: number;   // 当前段号
  segmentTime: number;    // 当前段已运行时间（秒）
  segmentTimeSet: number; // 当前段设定时间（秒）
}

// MFC 采样点
export interface MfcSample {
  ts: string;         // ISO 时间戳
  address: number;    // 设备地址
  flow_sccm: number;  // 实测流量（sccm）
  flow_percent: number;              // 实测流量百分比（0-100）
  digital_setpoint_percent: number;  // 数字通道设定百分比
  active_setpoint_percent: number;   // 实际生效设定百分比
}
