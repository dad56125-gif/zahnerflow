import { Injectable, Logger } from '@nestjs/common';

/**
 * 错误分类枚举
 */
export enum ErrorCategory {
  DEVICE = 'DEVICE',
  TIMEOUT = 'TIMEOUT',
  PROTOCOL = 'PROTOCOL',
  SYSTEM = 'SYSTEM',
}

/**
 * 错误严重程度
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * 错误记录
 */
export interface ErrorRecord {
  id: string;
  timestamp: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  details?: any;
  retryable: boolean;
  context?: Record<string, any>;
  resolved: boolean;
  resolved_at?: string;
}

/**
 * 熔断器状态
 */
export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

/**
 * 熔断器配置
 */
export interface CircuitBreakerConfig {
  failure_threshold: number;
  recovery_timeout: number;
  monitoring_period: number;
}

/**
 * 熔断器信息
 */
export interface CircuitBreakerInfo {
  name: string;
  state: CircuitBreakerState;
  failure_count: number;
  last_failure_time?: string;
  next_attempt_time?: string;
  config: CircuitBreakerConfig;
}

/**
 * MFC错误处理服务
 *
 * 提供错误分类、记录、统计和熔断器功能
 */
@Injectable()
export class MfcErrorHandlerService {
  private readonly logger = new Logger(MfcErrorHandlerService.name);

  // 错误记录存储
  private errorRecords: ErrorRecord[] = [];
  private readonly MAX_ERROR_RECORDS = 1000;

  // 熔断器存储
  private circuitBreakers = new Map<string, {
    state: CircuitBreakerState;
    failure_count: number;
    last_failure_time?: Date;
    next_attempt_time?: Date;
    config: CircuitBreakerConfig;
  }>();

  // 默认熔断器配置
  private readonly DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
    failure_threshold: 5,
    recovery_timeout: 60000, // 1分钟
    monitoring_period: 300000, // 5分钟
  };

  constructor() {
    this.initializeCircuitBreakers();
    this.startPeriodicCleanup();
  }

  // ==================== 错误处理和记录 ====================

  /**
   * 处理错误
   */
  handleError(
    error: any,
    category: ErrorCategory = ErrorCategory.SYSTEM,
    context?: Record<string, any>
  ): ErrorRecord {
    const errorRecord: ErrorRecord = {
      id: this.generateErrorId(),
      timestamp: new Date().toISOString(),
      category,
      severity: this.determineSeverity(error, category),
      message: error.message || error.toString(),
      details: this.extractErrorDetails(error),
      retryable: this.isRetryable(error, category),
      context,
      resolved: false,
    };

    this.addErrorRecord(errorRecord);
    this.updateCircuitBreakers(errorRecord);

    this.logger.error(`MFC Error [${category}]: ${errorRecord.message}`, error);

    return errorRecord;
  }

  /**
   * 标记错误为已解决
   */
  resolveError(errorId: string): boolean {
    const errorRecord = this.errorRecords.find(record => record.id === errorId);
    if (errorRecord) {
      errorRecord.resolved = true;
      errorRecord.resolved_at = new Date().toISOString();
      this.logger.log(`Resolved error: ${errorId}`);
      return true;
    }
    return false;
  }

  // ==================== 错误查询和统计 ====================

  /**
   * 获取错误统计信息
   */
  getErrorStats(): {
    total_errors: number;
    unresolved_errors: number;
    recent_errors_5min: number;
    error_categories: Record<ErrorCategory, number>;
    error_severities: Record<ErrorSeverity, number>;
    last_error_time?: string;
  } {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const recentErrors = this.errorRecords.filter(
      record => new Date(record.timestamp) > fiveMinutesAgo
    );

    const categoryStats: Record<ErrorCategory, number> = {
      [ErrorCategory.DEVICE]: 0,
      [ErrorCategory.TIMEOUT]: 0,
      [ErrorCategory.PROTOCOL]: 0,
      [ErrorCategory.SYSTEM]: 0,
    };

    const severityStats: Record<ErrorSeverity, number> = {
      [ErrorSeverity.LOW]: 0,
      [ErrorSeverity.MEDIUM]: 0,
      [ErrorSeverity.HIGH]: 0,
      [ErrorSeverity.CRITICAL]: 0,
    };

    this.errorRecords.forEach(record => {
      categoryStats[record.category]++;
      severityStats[record.severity]++;
    });

    recentErrors.forEach(record => {
      categoryStats[record.category]++;
      severityStats[record.severity]++;
    });

    return {
      total_errors: this.errorRecords.length,
      unresolved_errors: this.errorRecords.filter(record => !record.resolved).length,
      recent_errors_5min: recentErrors.length,
      error_categories: categoryStats,
      error_severities: severityStats,
      last_error_time: this.errorRecords.length > 0
        ? this.errorRecords[this.errorRecords.length - 1].timestamp
        : undefined,
    };
  }

  /**
   * 获取最近的错误记录
   */
  getRecentErrors(limit: number = 50): ErrorRecord[] {
    return this.errorRecords
      .slice()
      .reverse()
      .slice(0, limit);
  }

  /**
   * 获取特定分类的错误
   */
  getErrorsByCategory(category: ErrorCategory): ErrorRecord[] {
    return this.errorRecords.filter(record => record.category === category);
  }

  /**
   * 导出错误数据
   */
  exportErrors(format: 'json' | 'csv' = 'json'): string {
    const data = this.errorRecords.map(record => ({
      ...record,
      details: JSON.stringify(record.details),
      context: JSON.stringify(record.context),
    }));

    if (format === 'csv') {
      // 简单的CSV导出
      const headers = ['id', 'timestamp', 'category', 'severity', 'message', 'retryable', 'resolved', 'resolved_at'];
      const csvRows = [headers.join(',')];

      data.forEach(record => {
        const row = [
          record.id,
          record.timestamp,
          record.category,
          record.severity,
          `"${record.message.replace(/"/g, '""')}"`,
          record.retryable,
          record.resolved,
          record.resolved_at || '',
        ];
        csvRows.push(row.join(','));
      });

      return csvRows.join('\n');
    }

    return JSON.stringify(data, null, 2);
  }

  /**
   * 清理错误日志
   */
  clearErrors(olderThan?: Date): { cleared_count: number } {
    const cutoffDate = olderThan || new Date(Date.now() - 24 * 60 * 60 * 1000); // 默认清理24小时前的
    const initialCount = this.errorRecords.length;

    this.errorRecords = this.errorRecords.filter(
      record => new Date(record.timestamp) > cutoffDate && !record.resolved
    );

    const clearedCount = initialCount - this.errorRecords.length;
    this.logger.log(`Cleared ${clearedCount} error records`);

    return { cleared_count: clearedCount };
  }

  // ==================== 熔断器管理 ====================

  /**
   * 检查熔断器状态
   */
  checkCircuitBreaker(name: string): { allowed: boolean; state: CircuitBreakerState } {
    const breaker = this.circuitBreakers.get(name);
    if (!breaker) {
      return { allowed: true, state: CircuitBreakerState.CLOSED };
    }

    const now = new Date();

    // 如果熔断器是开启状态，检查是否可以尝试恢复
    if (breaker.state === CircuitBreakerState.OPEN) {
      if (breaker.next_attempt_time && now >= breaker.next_attempt_time) {
        breaker.state = CircuitBreakerState.HALF_OPEN;
        this.logger.log(`Circuit breaker ${name} entering HALF_OPEN state`);
        return { allowed: true, state: CircuitBreakerState.HALF_OPEN };
      }
      return { allowed: false, state: CircuitBreakerState.OPEN };
    }

    return { allowed: true, state: breaker.state };
  }

  /**
   * 记录熔断器成功
   */
  recordCircuitBreakerSuccess(name: string): void {
    const breaker = this.circuitBreakers.get(name);
    if (breaker && breaker.state === CircuitBreakerState.HALF_OPEN) {
      breaker.state = CircuitBreakerState.CLOSED;
      breaker.failure_count = 0;
      this.logger.log(`Circuit breaker ${name} reset to CLOSED state`);
    }
  }

  /**
   * 记录熔断器失败
   */
  recordCircuitBreakerFailure(name: string): void {
    const breaker = this.circuitBreakers.get(name);
    if (!breaker) return;

    breaker.failure_count++;
    breaker.last_failure_time = new Date();

    if (breaker.failure_count >= breaker.config.failure_threshold) {
      breaker.state = CircuitBreakerState.OPEN;
      breaker.next_attempt_time = new Date(
        Date.now() + breaker.config.recovery_timeout
      );
      this.logger.warn(`Circuit breaker ${name} opened due to ${breaker.failure_count} failures`);
    }
  }

  /**
   * 重置熔断器
   */
  resetCircuitBreaker(name: string): { success: boolean; message: string } {
    const breaker = this.circuitBreakers.get(name);
    if (!breaker) {
      return {
        success: false,
        message: `Circuit breaker ${name} not found`,
      };
    }

    breaker.state = CircuitBreakerState.CLOSED;
    breaker.failure_count = 0;
    breaker.last_failure_time = undefined;
    breaker.next_attempt_time = undefined;

    this.logger.log(`Circuit breaker ${name} manually reset`);

    return {
      success: true,
      message: `Circuit breaker ${name} has been reset`,
    };
  }

  /**
   * 重置所有熔断器
   */
  resetAllCircuitBreakers(): { reset_count: number; results: Record<string, any> } {
    const results: Record<string, any> = {};
    let resetCount = 0;

    this.circuitBreakers.forEach((breaker, name) => {
      const result = this.resetCircuitBreaker(name);
      results[name] = result;
      if (result.success) {
        resetCount++;
      }
    });

    return {
      reset_count: resetCount,
      results,
    };
  }

  /**
   * 获取熔断器信息
   */
  getCircuitBreakerInfo(): CircuitBreakerInfo[] {
    const info: CircuitBreakerInfo[] = [];

    this.circuitBreakers.forEach((breaker, name) => {
      info.push({
        name,
        state: breaker.state,
        failure_count: breaker.failure_count,
        last_failure_time: breaker.last_failure_time?.toISOString(),
        next_attempt_time: breaker.next_attempt_time?.toISOString(),
        config: breaker.config,
      });
    });

    return info;
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 初始化熔断器
   */
  private initializeCircuitBreakers(): void {
    const defaultBreakers = [
      'device_connection',
      'device_communication',
      'data_collection',
      'websocket_broadcast',
    ];

    defaultBreakers.forEach(name => {
      this.circuitBreakers.set(name, {
        state: CircuitBreakerState.CLOSED,
        failure_count: 0,
        config: { ...this.DEFAULT_CIRCUIT_BREAKER_CONFIG },
      });
    });

    this.logger.log('Initialized circuit breakers');
  }

  /**
   * 添加错误记录
   */
  private addErrorRecord(record: ErrorRecord): void {
    this.errorRecords.push(record);

    // 限制错误记录数量
    if (this.errorRecords.length > this.MAX_ERROR_RECORDS) {
      // 保留未解决的错误和最近的部分错误
      const unresolved = this.errorRecords.filter(record => !record.resolved);
      const resolved = this.errorRecords
        .filter(record => record.resolved)
        .slice(-this.MAX_ERROR_RECORDS + unresolved.length);

      this.errorRecords = [...unresolved, ...resolved];
    }
  }

  /**
   * 更新熔断器状态
   */
  private updateCircuitBreakers(errorRecord: ErrorRecord): void {
    // 根据错误分类和严重程度更新相关熔断器
    let breakerName = 'system';

    switch (errorRecord.category) {
      case ErrorCategory.DEVICE:
        breakerName = 'device_connection';
        break;
      case ErrorCategory.TIMEOUT:
      case ErrorCategory.PROTOCOL:
        breakerName = 'device_communication';
        break;
      case ErrorCategory.SYSTEM:
        breakerName = 'system';
        break;
    }

    this.recordCircuitBreakerFailure(breakerName);
  }

  /**
   * 确定错误严重程度
   */
  private determineSeverity(error: any, category: ErrorCategory): ErrorSeverity {
    // 基于错误类型和分类确定严重程度
    if (category === ErrorCategory.DEVICE) {
      return ErrorSeverity.HIGH;
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return ErrorSeverity.MEDIUM;
    }

    if (error.name === 'CriticalError' || error.status >= 500) {
      return ErrorSeverity.CRITICAL;
    }

    return ErrorSeverity.LOW;
  }

  /**
   * 提取错误详情
   */
  private extractErrorDetails(error: any): any {
    return {
      name: error.name,
      code: error.code,
      status: error.status,
      stack: error.stack,
      response: error.response?.data,
    };
  }

  /**
   * 判断错误是否可重试
   */
  private isRetryable(error: any, category: ErrorCategory): boolean {
    // 超时和网络错误通常可重试
    if (category === ErrorCategory.TIMEOUT) {
      return true;
    }

    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      return true;
    }

    // 协议错误和设备错误通常不可重试
    if (category === ErrorCategory.DEVICE || category === ErrorCategory.PROTOCOL) {
      return false;
    }

    return false;
  }

  /**
   * 生成错误ID
   */
  private generateErrorId(): string {
    return `mfc_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 启动定期清理任务
   */
  private startPeriodicCleanup(): void {
    // 每小时清理一次旧的错误记录
    setInterval(() => {
      this.clearErrors(new Date(Date.now() - 24 * 60 * 60 * 1000)); // 清理24小时前的已解决错误
    }, 60 * 60 * 1000);

    this.logger.log('Started periodic error cleanup task');
  }
}