/**
 * 前端错误处理工具类
 * 实现与后端一致的错误分类、重试机制和熔断器模式
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

export interface FrontendErrorInfo {
  code: string;
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  timestamp: Date;
  context?: Record<string, any>;
  retryable: boolean;
  suggested_action?: string;
  user_message?: string;          // 用户友好的错误消息
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
  CLOSED = 'CLOSED',           // 关闭状态，正常工作
  OPEN = 'OPEN',                 // 打开状态，熔断中
  HALF_OPEN = 'HALF_OPEN'        // 半开状态，尝试恢复
}

/**
 * 前端熔断器实现
 */
export class FrontendCircuitBreaker {
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
        console.log(`Circuit breaker ${this.config} entering HALF_OPEN state`);
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
        console.log(`Circuit breaker ${this.config} CLOSED after successful recovery`);
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
      console.log(`Circuit breaker ${this.config} OPENED after ${this.failureCount} failures`);
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
 * 前端重试机制实现
 */
export class FrontendRetryHandler {
  constructor(private config: RetryConfig) {}

  async execute<T>(operation: () => Promise<T>, isRetryable?: (error: any) => boolean): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.config.max_attempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // 如果是最后一次尝试，直接抛出错误
        if (attempt === this.config.max_attempts) {
          break;
        }

        // 检查是否可重试
        const customRetryable = isRetryable ? isRetryable(error) : this.isRetryableError(error);
        if (!customRetryable) {
          break;
        }

        // 计算延迟时间
        const delay = this.calculateDelay(attempt);
        console.warn(`操作失败，${delay}ms后重试 (尝试 ${attempt}/${this.config.max_attempts}):`, error);
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
    // HTTP状态码判断
    if (error.status >= 500 || error.status === 429) {
      return true;
    }

    // 网络错误
    if (error.code === 'NETWORK_ERROR' ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED') {
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
 * 前端错误分类器
 */
export class FrontendErrorClassifier {
  static classify(error: any, context?: Record<string, any>): FrontendErrorInfo {
    const timestamp = new Date();

    // 网络错误
    if (this.isNetworkError(error)) {
      return {
        code: error.code || 'NETWORK_ERROR',
        message: error.message || '网络连接失败',
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.HIGH,
        timestamp,
        retryable: true,
        suggested_action: '检查网络连接并重试',
        user_message: '网络连接出现问题，请检查网络后重试',
        context
      };
    }

    // 超时错误
    if (this.isTimeoutError(error)) {
      return {
        code: error.code || 'TIMEOUT_ERROR',
        message: error.message || '操作超时',
        category: ErrorCategory.TIMEOUT,
        severity: ErrorSeverity.MEDIUM,
        timestamp,
        retryable: true,
        suggested_action: '稍后重试或增加超时时间',
        user_message: '操作超时，请稍后重试',
        context
      };
    }

    // 设备通信错误
    if (this.isDeviceError(error)) {
      return {
        code: error.code || 'DEVICE_ERROR',
        message: error.message || '设备通信失败',
        category: ErrorCategory.DEVICE,
        severity: ErrorSeverity.HIGH,
        timestamp,
        retryable: true,
        suggested_action: '检查设备连接状态',
        user_message: '设备通信失败，请检查设备连接',
        context
      };
    }

    // 验证错误
    if (this.isValidationError(error)) {
      return {
        code: error.code || 'VALIDATION_ERROR',
        message: error.message || '参数验证失败',
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.LOW,
        timestamp,
        retryable: false,
        suggested_action: '检查输入参数',
        user_message: '输入参数有误，请检查后重新输入',
        context
      };
    }

    // 业务逻辑错误
    if (this.isBusinessError(error)) {
      return {
        code: error.code || 'BUSINESS_ERROR',
        message: error.message || '业务逻辑错误',
        category: ErrorCategory.BUSINESS,
        severity: ErrorSeverity.MEDIUM,
        timestamp,
        retryable: false,
        suggested_action: '检查操作约束',
        user_message: '操作无法执行，请检查相关条件',
        context
      };
    }

    // 系统错误
    if (this.isSystemError(error)) {
      return {
        code: error.code || 'SYSTEM_ERROR',
        message: error.message || '系统错误',
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.CRITICAL,
        timestamp,
        retryable: false,
        suggested_action: '联系系统管理员',
        user_message: '系统出现错误，请联系技术支持',
        context
      };
    }

    // 未知错误
    return {
      code: error.code || 'UNKNOWN_ERROR',
      message: error.message || '未知错误',
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      timestamp,
      retryable: false,
      suggested_action: '查看系统日志获取详细信息',
      user_message: '发生未知错误，请稍后重试或联系技术支持',
      context
    };
  }

  private static isNetworkError(error: any): boolean {
    return error.code === 'ECONNRESET' ||
           error.code === 'ENOTFOUND' ||
           error.code === 'ECONNREFUSED' ||
           error.code === 'NETWORK_ERROR' ||
           error.name === 'NetworkError' ||
           error.message?.toLowerCase().includes('network') ||
           error.message?.toLowerCase().includes('fetch');
  }

  private static isTimeoutError(error: any): boolean {
    return error.code === 'ETIMEDOUT' ||
           error.code === 'TIMEOUT_ERROR' ||
           error.name === 'TimeoutError' ||
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
 * 前端错误监控和管理器
 */
export class FrontendErrorMonitor {
  private errors: FrontendErrorInfo[] = [];
  private maxLogSize: number = 1000;
  private errorCounts: Map<string, number> = new Map();

  log(error: FrontendErrorInfo): void {
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

    // 在开发环境下输出详细错误信息
    if (process.env.NODE_ENV === 'development') {
      console.error('Frontend Error:', error);
    }
  }

  private handleBySeverity(error: FrontendErrorInfo): void {
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        console.error('🚨 CRITICAL ERROR:', error);
        // 可以添加告警通知逻辑
        this.showUserNotification(error.user_message || error.message, 'error');
        break;
      case ErrorSeverity.HIGH:
        console.error('⚠️ HIGH SEVERITY ERROR:', error);
        this.showUserNotification(error.user_message || error.message, 'warning');
        break;
      case ErrorSeverity.MEDIUM:
        console.warn('⚡ MEDIUM SEVERITY ERROR:', error);
        // 可以显示非阻塞通知
        this.showUserNotification(error.user_message || error.message, 'info');
        break;
      case ErrorSeverity.LOW:
        console.log('ℹ️ LOW SEVERITY ERROR:', error);
        // 可以静默处理或仅在开发者控制台显示
        break;
    }
  }

  private showUserNotification(message: string, type: 'error' | 'warning' | 'info'): void {
    // 这里可以集成具体的UI通知库
    if (type === 'error') {
      alert(`错误: ${message}`);
    } else if (type === 'warning') {
      console.warn(`警告: ${message}`);
    } else {
      console.info(`提示: ${message}`);
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

  getRecentErrors(timeWindowMs: number): FrontendErrorInfo[] {
    const cutoff = Date.now() - timeWindowMs;
    return this.errors.filter(error =>
      error.timestamp.getTime() > cutoff
    );
  }

  clearErrors(): void {
    this.errors = [];
    this.errorCounts.clear();
  }

  exportErrors(): FrontendErrorInfo[] {
    return [...this.errors];
  }
}

/**
 * 前端API调用包装器
 */
export class ApiCallWrapper {
  constructor(
    private retryHandler: FrontendRetryHandler,
    private circuitBreaker: FrontendCircuitBreaker,
    private errorMonitor: FrontendErrorMonitor
  ) {}

  async execute<T>(
    apiCall: () => Promise<T>,
    context?: Record<string, any>,
    customRetryable?: (error: any) => boolean
  ): Promise<T> {
    try {
      const protectedApiCall = async () => {
        return this.retryHandler.execute(apiCall, customRetryable);
      };

      return await this.circuitBreaker.execute(protectedApiCall);
    } catch (error) {
      // 分类错误并记录
      const errorInfo = FrontendErrorClassifier.classify(error, context);
      this.errorMonitor.log(errorInfo);
      throw error;
    }
  }

  getCircuitBreakerState(): CircuitBreakerState {
    return this.circuitBreaker.getState();
  }

  getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }

  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
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
 * 创建熔炉API专用的错误处理器
 */
export function createFurnaceApiErrorHandler(): ApiCallWrapper {
  const retryHandler = new FrontendRetryHandler(DEFAULT_RETRY_CONFIG);
  const circuitBreaker = new FrontendCircuitBreaker(DEFAULT_CIRCUIT_BREAKER_CONFIG);
  const errorMonitor = new FrontendErrorMonitor();

  return new ApiCallWrapper(retryHandler, circuitBreaker, errorMonitor);
}

/**
 * 全局前端错误监控实例
 */
export const globalFrontendErrorMonitor = new FrontendErrorMonitor();

// 全局错误处理
window.addEventListener('error', (event) => {
  const errorInfo = FrontendErrorClassifier.classify(event.error, {
    type: 'global_error',
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  });
  globalFrontendErrorMonitor.log(errorInfo);
});

window.addEventListener('unhandledrejection', (event) => {
  const errorInfo = FrontendErrorClassifier.classify(event.reason, {
    type: 'unhandled_promise_rejection'
  });
  globalFrontendErrorMonitor.log(errorInfo);
});