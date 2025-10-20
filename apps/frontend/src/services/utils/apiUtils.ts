/**
 * API 工具函数
 *
 * 提供API调用的通用工具函数和错误处理
 */

import { DeviceError } from '../api';

/**
 * 判断错误是否可重试
 */
export function isRetryableError(error: any): boolean {
  if (!error) return false;

  // 网络错误通常可以重试
  if (error.code === 'NETWORK_ERROR') return true;

  // 5xx 服务器错误可以重试
  if (error.status >= 500 && error.status < 600) return true;

  // 429 限流错误可以重试
  if (error.code === 'RATE_LIMIT') return true;

  // 408 请求超时可以重试
  if (error.status === 408) return true;

  return false;
}

/**
 * 格式化API错误信息
 */
export function formatError(error: any): string {
  if (error?.code === 'RATE_LIMIT') {
    return `请求过于频繁，请等待 ${error.retry_after} 秒后重试`;
  }

  if (error?.code === 'NETWORK_ERROR') {
    return '网络连接失败，请检查网络连接';
  }

  if (error?.code?.startsWith('HTTP_')) {
    return `服务器错误 (${error.status}): ${error.message}`;
  }

  if (error?.message) {
    return error.message;
  }

  return '未知错误';
}

/**
 * 创建重试延迟
 */
export function createRetryDelay(
  attempt: number,
  baseDelay: number = 1000,
  maxDelay: number = 30000,
  backoffFactor: number = 2
): number {
  const delay = baseDelay * Math.pow(backoffFactor, attempt - 1);
  return Math.min(delay, maxDelay);
}

/**
 * 检查是否为429限流错误
 */
export function isRateLimitError(error: any): error is DeviceError & { code: 'RATE_LIMIT' } {
  return error?.code === 'RATE_LIMIT';
}

/**
 * 获取限流重试时间
 */
export function getRateLimitRetryAfter(error: any): number {
  if (isRateLimitError(error)) {
    return error.retry_after || 5;
  }
  return 0;
}

/**
 * 检查是否为网络错误
 */
export function isNetworkError(error: any): boolean {
  return error?.code === 'NETWORK_ERROR';
}

/**
 * 检查是否为客户端错误 (4xx)
 */
export function isClientError(error: any): boolean {
  return error?.status >= 400 && error?.status < 500;
}

/**
 * 检查是否为服务器错误 (5xx)
 */
export function isServerError(error: any): boolean {
  return error?.status >= 500 && error?.status < 600;
}

/**
 * 创建统一的API错误对象
 */
export function createApiError(
  code: string,
  message: string,
  status?: number,
  retry_after?: number
): DeviceError {
  return {
    code,
    message,
    status,
    retry_after,
  };
}

/**
 * 处理API响应
 */
export async function handleApiResponse<T>(
  response: Response
): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw createApiError(
      `HTTP_${response.status}`,
      errorData.error || errorData.message || `HTTP ${response.status}`,
      response.status
    );
  }

  if (response.status === 204) {
    return null as T;
  }

  return response.json();
}

/**
 * 处理429限流响应
 */
export function handleRateLimitResponse(
  response: Response,
  retryAfter?: number
): never {
  const retryAfterHeader = response.headers.get('Retry-After');
  const retryAfterTime = retryAfter ||
    retryAfterHeader ? parseInt(retryAfterHeader) : 5;

  throw createApiError(
    'RATE_LIMIT',
    'Rate limited',
    429,
    retryAfterTime
  );
}