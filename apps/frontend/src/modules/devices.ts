/**
 * 设备相关类型定义
 *
 * 基于 @zahnerflow/types 扩展前端专用的设备状态和UI类型
 */

// 重新导出 @zahnerflow/types 中的基础类型
export type {
  ProgramSegment,
  FurnacePreset,
  MfcDeviceInfo,
  MfcStatus,
  FurnaceSample,
  MfcSample,
  MeasurementType,
  NodeState as NodeStatus,
  ExecutionState as ExecutionStatus
} from '@zahnerflow/types';

// 程序段操作进度
export interface SegmentProgress {
  active: boolean;        // 是否正在进行程序段操作
  type: 'read' | 'write'; // 操作类型：读取程序段 | 写入程序段
  progress: number;       // 进度百分比 (0-100)
}

// 兼容性接口 - 使用 timestamp 而不是 ts
export interface FurnaceSampleWithTimestamp {
  timestamp: string;      // ISO 时间戳
  temperature: number;    // Process Value 实测温度（℃）
  sv?: number;            // Set Value 目标温度（℃）
  mv?: number;            // Manipulated Value 输出百分比（0-100）
  segment?: number;       // 当前段号
  segmentTime?: number;   // 当前段已运行时间（秒）
  segmentTimeSet?: number;// 当前段设定时间（秒）
}

export interface MfcSampleWithTimestamp {
  timestamp: string;          // ISO 时间戳
  address: number;            // 设备地址
  flow_sccm: number;          // 实测流量（sccm）
  flow_percent: number;       // 实测流量百分比（0-100）
  digital_setpoint_percent: number; // 数字通道设定百分比
  active_setpoint_percent: number;  // 实际生效设定百分比
}

export interface FurnacePresetMeta {
  name: string;
  created_at: string;
  updated_at: string;
  summary?: string;
}

// MFC 设定请求 (前端专用)
export interface MfcSetpointRequestFrontend {
  address: number;
  sccm: number;
}

export interface CreatePresetRequest {
  name: string;
  segments: ProgramSegment[];
  summary?: string;
}

export interface ApplyPresetResult {
  changed: boolean;
  steps: string[];
}

// 前端扩展类型定义
export interface MfcDevice extends MfcDeviceInfo {
  flow_sccm: number;               // 实际流量（sccm）
  set_flow: number;                // 设定流量（sccm）
  flow_percent: number;            // 实际流量百分比
  digital_setpoint_percent: number; // 数字通道设定百分比
  active_setpoint_percent: number;  // 实际生效设定百分比
  mode: 'hold' | 'follow';
  status: 'connected' | 'warning' | 'error' | 'disconnected';
}

export interface FurnaceStatus {
  pv?: number;             // 当前温度 (℃)
  sv?: number;             // 设定温度 (℃)
  mv?: number;             // 输出功率 (%)
  status?: string;         // 设备状态
  segment?: number;        // 当前程序段
  segment_time?: number;   // 段内运行时间 (秒)
  segment_time_set?: number; // 段设定时间 (秒)
}

// 后端统一响应格式
export interface FurnaceOperationResponse {
  ok: boolean;
  data?: {
    pv: number;           // 当前温度
    sv: number;           // 设定温度
    mv: number;           // 输出值
    status: number;       // 状态字节
    segment?: number;     // 程序段（可选）
    segment_time?: number; // 程序段时间（可选）
    segment_time_set?: number; // 程序段设定时间（可选）
    timestamp: string;    // 时间戳
    operation: string;    // 操作类型
  };
  error?: string;         // 错误信息（当ok为false时）
}

// 使用 MfcSetpointRequestFrontend 作为前端专用的 MFC 设定请求
// 避免 MfcSetpointRequest 的重复定义冲突

export interface FurnaceConnectRequest {
  port: string;           // 串口号
  baudrate?: number;      // 波特率 (默认9600)
  address?: number;       // 设备地址 (默认1)
  stopbits?: number;      // 停止位 (默认2)
  timeout?: number;       // 超时时间 (默认1.0秒)
}

// API查询参数类型
export interface HistoryQueryParams {
  from?: string;     // ISO 时间字符串
  to?: string;       // ISO 时间字符串
  limit?: number;    // 返回记录数限制
  offset?: number;   // 偏移量
  downsample?: number; // 降采样间隔
}

// 通用API响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 设备错误类型
export interface DeviceError {
  code: string;
  message: string;
  status: number;
  details?: any;
  retry_after?: number; // 限流重试时间
}

// 限流响应类型
export interface RateLimitResponse {
  message: string;
  retry_after: number;
}

// 设备操作状态类型
export type DeviceOperationStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'error';

// UI状态类型
export interface LoadingState {
  [key: string]: boolean;
}

export interface ErrorState {
  [key: string]: DeviceError | null;
}

// 控制台命令类型
export interface ConsoleCommand {
  id: string;
  timestamp: string;
  command: string;
  parameters?: any;
  result?: any;
}

// 通知类型
export interface NotificationMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  duration?: number;
  timestamp?: string;
}

// 设备连接状态类型
export type DeviceConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

// 连接状态类型
export type ConnectionState = DeviceConnectionStatus;

// MFC扫描请求类型
export interface MfcScanRequest {
  start_address?: number;
  end_address?: number;
  timeout_ms?: number;
  port?: string;  // 要扫描的端口，用于明确指定在哪个端口上扫描
}

// 组件Props类型
export interface DeviceCardProps {
  device: MfcDevice | any;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onConfigure?: () => void;
}

export interface FurnaceControlProps {
  furnace: any;
  onTemperatureChange?: (temperature: number) => void;
  onSegmentChange?: (segment: number) => void;
  onRun?: () => void;
  onPause?: () => void;
  onStop?: () => void;
}

export interface ProgramSegmentEditorProps {
  segments: ProgramSegment[];
  onChange?: (segments: ProgramSegment[]) => void;
  readonly?: boolean;
}

export interface PresetManagerProps {
  presets: FurnacePresetMeta[];
  selectedPreset?: FurnacePreset;
  onSelect?: (preset: FurnacePreset) => void;
  onCreate?: (preset: CreatePresetRequest) => void;
  onUpdate?: (name: string, segments: ProgramSegment[]) => void;
  onDelete?: (name: string) => void;
}

// 图表数据类型
export interface ChartDataPoint {
  timestamp: string;
  value: number;
  label?: string;
}

export interface TemperatureChartData {
  data: ChartDataPoint[];
  sv?: ChartDataPoint[];
  mv?: ChartDataPoint[];
  timeRange?: {
    start: string;
    end: string;
  };
}

export interface FlowChartData {
  data: ChartDataPoint[];
  setpoint?: ChartDataPoint[];
  timeRange?: {
    start: string;
    end: string;
  };
}

// 设备配置类型
export interface DeviceConfig {
  name: string;
  address: number;
  port?: string;
  timeout?: number;
  polling_interval?: number;
}

export interface FurnaceConfig extends DeviceConfig {
  max_temperature?: number;
  heating_rate_limit?: number;
  cooling_rate_limit?: number;
  safety_limits?: {
    max_temperature: number;
    max_heating_rate: number;
  };
}

export interface MfcConfig extends DeviceConfig {
  gas_type: string;
  max_flow_sccm: number;
  calibration_factor?: number;
  flow_mode?: 'hold' | 'follow';
  retry_attempts?: number;
  retry_delay?: number;
}

// 默认配置常量
export const DEFAULT_FURNACE_CONFIG: FurnaceConfig = {
  name: 'Furnace',
  address: 1,
  port: 'COM1',
  timeout: 5000,
  polling_interval: 1000,
  max_temperature: 1200,
  heating_rate_limit: 10,
  cooling_rate_limit: 15,
  safety_limits: {
    max_temperature: 1200,
    max_heating_rate: 10,
  },
};

export const DEFAULT_MFC_CONFIG: MfcConfig = {
  name: 'MFC',
  address: 1,
  port: 'COM1',
  timeout: 3000,
  polling_interval: 500,
  gas_type: 'N2',
  max_flow_sccm: 1000,
  calibration_factor: 1.0,
  flow_mode: 'hold',
  retry_attempts: 3,
  retry_delay: 1000,
};

export interface SegmentProgress {
  active: boolean;
  type: 'read' | 'write';
  progress: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
}
