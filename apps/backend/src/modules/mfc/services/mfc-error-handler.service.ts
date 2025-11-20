import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  ErrorCategory,
  ErrorSeverity,
  ErrorClassifier,
  ErrorInfo,
  ErrorMonitor,
} from '../../../shared/utils/error-handler.util';

export interface MfcErrorContext {
  operation?: string;
  port?: string;
  address?: number;
  [key: string]: any;
}

@Injectable()
export class MfcErrorHandlerService {
  private readonly logger = new Logger(MfcErrorHandlerService.name);
  private readonly errorMonitor = new ErrorMonitor();

  /**
   * 统一执行包装器 - 替代原有的熔断器逻辑
   * 现在只做简单的 Try-Catch 和日志记录，不再拦截请求
   */
  private async executeWithProtection<T>(
    operationName: string,
    operation: () => Promise<T>,
    context?: MfcErrorContext
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      // 记录错误
      this.handleError(error, ErrorCategory.DEVICE, { ...context, operation: operationName });
      throw error;
    }
  }

  // ==================== 专用处理包装器 ====================

  async handleDeviceConnection<T>(op: () => Promise<T>, ctx?: MfcErrorContext): Promise<T> {
    return this.executeWithProtection('device_connection', op, ctx);
  }

  async handleDeviceOperation<T>(op: () => Promise<T>, ctx?: MfcErrorContext): Promise<T> {
    return this.executeWithProtection('device_operation', op, ctx);
  }

  async handleDeviceScan<T>(op: () => Promise<T>, ctx?: MfcErrorContext): Promise<T> {
    return this.executeWithProtection('device_scan', op, ctx);
  }

  async handleFlowControl<T>(op: () => Promise<T>, ctx?: MfcErrorContext): Promise<T> {
    return this.executeWithProtection('flow_control', op, ctx);
  }

  // ==================== 错误记录与分类 ====================

  /**
   * 核心错误处理逻辑
   */
  handleError(error: any, category: ErrorCategory, context?: Record<string, any>): void {
    // 1. 分类错误
    const errorInfo = this.classifyError(error, context);
    
    // 2. 记录到内存监视器（用于前端展示）
    this.errorMonitor.log(errorInfo);

    // 3. 打印精简日志到控制台
    const msg = error instanceof Error ? error.message : String(error);
    const operation = context?.operation || 'unknown';
    
    // 区分 Axios 错误和普通错误，避免日志刷屏
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const url = error.config?.url;
      this.logger.error(`[${operation}] HTTP Error ${status} at ${url}: ${msg}`);
    } else {
      this.logger.error(`[${operation}] Error: ${msg}`);
    }
  }

  private classifyError(error: any, context?: any): ErrorInfo {
    // 简化版的错误分类，保留核心逻辑
    let info = ErrorClassifier.classify(error);
    info.context = { ...info.context, ...context, module: 'mfc' };

    // 识别设备连接问题
    if (this.isConnectionError(error)) {
      info.category = ErrorCategory.DEVICE;
      info.severity = ErrorSeverity.MEDIUM;
      info.suggested_action = '请检查设备电源和串口连接';
    }

    return info;
  }

  private isConnectionError(error: any): boolean {
    const msg = (error.message || '').toLowerCase();
    return msg.includes('connect') || msg.includes('timeout') || msg.includes('network');
  }

  // ==================== 统计与数据接口 ====================

  getErrorStats() {
    return {
      monitor: this.errorMonitor.getErrorStats(),
      circuitBreakers: {} // 保持接口兼容，返回空对象
    };
  }

  getRecentErrors() {
    // 修复：添加默认时间窗口参数 (5分钟)
    return this.errorMonitor.getRecentErrors(300000);
  }

  clearErrorLogs(): void {
    this.errorMonitor.clearErrors();
    this.logger.log('Cleared error logs');
  }

  exportErrorData() {
    return this.errorMonitor.exportErrors();
  }

  // ==================== 兼容性空方法 (保留以防报错) ====================
  
  checkCircuitBreaker(name: string) { return { allowed: true, state: 'CLOSED' }; }
  recordCircuitBreakerSuccess(name: string) {}
  recordCircuitBreakerFailure(name: string) {}
  resetCircuitBreaker(name: string) { return true; }
  resetAllCircuitBreakers() {}
}