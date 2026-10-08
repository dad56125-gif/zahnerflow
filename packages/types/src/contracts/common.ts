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

export interface ExecutionFailure {
  /** 可定位错误类型的稳定错误码 */
  code: string;
  /** 关联设备 */
  device?: string;
  /** 失败阶段 */
  stage: 'preflight' | 'command' | 'confirmation' | 'waiting';
  /** 中文失败标题 */
  title: string;
  /** 已确认事实的中文说明 */
  message: string;
  /** 下一步检查建议，不自动重试 */
  suggestion: string;
  /** 启动命令事实：未发送、部分配置已写入、已确认或结果未知 */
  commandOutcome: 'not_sent' | 'partial' | 'acknowledged' | 'unknown';
  /** 保留的原始异常原因 */
  originalError: string;
  /** 故障发生时的参数与测量事实，不含用户设置 */
  details?: Record<string, any>;
}

export interface RuntimeDiagnosticBundle {
  /** 诊断导出格式版本 */
  schemaVersion?: 1;
  /** 导出时应用版本 */
  appVersion: string;
  /** 导出时间 */
  exportedAt: string;
  /** 导出时后端进程身份 */
  runtimeId: string;
  /** 操作系统及运行环境 */
  system: Record<string, any>;
  /** 选定执行的持久化步骤及故障事实 */
  execution?: Record<string, any> | null;
  /** 导出时的设备快照，不能当成故障发生时状态 */
  deviceSnapshots?: Record<string, any>[];
  /** 限定范围的设备生命周期记录 */
  runtimeEvents?: Record<string, any>[];
  /** 当前进程有限条设备命令日志；重启后可能为空 */
  commandLogs?: Record<string, any>;
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
  /** 关联执行，供重置后导出历史诊断 */
  executionId?: string | null;
  /** 结构化失败事实；普通通知可为空 */
  failure?: ExecutionFailure | null;
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
