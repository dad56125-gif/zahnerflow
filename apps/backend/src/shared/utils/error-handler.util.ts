/**
 * 统一错误处理工具类
 * 实现重试机制、熔断器模式、错误分类和处理策略
 */

export enum ErrorCategory {
  NETWORK = 'NETWORK',           // 网络错误
  DEVICE = 'DEVICE',             // 设备通信错误
  PROTOCOL = 'PROTOCOL',         // 协议解析错误
  TIMEOUT = 'TIMEOUT',           // 超时错误
  VALIDATION = 'VALIDATION',     // 参数验证错误
  BUSINESS = 'BUSINESS',         // 业务逻辑错误
  SYSTEM = 'SYSTEM',             // 系统错误
  UNKNOWN = 'UNKNOWN'            // 未知错误
}

export enum ErrorSeverity {
  LOW = 'LOW',                   // 低级错误，不影响核心功能
  MEDIUM = 'MEDIUM',             // 中级错误，影响部分功能
  HIGH = 'HIGH',                 // 高级错误，影响核心功能
  CRITICAL = 'CRITICAL'          // 严重错误，系统不可用
}

export interface ErrorInfo {
  code: string;
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  timestamp: Date;
  context?: Record<string, any>;
  retryable: boolean;
  suggested_action?: string;
}

export interface RetryConfig {
  max_attempts: number;
  base_delay: number;           // 基础延迟时间（毫秒）
  max_delay: number;            // 最大延迟时间（毫秒）
  backoff_factor: number;       // 退避因子
  jitter: boolean;              // 是否添加随机抖动
}

export interface CircuitBreakerConfig {
  failure_threshold: number;    // 失败阈值
  recovery_timeout: number;     // 恢复超时时间（毫秒）
  monitoring_period: number;    // 监控周期（毫秒）
}

export enum CircuitBreakerState {
  CLOSED = 'CLOSEED',           // 关闭状态，正常工作
  OPEN = 'OPEN',                 // 打开状态，熔断中
  HALF_OPEN = 'HALF_OPEN'        // 半开状态，尝试恢复
}

/**
 * 熔断器实现
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private successCount: number = 0;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= 3) { // 连续成功3次后关闭熔断器
        this.state = CircuitBreakerState.CLOSED;
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.OPEN;
    } else if (this.failureCount >= this.config.failure_threshold) {
      this.state = CircuitBreakerState.OPEN;
    }
  }

  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime >= this.config.recovery_timeout;
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime
    };
  }

  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }
}

/**
 * 重试机制实现
 */
export class RetryHandler {
  constructor(private config: RetryConfig) {}

  async execute<T>(operation: () => Promise<T>, isRetryable?: (error: any) => boolean): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.config.max_attempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // 检查是否可重试
        if (attempt === this.config.max_attempts) {
          break;
        }

        const customRetryable = isRetryable ? isRetryable(error) : this.isRetryableError(error);
        if (!customRetryable) {
          break;
        }

        // 计算延迟时间
        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private calculateDelay(attempt: number): number {
    let delay = Math.min(
      this.config.base_delay * Math.pow(this.config.backoff_factor, attempt - 1),
      this.config.max_delay
    );

    if (this.config.jitter) {
      // 添加随机抖动，避免雷群效应
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return delay;
  }

  private isRetryableError(error: any): boolean {
    // 根据错误类型判断是否可重试
    if (error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED') {
      return true;
    }

    // HTTP状态码判断
    if (error.status >= 500 || error.status === 429) {
      return true;
    }

    // 自定义错误类别判断
    if (error.category === ErrorCategory.NETWORK ||
        error.category === ErrorCategory.TIMEOUT ||
        error.category === ErrorCategory.DEVICE) {
      return true;
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 错误分类器
 */
export class ErrorClassifier {
  static classify(error: any): ErrorInfo {
    const timestamp = new Date();

    // 网络错误
    if (this.isNetworkError(error)) {
      return {
        code: error.code || 'NETWORK_ERROR',
        message: error.message || 'Network connection failed',
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.HIGH,
        timestamp,
        retryable: true,
        suggested_action: 'Check network connection and retry'
      };
    }

    // 超时错误
    if (this.isTimeoutError(error)) {
      return {
        code: error.code || 'TIMEOUT_ERROR',
        message: error.message || 'Operation timed out',
        category: ErrorCategory.TIMEOUT,
        severity: ErrorSeverity.MEDIUM,
        timestamp,
        retryable: true,
        suggested_action: 'Increase timeout and retry'
      };
    }

    // 设备通信错误
    if (this.isDeviceError(error)) {
      return {
        code: error.code || 'DEVICE_ERROR',
        message: error.message || 'Device communication failed',
        category: ErrorCategory.DEVICE,
        severity: ErrorSeverity.HIGH,
        timestamp,
        retryable: true,
        suggested_action: 'Check device connection and status'
      };
    }

    // 验证错误
    if (this.isValidationError(error)) {
      return {
        code: error.code || 'VALIDATION_ERROR',
        message: error.message || 'Invalid parameters',
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.LOW,
        timestamp,
        retryable: false,
        suggested_action: 'Check and correct input parameters'
      };
    }

    // 业务逻辑错误
    if (this.isBusinessError(error)) {
      return {
        code: error.code || 'BUSINESS_ERROR',
        message: error.message || 'Business logic error',
        category: ErrorCategory.BUSINESS,
        severity: ErrorSeverity.MEDIUM,
        timestamp,
        retryable: false,
        suggested_action: 'Check operation constraints and data'
      };
    }

    // 系统错误
    if (this.isSystemError(error)) {
      return {
        code: error.code || 'SYSTEM_ERROR',
        message: error.message || 'System error',
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.CRITICAL,
        timestamp,
        retryable: false,
        suggested_action: 'Contact system administrator'
      };
    }

    // 未知错误
    return {
      code: error.code || 'UNKNOWN_ERROR',
      message: error.message || 'Unknown error occurred',
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      timestamp,
      retryable: false,
      suggested_action: 'Check system logs for details'
    };
  }

  private static isNetworkError(error: any): boolean {
    return error.code === 'ECONNRESET' ||
           error.code === 'ENOTFOUND' ||
           error.code === 'ECONNREFUSED' ||
           error.code === 'NETWORK_ERROR';
  }

  private static isTimeoutError(error: any): boolean {
    return error.code === 'ETIMEDOUT' ||
           error.code === 'TIMEOUT_ERROR' ||
           error.message?.toLowerCase().includes('timeout');
  }

  private static isDeviceError(error: any): boolean {
    return error.code === 'DEVICE_ERROR' ||
           error.code === 'DEVICE_NOT_CONNECTED' ||
           error.code === 'DEVICE_BUSY' ||
           error.category === ErrorCategory.DEVICE ||
           error.message?.toLowerCase().includes('device');
  }

  private static isValidationError(error: any): boolean {
    return error.status === 400 ||
           error.code === 'VALIDATION_ERROR' ||
           error.message?.toLowerCase().includes('invalid') ||
           error.message?.toLowerCase().includes('required');
  }

  private static isBusinessError(error: any): boolean {
    return error.status === 409 ||
           error.status === 422 ||
           error.code === 'BUSINESS_ERROR' ||
           error.category === ErrorCategory.BUSINESS;
  }

  private static isSystemError(error: any): boolean {
    return error.status >= 500 ||
           error.code === 'SYSTEM_ERROR' ||
           error.category === ErrorCategory.SYSTEM;
  }
}

/**
 * 错误监控和日志管理器
 */
export class ErrorMonitor {
  private errors: ErrorInfo[] = [];
  private maxLogSize: number = 1000;
  private errorCounts: Map<string, number> = new Map();

  log(error: ErrorInfo): void {
    // 添加到错误列表
    this.errors.push(error);

    // 保持日志大小
    if (this.errors.length > this.maxLogSize) {
      this.errors.shift();
    }

    // 更新错误计数
    const key = `${error.category}:${error.code}`;
    this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1);

    // 根据严重程度采取不同处理
    this.handleBySeverity(error);
  }

  private handleBySeverity(error: ErrorInfo): void {
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        console.error('🚨 CRITICAL ERROR:', error);
        // 可以添加告警通知逻辑
        break;
      case ErrorSeverity.HIGH:
        console.error('⚠️ HIGH SEVERITY ERROR:', error);
        break;
      case ErrorSeverity.MEDIUM:
        console.warn('⚡ MEDIUM SEVERITY ERROR:', error);
        break;
      case ErrorSeverity.LOW:
        console.log('ℹ️ LOW SEVERITY ERROR:', error);
        break;
    }
  }

  getErrorStats() {
    const recentErrors = this.getRecentErrors(60000); // 最近1分钟
    const categoryStats = new Map<ErrorCategory, number>();
    const severityStats = new Map<ErrorSeverity, number>();

    recentErrors.forEach(error => {
      categoryStats.set(error.category, (categoryStats.get(error.category) || 0) + 1);
      severityStats.set(error.severity, (severityStats.get(error.severity) || 0) + 1);
    });

    return {
      total: this.errors.length,
      recentCount: recentErrors.length,
      categoryStats: Object.fromEntries(categoryStats),
      severityStats: Object.fromEntries(severityStats),
      errorCounts: Object.fromEntries(this.errorCounts),
      timeWindow: '1 minute'
    };
  }

  getRecentErrors(timeWindowMs: number): ErrorInfo[] {
    const cutoff = Date.now() - timeWindowMs;
    return this.errors.filter(error =>
      error.timestamp.getTime() > cutoff
    );
  }

  clearErrors(): void {
    this.errors = [];
    this.errorCounts.clear();
  }

  exportErrors(): ErrorInfo[] {
    return [...this.errors];
  }
}

/**
 * 默认配置
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  max_attempts: 3,
  base_delay: 1000,
  max_delay: 30000,
  backoff_factor: 2,
  jitter: true
};

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failure_threshold: 5,
  recovery_timeout: 60000,
  monitoring_period: 300000
};

/**
 * 全局错误监控实例
 */
export const globalErrorMonitor = new ErrorMonitor();