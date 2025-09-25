import { Injectable } from '@nestjs/common';
import { SimpleEventBus } from '../../notification/simple-event-bus.service';

@Injectable()
export class ExecutionNotificationService {
  
  constructor(
    private readonly eventBus: SimpleEventBus,
  ) {
    // 监听测量完成事件，自动发送通知
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // ExecutionNotificationService 只提供通知方法，不发送事件
    // 设备通知由 ZahnerZenniumService 发送
    // 节点和工作流通知由 ExecutionService 发送
  }

  
  // 发送执行开始通知
  sendExecutionStartNotification(executionId: string, workflowId: string): void {
    this.eventBus.emit('workflow.started', {
      executionId,
      workflowId,
      timestamp: new Date(),
      context: { source: 'execution-notification-service' }
    });
  }

  // 发送执行完成通知
  sendExecutionCompleteNotification(executionId: string, success: boolean, duration: number, workflowId?: string): void {
    this.eventBus.emit('workflow.completed', {
      executionId,
      workflowId, // 添加workflowId
      success,
      duration,
      timestamp: new Date(),
      context: { source: 'execution-notification-service' }
    });
  }
}