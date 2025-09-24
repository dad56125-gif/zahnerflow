import { Injectable } from '@nestjs/common';
import {
  NotificationMessage,
  UserNotificationLevel,
  DebugNotificationLevel,
  NotificationLevel
} from '@zahnerflow/types';

@Injectable()
export class NotificationService {
  private readonly enableStackTrace: boolean;
  private readonly cacheEnabled: boolean;
  private readonly isProduction: boolean;
  private callerInfoCache = new Map<string, { sourceFile: string; sourceFunction: string }>();
  private cacheHitCount = 0;
  private cacheMissCount = 0;

  constructor() {
    this.enableStackTrace = process.env.NOTIFICATION_STACK_TRACE !== 'false';
    this.cacheEnabled = process.env.NOTIFICATION_CACHE_ENABLED !== 'false';
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  // 核心通知方法
  notify(message: string, level: UserNotificationLevel | DebugNotificationLevel, details?: string): void {
    const callerInfo = this.getCallerInfoOptimized();
    const notification: NotificationMessage = {
      type: this.mapLevelToType(level),
      message,
      sourceFile: callerInfo.sourceFile,
      sourceFunction: callerInfo.sourceFunction,
      details,
      timestamp: new Date(),
      executionId: this.generateExecutionId(),
      level,
      layerTrace: '[E]'
    };

    this.forwardNotification(notification);
  }

  // 外部通知方法（允许指定source信息）
  notifyExternal(
    message: string,
    level: UserNotificationLevel | DebugNotificationLevel,
    details?: string,
    sourceFile?: string,
    sourceFunction?: string
  ): void {
    const notification: NotificationMessage = {
      type: this.mapLevelToType(level),
      message,
      sourceFile: sourceFile || 'external',
      sourceFunction: sourceFunction || 'external',
      details,
      timestamp: new Date(),
      executionId: this.generateExecutionId(),
      level,
      layerTrace: '[E]'
    };

    this.forwardNotification(notification);
  }

  // 用户级通知方法
  notifySystem(message: string, details?: string): void {
    this.notify(message, UserNotificationLevel.SYSTEM, details);
  }

  notifyWorkflow(message: string, details?: string): void {
    this.notify(message, UserNotificationLevel.WORKFLOW, details);
  }

  notifyDevice(message: string, details?: string): void {
    this.notify(message, UserNotificationLevel.DEVICE, details);
  }

  notifyOperation(message: string, details?: string): void {
    this.notify(message, UserNotificationLevel.OPERATION, details);
  }

  notifyError(message: string, details?: string): void {
    this.notify(message, UserNotificationLevel.ERROR, details);
  }

  // 调试级通知方法
  notifyExecutionDetail(message: string, details?: string): void {
    this.notify(message, DebugNotificationLevel.EXECUTION_DETAIL, details);
  }

  notifyStateChange(message: string, details?: string): void {
    this.notify(message, DebugNotificationLevel.STATE_CHANGE, details);
  }

  notifyNetwork(message: string, details?: string): void {
    this.notify(message, DebugNotificationLevel.NETWORK, details);
  }

  notifyPerformance(message: string, details?: string): void {
    this.notify(message, DebugNotificationLevel.PERFORMANCE, details);
  }

  notifyInternal(message: string, details?: string): void {
    this.notify(message, DebugNotificationLevel.INTERNAL, details);
  }

  // 高性能调用信息获取
  private getCallerInfoOptimized(): { sourceFile: string; sourceFunction: string } {
    if (this.isProduction) {
      return { sourceFile: 'production', sourceFunction: 'production' };
    }

    if (!this.enableStackTrace) {
      return { sourceFile: 'disabled', sourceFunction: 'disabled' };
    }

    if (this.cacheEnabled) {
      return this.getCallerInfoWithCache();
    }

    return this.getCallerInfoLazy();
  }

  // 带缓存的调用信息获取
  private getCallerInfoWithCache(): { sourceFile: string; sourceFunction: string } {
    const stack = new Error().stack;
    if (!stack) {
      return { sourceFile: 'unknown', sourceFunction: 'unknown' };
    }

    const cacheKey = stack;
    if (this.callerInfoCache.has(cacheKey)) {
      this.cacheHitCount++;
      return this.callerInfoCache.get(cacheKey)!;
    }

    this.cacheMissCount++;
    const callerInfo = this.getCallerInfoLazy();

    // 限制缓存大小
    if (this.callerInfoCache.size >= 500) {
      const firstKey = this.callerInfoCache.keys().next().value;
      this.callerInfoCache.delete(firstKey);
    }

    this.callerInfoCache.set(cacheKey, callerInfo);
    return callerInfo;
  }

  // 懒加载调用信息获取
  private getCallerInfoLazy(): { sourceFile: string; sourceFunction: string } {
    const stack = new Error().stack;
    if (!stack) {
      return { sourceFile: 'unknown', sourceFunction: 'unknown' };
    }

    const stackLines = stack.split('\n');

    // 跳过前几行（Error构造函数和当前函数链）
    // 然后跳过NotificationService内部的所有调用
    let foundNotificationService = false;

    for (let i = 3; i < stackLines.length; i++) {
      const line = stackLines[i].trim();

      if (!line || line.includes('node_modules')) {
        continue;
      }

      // 检查是否包含NotificationService的路径
      if (line.includes('notification.service.ts') || line.includes('NotificationService')) {
        foundNotificationService = true;
        continue;
      }

      // 如果已经找到了NotificationService，现在找的就是真正的调用者
      if (foundNotificationService) {
        return this.parseStackLine(line);
      }
    }

    return { sourceFile: 'unknown', sourceFunction: 'unknown' };
  }

  // 解析堆栈行
  private parseStackLine(line: string): { sourceFile: string; sourceFunction: string } {
    // 格式1: at functionName (file_path:line:column)
    const match = line.match(/at\s+(.+?)\s+\((.+?):\d+:\d+\)/);
    if (match) {
      return {
        sourceFunction: match[1],
        sourceFile: this.extractFileName(match[2])
      };
    }

    // 格式2: at file_path:line:column (匿名函数)
    const match2 = line.match(/at\s+(.+?):\d+:\d+/);
    if (match2) {
      return {
        sourceFunction: 'anonymous',
        sourceFile: this.extractFileName(match2[1])
      };
    }

    return { sourceFile: 'unknown', sourceFunction: 'unknown' };
  }

  // 从完整路径中提取文件名
  private extractFileName(path: string): string {
    // 处理Windows路径和Unix路径
    const normalizedPath = path.replace(/\\/g, '/');
    const parts = normalizedPath.split('/');
    return parts[parts.length - 1] || path;
  }

  // 映射级别到类型
  private mapLevelToType(level: NotificationLevel): 'info' | 'success' | 'warning' | 'error' {
    if (level === UserNotificationLevel.ERROR) {
      return 'error';
    }
    if (level === DebugNotificationLevel.EXECUTION_DETAIL || level === DebugNotificationLevel.INTERNAL) {
      return 'info';
    }
    if (level === DebugNotificationLevel.PERFORMANCE) {
      return 'warning';
    }
    return 'info';
  }

  // 转发通知
  private forwardNotification(notification: NotificationMessage): void {
    const forwardedNotification = {
      ...notification,
      layerTrace: `${notification.layerTrace}[F]`
    };

    // 控制台输出
    if (process.env.NOTIFICATION_CONSOLE_OUTPUT !== 'false') {
      this.logToConsole(forwardedNotification);
    }

    // 发送到前端
    if (process.env.NOTIFICATION_PANEL_OUTPUT !== 'false') {
      this.sendToFrontend(forwardedNotification);
    }
  }

  // 控制台输出
  private logToConsole(notification: NotificationMessage): void {
    const timestamp = notification.timestamp.toISOString();
    const prefix = `[${notification.layerTrace}] ${timestamp}`;
    const message = `${prefix} - ${notification.message}`;

    switch (notification.type) {
      case 'error':
        console.error(message, notification.details || '');
        break;
      case 'warning':
        console.warn(message, notification.details || '');
        break;
      case 'success':
        console.log(`\x1b[32m${message}\x1b[0m`, notification.details || '');
        break;
      default:
        console.log(message, notification.details || '');
    }
  }

  // 发送到前端
  private sendToFrontend(notification: NotificationMessage): void {
    const frontendNotification = {
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: this.getNotificationTitle(notification.type),
      message: notification.message,
      type: notification.type,
      source: `${notification.sourceFile}:${notification.sourceFunction}`,
      timestamp: notification.timestamp,
      layerTrace: notification.layerTrace,
      details: notification.details,
      level: notification.level
    };

    // 通过事件总线发送通知，而不是直接调用gateway
    // 这将由NotificationEventHandler处理并转发到WebSocket
    console.log('Notification sent via event bus:', frontendNotification);
  }

  // 获取通知标题
  private getNotificationTitle(type: 'info' | 'success' | 'warning' | 'error'): string {
    switch (type) {
      case 'info': return '信息';
      case 'success': return '成功';
      case 'warning': return '警告';
      case 'error': return '错误';
      default: return '通知';
    }
  }

  // 生成执行ID
  private generateExecutionId(): string {
    return `E${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // 获取缓存统计
  getCacheStats(): {
    cacheSize: number;
    cacheHitCount: number;
    cacheMissCount: number;
    cacheHitRate: number;
  } {
    const total = this.cacheHitCount + this.cacheMissCount;
    const hitRate = total > 0 ? (this.cacheHitCount / total) * 100 : 0;

    return {
      cacheSize: this.callerInfoCache.size,
      cacheHitCount: this.cacheHitCount,
      cacheMissCount: this.cacheMissCount,
      cacheHitRate: hitRate
    };
  }
}