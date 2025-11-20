import { Injectable } from '@nestjs/common';
import { EventBus, EventPayload } from './event-bus.service';
import { WorkflowGateway } from '../gateways/workflow.gateway';
import { ConsoleDisplayManager } from '../common/console-display-manager.service';

@Injectable()
export class NotificationEventHandler {
  constructor(
    private readonly eventBus: EventBus,
    private readonly workflowGateway: WorkflowGateway,
    private readonly consoleManager: ConsoleDisplayManager,
  ) {
    this.registerEventHandlers();
  }

  private registerEventHandlers(): void {
    this.eventBus.registerHandlers({
      // 工作流事件
      'workflow.started': this.handleWorkflowStarted.bind(this),
      'workflow.completed': this.handleWorkflowCompleted.bind(this),
      'workflow.failed': this.handleWorkflowFailed.bind(this),
      
      // 节点事件
      'node.started': this.handleNodeStarted.bind(this),
      'node.completed': this.handleNodeCompleted.bind(this),
      'node.failed': this.handleNodeFailed.bind(this),
      'workflow.node.completed': this.handleWorkflowNodeCompleted.bind(this),
      'workflow.node.failed': this.handleWorkflowNodeFailed.bind(this),

      // 测量事件
      'measurement.started': this.handleMeasurementStarted.bind(this),
      'measurement.completed': this.handleMeasurementCompleted.bind(this),
      'measurement.failed': this.handleMeasurementFailed.bind(this),

      // 设备事件
      'device.connected': this.handleDeviceConnected.bind(this),
      'device.disconnected': this.handleDeviceDisconnected.bind(this),
      'device.error': this.handleDeviceError.bind(this),

      // 系统事件
      'system.health_check': this.handleSystemHealthCheck.bind(this),
      'client.connected': this.handleClientConnected.bind(this),
      'client.disconnected': this.handleClientDisconnected.bind(this),
    });
  }

  // --- 具体的处理逻辑保持不变，只负责转发给 Gateway ---

  private async handleWorkflowStarted(event: EventPayload) {
    this.sendNotify('工作流开始', `Started: ${event.data.workflowId}`, 'info', event);
  }

  private async handleWorkflowCompleted(event: EventPayload) {
    const { success, duration } = event.data;
    this.sendNotify(
      '工作流结束', 
      `Success: ${success}, Duration: ${duration}ms`, 
      success ? 'success' : 'warning', 
      event
    );
  }

  private async handleWorkflowFailed(event: EventPayload) {
    this.sendNotify('工作流失败', `Error: ${event.data.error}`, 'error', event);
  }

  // ... Node Handlers ...
  private async handleNodeStarted(event: EventPayload) {
    this.sendNotify('节点开始', `Node: ${event.data.nodeId}`, 'info', event);
  }
  
  private async handleNodeCompleted(event: EventPayload) {
    // 节点完成通常不需要弹窗打扰用户，除非是重要的
    // 这里可以选择不发送 Notification，或者发送 Debug 级别的
  }
  
  private async handleNodeFailed(event: EventPayload) {
    this.sendNotify('节点失败', `Node: ${event.data.nodeId}, Error: ${event.data.error}`, 'error', event);
  }
  
  private async handleWorkflowNodeCompleted(event: EventPayload) {
     // 冗余事件，通常忽略
  }
  
  private async handleWorkflowNodeFailed(event: EventPayload) {
     // 冗余事件，通常忽略，由 handleNodeFailed 处理
  }

  // ... Measurement Handlers ...
  private async handleMeasurementStarted(event: EventPayload) {
    this.sendNotify('测量开始', `Type: ${event.data.measurementType}`, 'info', event);
  }
  
  private async handleMeasurementCompleted(event: EventPayload) {
    this.sendNotify('测量完成', `Type: ${event.data.measurementType}`, 'success', event);
  }
  
  private async handleMeasurementFailed(event: EventPayload) {
    this.sendNotify('测量失败', `Type: ${event.data.measurementType}, Err: ${event.data.error}`, 'error', event);
  }

  // ... Device Handlers ...
  private async handleDeviceConnected(event: EventPayload) {
    this.sendNotify('设备连接', `Device: ${event.data.deviceType}`, 'success', event);
  }
  
  private async handleDeviceDisconnected(event: EventPayload) {
    this.sendNotify('设备断开', `Device: ${event.data.deviceType}`, 'warning', event);
  }
  
  private async handleDeviceError(event: EventPayload) {
    this.sendNotify('设备错误', `Device: ${event.data.deviceType}, Err: ${event.data.error}`, 'error', event);
  }

  // ... System Handlers ...
  private async handleSystemHealthCheck(event: EventPayload) {
      // 健康检查通常不弹窗
  }
  
  private async handleClientConnected(event: EventPayload) {
      // 客户端连接不弹窗
  }
  
  private async handleClientDisconnected(event: EventPayload) {
      // 客户端断开不弹窗
  }

  // 辅助方法：统一构建并广播通知
  private sendNotify(title: string, message: string, type: 'info' | 'success' | 'warning' | 'error', event: EventPayload) {
    const notification = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      title,
      message,
      type,
      source: event.context?.source || 'system',
      timestamp: event.timestamp,
      details: JSON.stringify(event.data)
    };
    this.workflowGateway.broadcast('notification', notification);
    
    // Log error events
    if (type === 'error') {
        this.consoleManager.log('NotificationHandler', 'enableError', `Broadcast Error: ${message}`);
    }
  }
}