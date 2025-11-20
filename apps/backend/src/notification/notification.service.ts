import { Injectable } from '@nestjs/common';
import { NotificationMessage, UserNotificationLevel, DebugNotificationLevel } from '@zahnerflow/types';
import { EventBus } from './event-bus.service';

@Injectable()
export class NotificationService {
  constructor(private readonly eventBus: EventBus) {}

  /**
   * 发送系统通知的核心方法
   * @param message 消息内容
   * @param level 通知级别
   * @param details 详细信息 (可选)
   * @param source 来源标识 (默认 'system')
   */
  notify(
    message: string, 
    level: UserNotificationLevel | DebugNotificationLevel, 
    details?: string, 
    source: string = 'system'
  ): void {
    const notification: NotificationMessage = {
      type: this.mapLevelToType(level),
      message,
      sourceFile: source,
      sourceFunction: '-', // 不再进行耗性能的堆栈分析
      details,
      timestamp: new Date(),
      level,
      layerTrace: '[S]', // Service Layer
      executionId: ''
    };

    this.forwardNotification(notification);
  }

  private forwardNotification(notification: NotificationMessage): void {
    // 1. 控制台输出 (可选，基于环境变量)
    if (process.env.NOTIFICATION_CONSOLE_OUTPUT !== 'false') {
      this.logToConsole(notification);
    }

    // 2. 这里的逻辑是通过 EventBus 触发 NotificationHandler 去广播 WebSocket
    // 但实际上，NotificationHandler 主要是监听业务事件 (workflow.started 等)。
    // 如果你想通过 NotificationService 直接发 WebSocket 弹窗，
    // 可以在这里 emit 一个特定的 'system.notification' 事件。
    // 暂时保持简单日志输出。
  }

  private logToConsole(n: NotificationMessage): void {
    const time = n.timestamp.toISOString().split('T')[1].split('.')[0];
    const prefix = `[Notify][${time}]`;
    
    switch (n.type) {
      case 'error':
        console.error(`\x1b[31m${prefix} ❌ ${n.message}\x1b[0m`, n.details || '');
        break;
      case 'warning':
        console.warn(`\x1b[33m${prefix} ⚠️ ${n.message}\x1b[0m`, n.details || '');
        break;
      case 'success':
        console.log(`\x1b[32m${prefix} ✅ ${n.message}\x1b[0m`, n.details || '');
        break;
      default:
        console.log(`${prefix} ℹ️ ${n.message}`, n.details || '');
    }
  }

  private mapLevelToType(level: any): 'info' | 'success' | 'warning' | 'error' {
    if (level === UserNotificationLevel.ERROR) return 'error';
    if (level === UserNotificationLevel.SYSTEM) return 'warning';
    if (level === DebugNotificationLevel.PERFORMANCE) return 'warning';
    return 'info';
  }

  // --- 快捷辅助方法 ---

  notifySystem(msg: string, dt?: string) { this.notify(msg, UserNotificationLevel.SYSTEM, dt); }
  notifyError(msg: string, dt?: string) { this.notify(msg, UserNotificationLevel.ERROR, dt); }
  notifyWorkflow(msg: string, dt?: string) { this.notify(msg, UserNotificationLevel.WORKFLOW, dt, 'workflow'); }
}