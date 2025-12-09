/**
 * Furnace 模块类型定义
 */

// 从 @zahnerflow/types 导入基础类型
import type { ProgramSegment, FurnacePreset, FurnaceSample } from '@zahnerflow/types';

// 重导出基础类型
export type { ProgramSegment, FurnacePreset, FurnaceSample };

// 兼容性接口 - 使用 timestamp 而不是 ts
export interface FurnaceSampleWithTimestamp {
  timestamp: string;      // ISO 时间戳
  temperature: number;    // Process Value 实测温度（℃）
  sv?: number;            // Set Value 目标温度（℃）
  mv?: number;            // Manipulated Value 输出百分比（0-100）
  segment?: number;       // 当前段号
  segmentTime?: number;   // 当前段已运行时间（秒）
  segmentTimeSet?: number;// 当前段设定时间（秒）
  status_code?: number;   // 设备状态码 (0=运行, 4=暂停, 12=停止)
}

export interface FurnacePresetMeta {
  name: string;
  created_at: string;
  updated_at: string;
  summary?: string;
}

export interface FurnaceStatus {
  pv?: number;             // 当前温度 (℃)
  sv?: number;             // 设定温度 (℃)
  mv?: number;             // 输出功率 (%)
  status?: string;         // 设备状态
  status_code?: number;    // 设备状态码 (0=运行, 4=暂停, 12=停止)
  segment?: number;        // 当前程序段
  segment_time?: number;   // 段内运行时间 (分钟)
  segment_time_set?: number; // 段设定时间 (分钟)
}

// 后端统一响应格式
export interface FurnaceOperationResponse {
  ok: boolean;
  data?: {
    pv: number;           // 当前温度
    sv: number;           // 设定温度
    mv: number;           // 输出值
    status: number;       // 状态字节
    status_code?: number; // 设备状态码 (0=运行, 4=暂停, 12=停止)
    segment?: number;     // 程序段（可选）
    segment_time?: number; // 程序段时间（分钟）（可选）
    segment_time_set?: number; // 程序段设定时间（分钟）（可选）
    timestamp: string;    // 时间戳
    operation: string;    // 操作类型
  };
  error?: string;         // 错误信息（当ok为false时）
}

export interface FurnaceConnectRequest {
  port: string;           // 串口号
  baudrate?: number;      // 波特率 (默认9600)
  address?: number;       // 设备地址 (默认1)
  stopbits?: number;      // 停止位 (默认2)
  timeout?: number;       // 超时时间 (默认1.0秒)
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

// 程序段操作进度
export interface SegmentProgress {
  active: boolean;        // 是否正在进行程序段操作
  type: 'read' | 'write'; // 操作类型：读取程序段 | 写入程序段
  progress: number;       // 进度百分比 (0-100)
  message?: string;       // 进度消息
}

// API查询参数类型
export interface HistoryQueryParams {
  from?: string;     // ISO 时间字符串
  to?: string;       // ISO 时间字符串
  limit?: number;    // 返回记录数限制
  offset?: number;   // 偏移量
  downsample?: number; // 降采样间隔
}

// 设备配置类型
export interface FurnaceConfig {
  name: string;
  address: number;
  port?: string;
  timeout?: number;
  polling_interval?: number;
  max_temperature?: number;
  heating_rate_limit?: number;
  cooling_rate_limit?: number;
  safety_limits?: {
    max_temperature: number;
    max_heating_rate: number;
  };
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

// 组件Props类型
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

// 导入通用类型
import { DeviceError, LogEntry } from '../devices';

export type { DeviceError, LogEntry };
