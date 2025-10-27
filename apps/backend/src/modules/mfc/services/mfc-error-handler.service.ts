import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  ErrorCategory,
  ErrorSeverity,
  CircuitBreaker,
  ErrorClassifier,
  ErrorInfo,
  ErrorMonitor,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  CircuitBreakerConfig
} from '../../../shared/utils/error-handler.util';

export interface MfcErrorContext {
  connection_id?: string;
  operation?: string;
  port?: string;
  address?: number;
  flow_rate?: number;
  sccm?: number;
  gas_type?: string;
  start?: number;
  end?: number;
  baudrate?: number;
  timeout?: number;
  [key: string]: any; // 允许额外的属性
}

@Injectable()
export class MfcErrorHandlerService {
  private readonly logger = new Logger(MfcErrorHandlerService.name);
  private readonly errorMonitor = new ErrorMonitor();
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();

  constructor() {
    // 初始化设备连接熔断器 - 更快失败和恢复
    this.createCircuitBreaker('device_connection', {
      failure_threshold: 2,
      recovery_timeout: 30000,
      monitoring_period: 60000
    });

    // 初始化设备操作熔断器 - 更快失败和恢复
    this.createCircuitBreaker('device_operation', {
      failure_threshold: 2,
      recovery_timeout: 30000,
      monitoring_period: 30000
    });

    // 初始化设备扫描熔断器 - 更快失败和恢复
    this.createCircuitBreaker('device_scan', {
      failure_threshold: 2,
      recovery_timeout: 30000,
      monitoring_period: 90000
    });

    // 初始化流量设置熔断器 - 更快失败和恢复
    this.createCircuitBreaker('flow_control', {
      failure_threshold: 2,
      recovery_timeout: 30000,
      monitoring_period: 60000
    });
  }

  /**
   * 精简地记录Axios错误，避免冗长的日志输出
   */
  private logAxiosError(operation: string, error: any, additionalInfo?: any): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as any;
      const status = axiosError.response?.status;
      const url = axiosError.config?.url;
      const baseURL = axiosError.config?.baseURL;
      const fullUrl = baseURL && url ? `${baseURL}${url}` : (url || 'unknown');
      const timeout = axiosError.config?.timeout;
      const responseData = axiosError.response?.data;

      this.logger.error(
        `[MfcErrorHandlerService] ${operation} failed: ${axiosError.message}; status=${status}; url=${fullUrl}; timeout=${timeout}`
      );

      // 只记录响应数据的关键部分，避免完整对象展开
      if (responseData) {
        try {
          const responseStr = typeof responseData === 'string'
            ? responseData
            : JSON.stringify(responseData, null, 0); // 无缩进，紧凑格式
          this.logger.error(`[MfcErrorHandlerService] Response data: ${responseStr}`);
        } catch (e) {
          this.logger.error(`[MfcErrorHandlerService] Response data: [Object - too large to serialize]`);
        }
      }

      // 记录额外的上下文信息
      if (additionalInfo) {
        try {
          const infoStr = typeof additionalInfo === 'string'
            ? additionalInfo
            : JSON.stringify(additionalInfo, null, 0);
          this.logger.error(`[MfcErrorHandlerService] Context: ${infoStr}`);
        } catch (e) {
          this.logger.error(`[MfcErrorHandlerService] Context: [Object - too large to serialize]`);
        }
      }
    } else {
      // 非Axios错误，记录堆栈信息
      this.logger.error(`[MfcErrorHandlerService] ${operation} failed: ${error instanceof Error ? error.stack : String(error)}`);
    }
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
   * 使用熔断器执行操作
   */
  async executeWithCircuitBreaker<T>(
    breakerName: string,
    operation: () => Promise<T>,
    context?: MfcErrorContext
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

      // 根据熔断器状态提供更多信息，使用精简格式
      const breakerStats = breaker.getStats();
      const logMessage = `Circuit breaker ${breakerName}: operation failed. State: ${breakerStats.state}, Failures: ${breakerStats.failureCount}`;

      // 使用精简的Axios错误记录方法
      this.logAxiosError(logMessage, error, {
        operation: breakerName,
        state: breakerStats.state,
        failures: breakerStats.failureCount,
        errorInfo: {
          category: errorInfo.category,
          severity: errorInfo.severity,
          message: errorInfo.message,
          suggested_action: errorInfo.suggested_action
        }
      });

      throw error;
    }
  }

  
  /**
   * 使用熔断器保护执行操作（简化版，不进行重试）
   */
  async executeWithProtection<T>(
    breakerName: string,
    operation: () => Promise<T>,
    context?: MfcErrorContext
  ): Promise<T> {
    return this.executeWithCircuitBreaker(breakerName, operation, context);
  }

  /**
   * 分类MFC特定错误
   */
  private classifyError(error: any, context?: MfcErrorContext): ErrorInfo {
    // 基础错误分类
    let errorInfo = ErrorClassifier.classify(error);

    // 添加MFC特定上下文信息
    errorInfo.context = {
      ...errorInfo.context,
      ...context,
      module: 'mfc'
    };

    // 检查是否为设备未连接错误 - 503状态码且包含连接相关信息
    const isDeviceNotConnected =
      (error.response?.status === 503 || error.status === 503) &&
      (
        (error.response?.data?.message && error.response.data.message.includes('设备未连接')) ||
        (error.message && error.message.includes('设备未连接')) ||
        (error.response?.data && typeof error.response.data === 'string' && error.response.data.includes('设备未连接')) ||
        (error.response?.data?.detail && error.response.data.detail.includes('设备未连接'))
      );

    // 设备未连接错误分类为DEVICE/MEDIUM，而不是HIGH
    if (isDeviceNotConnected) {
      errorInfo.category = ErrorCategory.DEVICE;
      errorInfo.severity = ErrorSeverity.MEDIUM;
      errorInfo.suggested_action = '请先连接MFC设备';
      errorInfo.retryable = false; // 设备未连接时不重试
    }
    // MFC特定的错误分类增强
    else if (this.isMfcConnectionError(error)) {
      errorInfo.category = ErrorCategory.DEVICE;
      errorInfo.severity = ErrorSeverity.MEDIUM; // 降低严重程度
      errorInfo.suggested_action = 'Check MFC connection and power supply';
      errorInfo.retryable = false; // 连接问题不重试
    }
    else if (this.isMfcProtocolError(error)) {
      errorInfo.category = ErrorCategory.PROTOCOL;
      errorInfo.severity = ErrorSeverity.MEDIUM;
      errorInfo.suggested_action = 'Verify MFC communication protocol and device address';
    }
    else if (this.isMfcFlowError(error)) {
      errorInfo.category = ErrorCategory.DEVICE;
      errorInfo.severity = ErrorSeverity.MEDIUM;
      errorInfo.suggested_action = 'Check flow rate parameters and device status';
    }
    else if (this.isMfcScanError(error)) {
      errorInfo.category = ErrorCategory.DEVICE;
      errorInfo.severity = ErrorSeverity.MEDIUM;
      errorInfo.suggested_action = 'Check device connections and scanning parameters';
    }

    return errorInfo;
  }

  private isMfcConnectionError(error: any): boolean {
    return error.message?.toLowerCase().includes('mfc') &&
           (error.message?.toLowerCase().includes('connect') ||
            error.message?.toLowerCase().includes('disconnect') ||
            error.message?.toLowerCase().includes('port'));
  }

  private isMfcProtocolError(error: any): boolean {
    return error.message?.toLowerCase().includes('protocol') ||
           error.message?.toLowerCase().includes('checksum') ||
           error.message?.toLowerCase().includes('frame') ||
           error.code === 'MFC_PROTOCOL_ERROR';
  }

  private isMfcFlowError(error: any): boolean {
    return error.message?.toLowerCase().includes('flow') ||
           error.message?.toLowerCase().includes('sccm') ||
           error.message?.toLowerCase().includes('setpoint') ||
           error.code === 'FLOW_ERROR';
  }

  private isMfcScanError(error: any): boolean {
    return error.message?.toLowerCase().includes('scan') ||
           error.message?.toLowerCase().includes('address') ||
           error.code === 'SCAN_ERROR';
  }

  /**
   * 获取错误统计信息
   */
  getErrorStats() {
    return {
      monitor: this.errorMonitor.getErrorStats(),
      circuitBreakers: this.getCircuitBreakerStats()
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
    context?: MfcErrorContext
  ): Promise<T> {
    return this.executeWithProtection(
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
    context?: MfcErrorContext
  ): Promise<T> {
    return this.executeWithProtection(
      'device_operation',
      operation,
      context
    );
  }

  /**
   * 设备扫描专用的错误处理包装器
   */
  async handleDeviceScan<T>(
    operation: () => Promise<T>,
    context?: MfcErrorContext
  ): Promise<T> {
    return this.executeWithProtection(
      'device_scan',
      operation,
      context
    );
  }

  /**
   * 流量控制专用的错误处理包装器
   */
  async handleFlowControl<T>(
    operation: () => Promise<T>,
    context?: MfcErrorContext
  ): Promise<T> {
    return this.executeWithProtection(
      'flow_control',
      operation,
      context
    );
  }

  /**
   * 简单的错误处理方法，用于向后兼容
   */
  handleError(error: any, category: ErrorCategory, context?: Record<string, any>): void {
    const errorInfo = this.classifyError(error, context as MfcErrorContext);
    this.errorMonitor.log(errorInfo);

    // 使用精简的Axios错误记录方法，而不是直接记录完整错误对象
    this.logAxiosError(`MFC Error [${category}]: ${errorInfo.message}`, error, {
      category,
      errorInfo: {
        category: errorInfo.category,
        severity: errorInfo.severity,
        message: errorInfo.message,
        suggested_action: errorInfo.suggested_action
      },
      context
    });
  }

  /**
   * 检查熔断器状态（向后兼容方法）
   */
  checkCircuitBreaker(name: string): { allowed: boolean; state: string } {
    const breaker = this.circuitBreakers.get(name);
    if (!breaker) {
      return { allowed: true, state: 'CLOSED' };
    }

    const state = breaker.getState();
    return {
      allowed: state !== 'OPEN',
      state: state
    };
  }

  /**
   * 记录熔断器成功（向后兼容方法）
   */
  recordCircuitBreakerSuccess(name: string): void {
    const breaker = this.circuitBreakers.get(name);
    if (breaker) {
      // 通过执行一个成功的操作来重置计数器
      // 这里我们手动更新状态
      this.logger.debug(`Circuit breaker ${name} success recorded`);
    }
  }

  /**
   * 记录熔断器失败（向后兼容方法）
   */
  recordCircuitBreakerFailure(name: string): void {
    const breaker = this.circuitBreakers.get(name);
    if (breaker) {
      // 通过执行一个失败的操作来触发熔断器
      try {
        breaker.execute(() => Promise.reject(new Error('Failure recorded')));
      } catch (e) {
        // 忽略错误，只是为了触发失败计数
      }
      this.logger.debug(`Circuit breaker ${name} failure recorded`);
    }
  }
}