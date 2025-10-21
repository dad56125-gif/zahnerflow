/**
 * 设备相关类型定义
 *
 * 基于 @zahnerflow/types 扩展前端专用的设备状态和UI类型
 */

// 重新导出 @zahnerflow/types 中的基础类型
// 注意：这里假设 @zahnerflow/types 包含以下类型，如果没有，需要定义

// 基础类型定义（如果 @zahnerflow/types 不可用）
export interface ProgramSegment {
  id: number;
  temperature: number; // 温度 (℃)
  time: number;       // 时间 (秒)
}

export interface FurnacePresetMeta {
  name: string;
  created_at: string;
  updated_at: string;
  summary?: string;
}

export interface FurnacePreset extends FurnacePresetMeta {
  segments: ProgramSegment[];
}

export interface MfcDeviceInfo {
  address: number;
  gas_type: string;
  max_flow_sccm: number;
}

export interface MfcStatus {
  address: number;
  flow_percent: number;
  flow_sccm: number;
  digital_setpoint_percent: number;
  active_setpoint_percent: number;
}

export interface FurnaceSample {
  timestamp: string;
  temperature: number;
  sv?: number;
  mv?: number;
}

export interface MfcSample {
  timestamp: string;
  address: number;
  flow_sccm: number;
  flow_percent: number;
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
  current_flow: number;
  set_flow: number;
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

export interface MfcSetpointRequest {
  address: number;
  sccm: number;
}

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
  limit?: number;    // 数据点数量限制
  downsample?: number; // 采样间隔 (秒)
}

export interface MfcScanRequest {
  start?: number;    // 起始地址
  end?: number;      // 结束地址
}

// API响应类型
export interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface RateLimitResponse {
  message: string;
  retry_after: number;
}

// 错误类型
export interface DeviceError {
  code: string;
  message: string;
  status?: number;
  retry_after?: number;
}

// 设备连接状态
export type DeviceConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'connecting'
  | 'error'
  | 'timeout';

// 设备操作状态
// AI-518P 温控器只支持 3 种基本控制状态：run/pause/stop
// 注意：pause/hold 在硬件层面是同一种状态（保温/暂停）
export type DeviceOperationStatus =
  | 'running'  // 运行状态 (对应后端 run)
  | 'paused'   // 保温/暂停状态 (对应后端 pause/hold)
  | 'stopped'  // 停止状态 (对应后端 stop)
  | 'unknown'; // 未知状态（后端返回无效状态时的fallback）

// UI状态类型
export interface LoadingState {
  isLoading: boolean;
  message?: string;
}

export interface ErrorState {
  hasError: boolean;
  error: DeviceError | null;
}

export interface ConnectionState {
  status: DeviceConnectionStatus;
  lastConnected?: string;
  reconnectAttempts: number;
}

// 日志类型
export type LogType = 'comm' | 'operation';  // 通信日志 | 操作日志

// 通信日志类型
export interface CommLog {
  timestamp: string;     // 时间戳 HH:MM:SS.sss
  direction: 'TX' | 'RX';  // 发送/接收方向
  data: string;          // 16进制数据字符串
}

// 操作日志类型
export interface OperationLog {
  timestamp: string;     // 时间戳 HH:MM:SS
  level: 'success' | 'info' | 'warning' | 'error';  // 日志级别
  message: string;       // 操作描述信息
}

// 统一日志条目（用于前端显示）
export interface LogEntry {
  id: string;            // 唯一标识
  timestamp: string;     // 时间戳
  type: LogType;         // 日志类型
  data: CommLog | OperationLog;  // 具体数据
}

// 组件Props类型
export interface DeviceCardProps {
  device: MfcDevice;
  onSetFlow?: (address: number, sccm: number) => Promise<void>;
  onSetMode?: (address: number, mode: 'hold' | 'follow') => Promise<void>;
  loading?: boolean;
  disabled?: boolean;
}

export interface FurnaceControlProps {
  status: FurnaceStatus | null;
  isConnected: boolean;
  onConnect?: () => Promise<void>;
  onDisconnect?: () => Promise<void>;
  onRun?: () => Promise<void>;
  onPause?: () => Promise<void>;
  onStop?: () => Promise<void>;
  onSetTemperature?: (sv: number) => Promise<void>;
  onSetSegment?: (segment: number) => Promise<void>;
  loading?: boolean;
  disabled?: boolean;
}

export interface ProgramSegmentEditorProps {
  segments: ProgramSegment[];
  onSave?: (segments: ProgramSegment[]) => Promise<void>;
  onLoad?: () => Promise<void>;
  loading?: boolean;
  disabled?: boolean;
}

export interface PresetManagerProps {
  presets: FurnacePresetMeta[];
  onSelect?: (preset: FurnacePresetMeta) => void;
  onApply?: (name: string) => Promise<void>;
  onCreate?: (preset: CreatePresetRequest) => Promise<void>;
  onUpdate?: (name: string, segments: ProgramSegment[]) => Promise<void>;
  onDelete?: (name: string) => Promise<void>;
  onClone?: (name: string, newName: string) => Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  rateLimitInfo?: {
    isLimited: boolean;
    retryAfter: number;
  };
}

// 图表数据类型
export interface ChartDataPoint {
  timestamp: number;
  value: number;
  label?: string;
}

export interface TemperatureChartData {
  pv: ChartDataPoint[];
  sv?: ChartDataPoint[];
  mv?: ChartDataPoint[];
}

export interface FlowChartData {
  [address: number]: ChartDataPoint[];
}

// 配置类型
export interface DeviceConfig {
  polling_interval: number;    // 轮询间隔 (ms)
  connection_timeout: number;  // 连接超时 (ms)
  retry_attempts: number;      // 重试次数
  retry_delay: number;         // 重试延迟 (ms)
}

export interface FurnaceConfig extends DeviceConfig {
  max_temperature: number;     // 最大温度限制
  temperature_tolerance: number; // 温度容差
}

export interface MfcConfig extends DeviceConfig {
  max_flow_sccm: number;       // 最大流量限制
  flow_tolerance: number;      // 流量容差
}

// 默认配置
export const DEFAULT_FURNACE_CONFIG: FurnaceConfig = {
  polling_interval: 2000,
  connection_timeout: 5000,
  retry_attempts: 3,
  retry_delay: 1000,
  max_temperature: 1200,
  temperature_tolerance: 1.0,
};

export const DEFAULT_MFC_CONFIG: MfcConfig = {
  polling_interval: 3000,
  connection_timeout: 5000,
  retry_attempts: 3,
  retry_delay: 1000,
  max_flow_sccm: 2000,
  flow_tolerance: 0.5,
};