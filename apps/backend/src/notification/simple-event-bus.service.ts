import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { ConsoleDisplayManager } from '../common/console-display-manager.service';

export interface EventPayload {
  type: string;
  timestamp: Date;
  context?: any;
  data: any;
}

export interface EventHandler {
  handle(event: EventPayload): Promise<void> | void;
}

@Injectable()
export class SimpleEventBus {
  private readonly logger = new Logger(SimpleEventBus.name);
  private readonly moduleName = 'SimpleEventBus';
  private subjects = new Map<string, Subject<EventPayload>>();
  private handlers = new Map<string, EventHandler[]>();

  constructor(
    private readonly consoleDisplayManager: ConsoleDisplayManager
  ) {}

  /**
   * 发送事件到总线
   * @param eventType 事件类型
   * @param data 事件数据
   * @param context 事件上下文
   */
  emit(eventType: string, data: any, context?: any): void {
    const event: EventPayload = {
      type: eventType,
      timestamp: new Date(),
      data,
      context
    };

    if (this.consoleDisplayManager.shouldDisplayLog(this.moduleName, 'enableDebug')) {
      this.logger.debug(`Emitting event: ${eventType}`, {
        eventType,
        timestamp: event.timestamp,
        hasContext: !!context,
        dataKeys: Object.keys(data || {})
      });
    }

    // 获取或创建Subject
    let subject = this.subjects.get(eventType);
    if (!subject) {
      subject = new Subject<EventPayload>();
      this.subjects.set(eventType, subject);
    }

    // 发送事件
    subject.next(event);

    
    // 同步调用处理器
    this.invokeHandlers(event);
  }

  /**
   * 监听特定类型的事件
   * @param eventType 事件类型
   * @returns 事件流Observable
   */
  on(eventType: string): Observable<EventPayload> {
    let subject = this.subjects.get(eventType);
    if (!subject) {
      subject = new Subject<EventPayload>();
      this.subjects.set(eventType, subject);
    }
    return subject.asObservable();
  }

  /**
   * 注册事件处理器
   * @param eventType 事件类型
   * @param handler 事件处理器
   */
  onEvent(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);

    if (this.consoleDisplayManager.shouldDisplayLog(this.moduleName, 'enableDebug')) {
      this.logger.debug(`Registered handler for event: ${eventType}`, {
        eventType,
        handlerCount: this.handlers.get(eventType)!.length
      });
    }
  }

  /**
   * 注册多个事件处理器
   * @param eventHandlers 事件处理器映射
   */
  onEvents(eventHandlers: Record<string, EventHandler>): void {
    Object.entries(eventHandlers).forEach(([eventType, handler]) => {
      this.onEvent(eventType, handler);
    });
  }

  /**
   * 移除事件处理器
   * @param eventType 事件类型
   * @param handler 事件处理器
   */
  off(eventType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
        if (this.consoleDisplayManager.shouldDisplayLog(this.moduleName, 'enableDebug')) {
          this.logger.debug(`Removed handler for event: ${eventType}`);
        }
      }
    }
  }

  /**
   * 获取所有事件类型
   * @returns 事件类型数组
   */
  getEventTypes(): string[] {
    return Array.from(this.subjects.keys());
  }

  /**
   * 获取事件处理器统计
   * @returns 处理器统计信息
   */
  getHandlerStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    this.handlers.forEach((handlers, eventType) => {
      stats[eventType] = handlers.length;
    });
    return stats;
  }

  /**
   * 销毁事件总线，清理资源
   */
  destroy(): void {
    this.logger.log('Destroying event bus...');

    // 清理所有Subjects
    this.subjects.forEach(subject => {
      subject.complete();
    });
    this.subjects.clear();

    // 清理处理器
    this.handlers.clear();

    this.logger.log('Event bus destroyed');
  }

  /**
   * 调用事件处理器
   * @param event 事件载荷
   */
  private invokeHandlers(event: EventPayload): void {
    const handlers = this.handlers.get(event.type);
    if (!handlers || handlers.length === 0) {
      return;
    }

    if (this.consoleDisplayManager.shouldDisplayLog(this.moduleName, 'enableDebug')) {
      this.logger.debug(`Invoking ${handlers.length} handlers for event: ${event.type}`);
    }

    // 异步调用所有处理器，不等待结果
    handlers.forEach((handler) => {
      try {
        // 修复：检查处理器本身是否是函数（直接方法）
        if (typeof handler === 'function') {
          const result = (handler as Function)(event);
          if (result instanceof Promise) {
            result.catch(error => {
              this.logger.error(`Event handler failed for event ${event.type}:`, error);
            });
          }
        }
        // 检查处理器是否有handle方法（EventHandler对象）- 保持向后兼容
        else if ('handle' in handler && typeof handler.handle === 'function') {
          const result = handler.handle(event);
          if (result instanceof Promise) {
            result.catch(error => {
              this.logger.error(`Event handler failed for event ${event.type}:`, error);
            });
          }
        }
      } catch (error) {
        this.logger.error(`Event handler threw error for event ${event.type}:`, error);
      }
    });
  }
}