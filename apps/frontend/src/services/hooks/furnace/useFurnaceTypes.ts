/**
 * Furnace 类型安全增强工具
 */

import { FurnaceStatus, DeviceOperationStatus, LogType } from '../../../types/devices';

// 类型守卫函数
export function isValidFurnaceStatus(status: unknown): status is FurnaceStatus {
  if (!status || typeof status !== 'object') return false;

  const s = status as any;
  return (
    typeof s.pv === 'number' && !isNaN(s.pv) &&
    typeof s.sv === 'number' && !isNaN(s.sv) &&
    typeof s.mv === 'number' && !isNaN(s.mv) &&
    typeof s.status === 'string' &&
    typeof s.segment === 'number' && s.segment >= 0 && s.segment <= 30 &&
    typeof s.segment_time === 'number' && s.segment_time >= 0 &&
    typeof s.segment_time_set === 'number' && s.segment_time_set >= 0
  );
}

export function isValidDeviceOperationStatus(status: unknown): status is DeviceOperationStatus {
  return (
    status === 'idle' ||
    status === 'running' ||
    status === 'paused' ||
    status === 'stopped'
  );
}

export function isValidLogType(type: unknown): type is LogType {
  return type === 'operation' || type === 'comm' || type === 'system' || type === 'error';
}

// 运行时类型检查和验证
export function validateAndCreateFurnaceStatus(data: unknown): FurnaceStatus {
  if (!isValidFurnaceStatus(data)) {
    console.warn('[Type Safety] 无效的FurnaceStatus数据，使用默认值:', data);
    return {
      pv: 0,
      sv: 0,
      mv: 0,
      status: 'unknown',
      segment: 0,
      segment_time: 0,
      segment_time_set: 0,
    };
  }
  return data;
}

export function validateDeviceOperationStatus(data: unknown): DeviceOperationStatus {
  if (!isValidDeviceOperationStatus(data)) {
    console.warn('[Type Safety] 无效的DeviceOperationStatus数据，使用默认值:', data);
    return 'idle';
  }
  return data;
}

// 枚举验证器
export const OPERATION_STATUS_VALUES = ['idle', 'running', 'paused', 'stopped'] as const;
export const LOG_TYPE_VALUES = ['operation', 'comm', 'system', 'error'] as const;
export const FURNACE_STATUS_VALUES = ['idle', 'run', 'hold', 'stop', 'unknown'] as const;

// 类型安全的枚举检查
export function isOperationStatusValid(status: string): status is DeviceOperationStatus {
  return OPERATION_STATUS_VALUES.includes(status as DeviceOperationStatus);
}

export function isLogTypeValid(type: string): type is LogType {
  return LOG_TYPE_VALUES.includes(type as LogType);
}

export function isFurnaceStatusValid(status: string): boolean {
  return FURNACE_STATUS_VALUES.includes(status as any);
}

// 安全的数值转换
export function safeNumber(value: unknown, defaultValue: number = 0): number {
  if (typeof value === 'number' && !isNaN(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return !isNaN(parsed) ? parsed : defaultValue;
  }
  return defaultValue;
}

export function safeInteger(value: unknown, defaultValue: number = 0): number {
  const num = safeNumber(value, defaultValue);
  return Math.round(num);
}

// 范围限制
export function clampTemperature(temp: number): number {
  return Math.max(-273.15, Math.min(3000, temp)); // 合理的温度范围
}

export function clampSegment(segment: number): number {
  return Math.max(0, Math.min(30, Math.round(segment))); // 程序段范围 0-30
}

export function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, value)); // 百分比范围 0-100
}

// 安全的字符串处理
export function safeString(value: unknown, defaultValue: string = ''): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return defaultValue;
  }
  return String(value);
}

// 时间戳验证
export function isValidTimestamp(timestamp: unknown): boolean {
  if (typeof timestamp !== 'string' && typeof timestamp !== 'number') {
    return false;
  }

  const date = new Date(timestamp);
  return !isNaN(date.getTime());
}

export function safeTimestamp(timestamp: unknown): string {
  if (isValidTimestamp(timestamp)) {
    return new Date(timestamp).toISOString();
  }
  return new Date().toISOString();
}

// API响应验证
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  success?: boolean;
}

export function validateApiResponse<T>(
  response: unknown,
  validator: (data: unknown) => data is T
): { success: boolean; data?: T; error?: string } {
  if (!response || typeof response !== 'object') {
    return { success: false, error: 'Invalid API response format' };
  }

  const resp = response as any;

  if (resp.error) {
    return { success: false, error: safeString(resp.error) };
  }

  if (resp.success === false) {
    return { success: false, error: 'API operation failed' };
  }

  if (resp.data && validator(resp.data)) {
    return { success: true, data: resp.data };
  }

  return { success: false, error: 'Invalid data format in API response' };
}

// 错误类型检查
export function isNetworkError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes('Network Error') ||
     error.message.includes('fetch') ||
     error.message.includes('ECONNREFUSED') ||
     error.message.includes('timeout'))
  );
}

export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as any;
  return err.code === 'RATE_LIMIT' || err.status === 429;
}

// 防御性类型转换
export function defensiveCast<T>(
  value: unknown,
  validator: (v: unknown) => v is T,
  defaultValue: T
): T {
  return validator(value) ? value : defaultValue;
}

// 批量类型检查
export function validateArray<T>(
  items: unknown[],
  validator: (item: unknown) => item is T
): { valid: T[]; invalid: unknown[] } {
  const valid: T[] = [];
  const invalid: unknown[] = [];

  items.forEach(item => {
    if (validator(item)) {
      valid.push(item);
    } else {
      invalid.push(item);
    }
  });

  return { valid, invalid };
}

// 类型安全的枚举工厂
export function createEnumValidator<T extends readonly string[]>(values: T) {
  return (value: unknown): value is T[number] => {
    return typeof value === 'string' && values.includes(value as T[number]);
  };
}

// 创建特定验证器
export const isValidFurnaceStatusValue = createEnumValidator(FURNACE_STATUS_VALUES);
export const isValidOperationStatusValue = createEnumValidator(OPERATION_STATUS_VALUES);
export const isValidLogTypeValue = createEnumValidator(LOG_TYPE_VALUES);