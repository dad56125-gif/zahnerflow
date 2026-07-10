/**
 * 加热炉数据契约
 * 自动生成 — 勿手动修改
 * 来源: apps/shared/contracts/furnace.py
 */

export interface FurnaceStatus {
  /** 时间戳 (ISO 格式) */
  ts: string;
  /** Process Value — 当前实际温度 (℃) */
  pv: number;
  /** Set Value — 设定目标温度 (℃) */
  sv: number;
  /** Manipulated Value — 加热器输出功率 (0-100%) */
  mv: number;
  /** 运行状态: running / paused / stopped / idle */
  status: string;
  /** 当前硬件段号 (1-30；28-30 为点变温保留段) */
  segment: number;
  /** 当前段已运行时间 (秒) */
  segmentTime: number;
  /** 当前段设定时间 (秒) */
  segmentTimeSet: number;
}

export interface ProgramSegment {
  /** 段号 (1-27) */
  id: number;
  /** 目标温度 (℃) */
  temperature: number;
  /** 保持时间 (分钟), -121=停止符 */
  time: number;
}

export interface FurnacePreset {
  /** 预设名称 (唯一) */
  name: string;
  /** 程序段列表 */
  segments: ProgramSegment[];
  /** 可选描述 */
  summary?: string | null;
  /** 创建时间 (ISO) */
  createdAt?: string | null;
  /** 更新时间 (ISO) */
  updatedAt?: string | null;
}

export interface FurnaceConnectRequest {
  /** 串口号 (如 COM3) */
  port: string;
  /** 通信波特率 */
  baudrate?: number;
  /** Modbus 设备地址 */
  address?: number;
  /** 停止位 */
  stopbits?: number;
  /** 超时时间 (秒) */
  timeout?: number;
}

export interface FurnaceConfig {
  /** 设备名称 */
  name?: string;
  /** Modbus 地址 */
  address?: number;
  /** 串口号 */
  port?: string;
  /** 超时 (毫秒) */
  timeout?: number;
  /** 轮询间隔 (毫秒) */
  pollingInterval?: number;
  /** 最高允许温度 (℃) */
  maxTemperature?: number;
  /** 最大升温速率 (℃/分钟) */
  heatingRateLimit?: number;
  /** 最大降温速率 (℃/分钟) */
  coolingRateLimit?: number;
}

export interface SegmentProgress {
  /** 是否正在进行操作 */
  active: boolean;
  /** 操作类型: read / write */
  type: string;
  /** 进度百分比 (0-100) */
  progress: number;
  /** 进度提示文字 */
  message?: string | null;
}

export type FurnaceSample = FurnaceStatus;
