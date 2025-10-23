import { Injectable, Logger } from '@nestjs/common';
import {
  ErrorCategory,
  ErrorSeverity,
  CircuitBreaker,
  RetryHandler,
  ErrorClassifier,
  ErrorInfo,
  ErrorMonitor,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  CircuitBreakerConfig,
  RetryConfig
} from '../../../shared/utils/error-handler.util';

export interface FurnaceErrorContext {
  connection_id?: string;
  operation?: string;
  port?: string;
  address?: number;
  segment_id?: number;
  temperature?: number;
}

@Injectable()
export class FurnaceErrorHandlerService {
  private readonly logger = new Logger(FurnaceErrorHandlerService.name);
  private readonly errorMonitor = new ErrorMonitor();
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();
  private readonly retryHandlers = new Map<string, RetryHandler>();

  constructor() {
    // 初始化设备连接熔断器
    this.createCircuitBreaker('device_connection', {
      failure_threshold: 3,
      recovery_timeout: 30000,
      monitoring_period: 60000
    });

    // 初始化设备操作熔断器
    this.createCircuitBreaker('device_operation', {
      failure_threshold: 5,
      recovery_timeout: 15000,
      monitoring_period: 30000
    });

    // 初始化程序段操作熔断器
    this.createCircuitBreaker('program_segments', {
      failure_threshold: 3,
      recovery_timeout: 45000,
      monitoring_period: 90000
    });
  }

  /**
   * 创建熔断器
   */
  createCircuitBreaker(name: string, config?: CircuitBreakerConfig): void {
    if (!this.circuitBreakers.has(name)) {
      this.circuitBreakers.set(name, new CircuitBreaker(config || DEFAULT_CIRCUIT_BREAKER_CONFIG));
      this.logger.log(`Created circuit breaker: ${name}`);
    }
  }

  /**
   * 创建重试处理器
   */
  createRetryHandler(name: string, config?: RetryConfig): void {
    if (!this.retryHandlers.has(name)) {
      this.retryHandlers.set(name, new RetryHandler(config || DEFAULT_RETRY_CONFIG));
      this.logger.log(`Created retry handler: ${name}`);
    }
  }

  /**
   * 使用熔断器执行操作
   */
  async executeWithCircuitBreaker<T>(
    breakerName: string,
    operation: () => Promise<T>,
    context?: FurnaceErrorContext
  ): Promise<T> {
    const breaker = this.circuitBreakers.get(breakerName);
    if (!breaker) {
      this.logger.warn(`Circuit breaker not found: ${breakerName}, executing without protection`);
      return operation();
    }

    try {
      const result = await breaker.execute(operation);

      // 记录成功的操作
      this.logger.debug(`Circuit breaker ${breakerName}: operation succeeded`, context);
      return result;
    } catch (error) {
      // 分类错误并记录
      const errorInfo = this.classifyError(error, context);
      this.errorMonitor.log(errorInfo);

      // 根据熔断器状态提供更多信息
      const breakerStats = breaker.getStats();
      this.logger.error(
        `Circuit breaker ${breakerName}: operation failed. State: ${breakerStats.state}, Failures: ${breakerStats.failureCount}`,
        { error: errorInfo, context, breakerStats }
      );

      throw error;
    }
  }

  /**
   * 使用重试机制执行操作
   */
  async executeWithRetry<T>(
    handlerName: string,
    operation: () => Promise<T>,
    context?: FurnaceErrorContext,
    customRetryable?: (error: any) => boolean
  ): Promise<T> {
    const handler = this.retryHandlers.get(handlerName);
    if (!handler) {
      this.logger.warn(`Retry handler not found: ${handlerName}, executing without retry`);
      return operation();
    }

    try {
      return await handler.execute(operation, customRetryable);
    } catch (error) {
      // 分类错误并记录
      const errorInfo = this.classifyError(error, context);
      this.errorMonitor.log(errorInfo);

      this.logger.error(
        `Retry handler ${handlerName}: all attempts failed`,
        { error: errorInfo, context }
      );

      throw error;
    }
  }

  /**
   * 同时使用熔断器和重试机制执行操作
   */
  async executeWithProtection<T>(
    breakerName: string,
    handlerName: string,
    operation: () => Promise<T>,
    context?: FurnaceErrorContext,
    customRetryable?: (error: any) => boolean
  ): Promise<T> {
    const protectedOperation = async () => {
      return this.executeWithRetry(handlerName, operation, context, customRetryable);
    };

    return this.executeWithCircuitBreaker(breakerName, protectedOperation, context);
  }

  /**
   * 分类熔炉特定错误
   */
  private classifyError(error: any, context?: FurnaceErrorContext): ErrorInfo {
    // 基础错误分类
    let errorInfo = ErrorClassifier.classify(error);

    // 添加熔炉特定上下文信息
    errorInfo.context = {
      ...errorInfo.context,
      ...context,
      module: 'furnace'
    };

    // 熔炉特定的错误分类增强
    if (this.isFurnaceConnectionError(error)) {
      errorInfo.category = ErrorCategory.DEVICE;
      errorInfo.severity = ErrorSeverity.HIGH;
      errorInfo.suggested_action = 'Check furnace connection and power supply';
    }

    if (this.isFurnaceProtocolError(error)) {
      errorInfo.category = ErrorCategory.PROTOCOL;
      errorInfo.severity = ErrorSeverity.MEDIUM;
      errorInfo.suggested_action = 'Verify communication protocol and device address';
    }

    if (this.isFurnaceSegmentError(error)) {
      errorInfo.category = ErrorCategory.DEVICE;
      errorInfo.severity = ErrorSeverity.MEDIUM;
      errorInfo.suggested_action = 'Check segment parameters and device status';
    }

    if (this.isFurnaceTemperatureError(error)) {
      errorInfo.category = ErrorCategory.DEVICE;
      errorInfo.severity = ErrorSeverity.MEDIUM;
      errorInfo.suggested_action = 'Verify temperature range and sensor status';
    }

    return errorInfo;
  }

  private isFurnaceConnectionError(error: any): boolean {
    return error.message?.toLowerCase().includes('furnace') &&
           (error.message?.toLowerCase().includes('connect') ||
            error.message?.toLowerCase().includes('disconnect') ||
            error.message?.toLowerCase().includes('port'));
  }

  private isFurnaceProtocolError(error: any): boolean {
    return error.message?.toLowerCase().includes('protocol') ||
           error.message?.toLowerCase().includes('checksum') ||
           error.message?.toLowerCase().includes('frame') ||
           error.code === 'PROTOCOL_ERROR';
  }

  private isFurnaceSegmentError(error: any): boolean {
    return error.message?.toLowerCase().includes('segment') ||
           error.message?.toLowerCase().includes('program') ||
           error.code === 'SEGMENT_ERROR';
  }

  private isFurnaceTemperatureError(error: any): boolean {
    return error.message?.toLowerCase().includes('temperature') ||
           error.message?.toLowerCase().includes('sv') ||
           error.message?.toLowerCase().includes('pv');
  }

  /**
   * 获取错误统计信息
   */
  getErrorStats() {
    return {
      monitor: this.errorMonitor.getErrorStats(),
      circuitBreakers: this.getCircuitBreakerStats(),
      retryHandlers: this.getRetryHandlerStats()
    };
  }

  /**
   * 获取熔断器状态
   */
  getCircuitBreakerStats() {
    const stats: any = {};
    this.circuitBreakers.forEach((breaker, name) => {
      stats[name] = breaker.getStats();
    });
    return stats;
  }

  /**
   * 获取重试处理器信息
   */
  getRetryHandlerStats() {
    const stats: any = {};
    this.retryHandlers.forEach((handler, name) => {
      stats[name] = {
        name,
        created: true
      };
    });
    return stats;
  }

  /**
   * 重置指定的熔断器
   */
  resetCircuitBreaker(name: string): boolean {
    const breaker = this.circuitBreakers.get(name);
    if (breaker) {
      breaker.reset();
      this.logger.log(`Reset circuit breaker: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * 重置所有熔断器
   */
  resetAllCircuitBreakers(): void {
    this.circuitBreakers.forEach((breaker, name) => {
      breaker.reset();
      this.logger.log(`Reset circuit breaker: ${name}`);
    });
  }

  /**
   * 检查熔断器是否开启
   */
  isCircuitBreakerOpen(name: string): boolean {
    const breaker = this.circuitBreakers.get(name);
    return breaker ? breaker.getState() === 'OPEN' : false;
  }

  /**
   * 手动触发熔断器
   */
  tripCircuitBreaker(name: string): boolean {
    const breaker = this.circuitBreakers.get(name);
    if (breaker) {
      // 通过执行一个失败的操作来触发熔断器
      breaker.execute(() => Promise.reject(new Error('Manual trip')));
      this.logger.warn(`Manually tripped circuit breaker: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * 获取最近的错误
   */
  getRecentErrors(timeWindowMs: number = 300000): ErrorInfo[] {
    return this.errorMonitor.getRecentErrors(timeWindowMs);
  }

  /**
   * 清理错误日志
   */
  clearErrorLogs(): void {
    this.errorMonitor.clearErrors();
    this.logger.log('Cleared error logs');
  }

  /**
   * 导出错误数据
   */
  exportErrorData(): ErrorInfo[] {
    return this.errorMonitor.exportErrors();
  }

  /**
   * 设备连接专用的错误处理包装器
   */
  async handleDeviceConnection<T>(
    operation: () => Promise<T>,
    context?: FurnaceErrorContext
  ): Promise<T> {
    return this.executeWithProtection(
      'device_connection',
      'device_connection',
      operation,
      context
    );
  }

  /**
   * 设备操作专用的错误处理包装器
   */
  async handleDeviceOperation<T>(
    operation: () => Promise<T>,
    context?: FurnaceErrorContext
  ): Promise<T> {
    return this.executeWithProtection(
      'device_operation',
      'device_operation',
      operation,
      context
    );
  }

  /**
   * 程序段操作专用的错误处理包装器
   */
  async handleProgramSegmentsOperation<T>(
    operation: () => Promise<T>,
    context?: FurnaceErrorContext
  ): Promise<T> {
    return this.executeWithProtection(
      'program_segments',
      'program_segments',
      operation,
      context
    );
  }
}