import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Subject, Observable, filter, Subscription } from 'rxjs';
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

/**
 * 系统核心事件总线
 * 负责模块间的解耦通信 (Publish/Subscribe Pattern)
 */
@Injectable()
export class EventBus implements OnModuleDestroy {
  private readonly moduleName = 'EventBus';
  
  // 使用单一事件流，轻量高效
  private eventStream$ = new Subject<EventPayload>();
  private subscriptions: Subscription[] = [];

  constructor(private readonly consoleManager: ConsoleDisplayManager) {}

  /**
   * 发布事件 (Publish)
   * @param eventType 事件类型标识 (e.g. 'workflow.started')
   * @param data 业务数据
   * @param context 上下文信息 (可选)
   */
  emit(eventType: string, data: any, context?: any): void {
    // 1. 仅在 Debug 模式下记录日志，避免刷屏
    if (this.consoleManager.shouldDisplayLog(this.moduleName, 'enableDebug')) {
      this.consoleManager.log(this.moduleName, 'enableDebug', `Event: ${eventType}`);
    }

    // 2. 推送事件进入流
    this.eventStream$.next({
      type: eventType,
      timestamp: new Date(),
      data,
      context
    });
  }

  /**
   * 订阅特定事件 (Subscribe)
   * 返回 Observable，允许调用者使用 RxJS 操作符
   */
  on(eventType: string): Observable<EventPayload> {
    return this.eventStream$.asObservable().pipe(
      filter(e => e.type === eventType)
    );
  }

  /**
   * 批量注册处理器 (Registry)
   * 推荐使用此方法，EventBus 会自动管理订阅的销毁，防止内存泄漏
   */
  registerHandlers(handlers: Record<string, (event: EventPayload) => void>): void {
    Object.entries(handlers).forEach(([type, fn]) => {
      const sub = this.on(type).subscribe({
        next: (event) => {
          try {
            fn(event);
          } catch (err) {
            console.error(`[EventBus] Error inside handler for ${type}:`, err);
          }
        },
        error: (err) => console.error(`[EventBus] Stream error on ${type}:`, err)
      });
      this.subscriptions.push(sub);
    });
  }

  /**
   * 兼容单个注册 (Legacy Support)
   */
  registerHandler(eventType: string, handler: any): void {
    const fn = typeof handler === 'function' ? handler : handler.handle.bind(handler);
    this.registerHandlers({ [eventType]: fn });
  }

  /**
   * 销毁时自动清理资源
   */
  onModuleDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];
    this.eventStream$.complete();
    this.consoleManager.log(this.moduleName, 'enableLog', 'EventBus destroyed');
  }
}