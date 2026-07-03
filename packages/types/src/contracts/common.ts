/**
 * 通用数据契约
 * 自动生成 — 勿手动修改
 * 来源: apps/shared/contracts/common.py
 */

export interface DeviceError {
  /** 错误码 (如 FURNACE_TIMEOUT) */
  code: string;
  /** 人能看懂的描述 */
  message: string;
  /** HTTP 状态码 */
  status: number;
  /** 额外信息 */
  details?: any | null;
  /** 建议重试等待时间 (秒) */
  retryAfter?: number | null;
}

export interface LogEntry {
  /** 唯一标识 */
  id: string;
  /** 时间 (如 10:30:15) */
  timestamp: string;
  /** 日志级别 */
  type: string;
  /** 日志内容 */
  message: string;
}

export interface ChartDataPoint {
  /** 时间 (ISO) */
  timestamp: string;
  /** 数值 */
  value: number;
  /** 标签 */
  label?: string | null;
}

export interface NotificationMessage {
  /** 唯一标识 */
  id: string;
  /** 消息级别 */
  type: string;
  /** 标题 */
  title: string;
  /** 内容 */
  message: string;
  /** 时间 */
  timestamp: string;
  /** 显示时长 (毫秒) */
  duration?: number | null;
  /** 额外错误详情 */
  details?: any | null;
}

export interface HistoryQueryParams {
  /** 起始时间 (ISO) */
  from?: string | null;
  /** 结束时间 (ISO) */
  to?: string | null;
  /** 最多返回条数 */
  limit?: number | null;
  /** 跳过条数 (分页) */
  offset?: number | null;
  /** 每 N 条取 1 条 */
  downsample?: number | null;
}

/** 设备连接状态 */
export type DeviceConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

/** 日志级别 */
export type LogEntryType = 'success' | 'info' | 'warning' | 'error';
