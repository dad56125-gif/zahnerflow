import { Injectable } from '@nestjs/common';
import { SimpleEventBus, EventPayload, EventHandler } from '../simple-event-bus.service';
import { WorkflowGateway } from '../../gateways/workflow.gateway';
import { ConsoleDisplayManager } from '../../common/console-display-manager.service';

@Injectable()
export class NotificationEventHandler implements EventHandler {
  constructor(
    private readonly eventBus: SimpleEventBus,
    private readonly workflowGateway: WorkflowGateway,
    private readonly consoleManager: ConsoleDisplayManager,
  ) {
    // 注册事件处理器
    this.registerEventHandlers();
      }

  /**
   * 注册事件处理器
   */
  private registerEventHandlers(): void {
    // 修复：使用正确的 EventHandler 接口实现方式
    // 避免重复注册，先清理可能存在的旧处理器
    this.cleanupEventHandlers();

    // 作为 EventHandler 对象注册自己
    const supportedEventTypes = [
      'workflow.started', 'workflow.completed', 'workflow.failed',
      'workflow.node.completed', 'workflow.node.failed',
      'node.started', 'node.completed', 'node.failed',
      'device.connected', 'device.disconnected', 'device.error',
      'measurement.started', 'measurement.completed', 'measurement.failed',
      'system.health_check', 'client.connected', 'client.disconnected',
      'workflow.created', 'workflow.updated', 'workflow.deleted'
    ];

    supportedEventTypes.forEach(eventType => {
      this.eventBus.onEvent(eventType, this);
    });
  }

  /**
   * 清理事件处理器 - 避免重复注册
   */
  private cleanupEventHandlers(): void {
    const supportedEventTypes = [
      'workflow.started', 'workflow.completed', 'workflow.failed',
      'workflow.node.completed', 'workflow.node.failed',
      'node.started', 'node.completed', 'node.failed',
      'device.connected', 'device.disconnected', 'device.error',
      'measurement.started', 'measurement.completed', 'measurement.failed',
      'system.health_check', 'client.connected', 'client.disconnected',
      'workflow.created', 'workflow.updated', 'workflow.deleted'
    ];

    supportedEventTypes.forEach(eventType => {
      // 移除旧的处理器（包括可能存在的重复处理器）
      this.eventBus.off(eventType, this);
    });
  }

  /**
   * 处理事件
   */
  async handle(event: EventPayload): Promise<void> {
    // ConsoleDisplayManager 日志 - 根据事件类型选择日志级别
    const logLevel = event.type.includes('.failed') ? 'enableError' : 'enableLog';

    this.consoleManager.log('NotificationEventHandler', logLevel, `🎯 接收到事件: ${event.type}`, {
      eventType: event.type,
      timestamp: event.timestamp,
      context: event.context
    });

    try {
      // ConsoleDisplayManager 日志 - 根据事件类型选择日志级别
      const debugLevel = event.type.includes('.failed') ? 'enableError' : 'enableDebug';

      this.consoleManager.log('NotificationEventHandler', debugLevel, `处理事件: ${event.type}`, {
        eventType: event.type,
        timestamp: event.timestamp,
        context: event.context
      });

      // 根据事件类型调用对应的处理方法
      const methodName = `handle${event.type.split('.').map(part =>
        part.charAt(0).toUpperCase() + part.slice(1)
      ).join('')}`;

      if (typeof (this as any)[methodName] === 'function') {
        await (this as any)[methodName](event);
      } else {
        this.consoleManager.log('NotificationEventHandler', 'enableWarn', `未找到事件处理器: ${event.type}`);
      }
    } catch (error) {
      this.consoleManager.log('NotificationEventHandler', 'enableError', `处理事件失败: ${event.type}`, error);
    }
  }

  // 工作流事件处理
  private async handleWorkflowStarted(event: EventPayload): Promise<void> {
    const { executionId, workflowId, context } = event.data;
    const notification = {
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: '工作流执行开始',
      message: `Workflow execution started: ${workflowId}`,
      type: 'info' as const,
      source: context?.source || 'execution-service',
      timestamp: new Date(),
      details: `Execution ID: ${executionId}, Source: ${context?.source || 'unknown'}`
    };
    this.workflowGateway.broadcast('notification', notification);
  }

  private async handleWorkflowCompleted(event: EventPayload): Promise<void> {
    const { executionId, workflowId, success, duration, context } = event.data;
    const notification = {
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: '工作流执行完成',
      message: `Workflow execution ${success ? 'completed' : 'finished'}: ${workflowId}`,
      type: success ? 'success' : 'info' as const,
      source: context?.source || 'execution-service',
      timestamp: new Date(),
      details: `Execution ID: ${executionId}, Duration: ${duration}ms, Success: ${success}, Source: ${context?.source || 'unknown'}`
    };
    this.workflowGateway.broadcast('notification', notification);
  }

  private async handleWorkflowFailed(event: EventPayload): Promise<void> {
    const { executionId, workflowId, error, duration, context } = event.data;

    // 使用 error 级别日志
    this.consoleManager.log('NotificationEventHandler', 'enableError', `🚨 工作流执行失败: ${workflowId}`, {
      executionId,
      workflowId,
      error,
      duration,
      source: context?.source || 'execution-service'
    });

    const notification = {
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: '工作流执行失败',
      message: `Workflow execution failed: ${workflowId}`,
      type: 'error' as const,
      source: context?.source || 'execution-service',
      timestamp: new Date(),
      details: `Execution ID: ${executionId}, Error: ${error}, Duration: ${duration}ms, Source: ${context?.source || 'unknown'}`
    };
    this.workflowGateway.broadcast('notification', notification);
  }

  // 节点事件处理
  private async handleNodeStarted(event: EventPayload): Promise<void> {
    const { nodeId, executionId, nodeType } = event.data;
    const notification = {
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: '节点执行开始',
      message: `Node execution started: ${nodeId}`,
      type: 'info' as const,
      source: 'execution-service',
      timestamp: new Date(),
      details: `Node Type: ${nodeType}, Execution ID: ${executionId}`
    };
    this.workflowGateway.broadcast('notification', notification);
  }

  private async handleNodeCompleted(event: EventPayload): Promise<void> {
    const { nodeId, executionId, duration, result } = event.data;
    const notification = {
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: '节点执行完成',
      message: `Node execution completed: ${nodeId}`,
      type: result ? 'success' : 'info' as const,
      source: 'execution-service',
      timestamp: new Date(),
      details: `Execution ID: ${executionId}, Duration: ${duration}ms, Result: ${result ? 'Success' : 'Failed'}`
    };
    this.workflowGateway.broadcast('notification', notification);
  }

  private async handleNodeFailed(event: EventPayload): Promise<void> {
    const { nodeId, executionId, error, duration } = event.data;

    // 使用 error 级别日志
    this.consoleManager.log('NotificationEventHandler', 'enableError', `🚨 节点执行失败: ${nodeId}`, {
      nodeId,
      executionId,
      error,
      duration,
      timestamp: event.timestamp
    });

    const notification = {
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: '节点执行失败',
      message: `Node execution failed: ${nodeId}`,
      type: 'error' as const,
      source: 'execution-service',
      timestamp: new Date(),
      details: `Execution ID: ${executionId}, Error: ${error}, Duration: ${duration}ms`
    };

    this.consoleManager.log('NotificationEventHandler', 'enableLog', `广播节点失败通知`, {
      notificationId: notification.id,
      nodeId,
      title: notification.title
    });

    this.workflowGateway.broadcast('notification', notification);
  }

  // 工作流节点事件处理
  private async handleWorkflowNodeCompleted(event: EventPayload): Promise<void> {
    const { nodeId, executionId, result, context } = event.data;
    const notification = {
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: '工作流节点完成',
      message: `Workflow node completed: ${nodeId}`,
      type: 'success' as const,
      source: context?.source || 'execution-service',
      timestamp: new Date(),
      details: `Node ID: ${nodeId}, Execution ID: ${executionId}, Result: ${JSON.stringify(result)}`
    };
    this.workflowGateway.broadcast('notification', notification);
  }

  private async handleWorkflowNodeFailed(event: EventPayload): Promise<void> {
    const { nodeId, executionId, error, context } = event.data;

    // 使用 error 级别日志
    this.consoleManager.log('NotificationEventHandler', 'enableError', `🚨 工作流节点失败: ${nodeId}`, {
      nodeId,
      executionId,
      error,
      source: context?.source,
      timestamp: event.timestamp
    });

    const notification = {
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: '工作流节点失败',
      message: `Workflow node failed: ${nodeId}`,
      type: 'error' as const,
      source: context?.source || 'execution-service',
      timestamp: new Date(),
      details: `Node ID: ${nodeId}, Execution ID: ${executionId}, Error: ${error}`
    };

    this.consoleManager.log('NotificationEventHandler', 'enableLog', `广播工作流节点失败通知`, {
      notificationId: notification.id,
      nodeId,
      title: notification.title
    });

    this.workflowGateway.broadcast('notification', notification);
  }

  // 测量事件处理
  private async handleMeasurementStarted(event: EventPayload): Promise<void> {
    const { measurementType, parameters, nodeId, executionId, context } = event.data;
    const notification = {
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: '测量开始',
      message: `Measurement started: ${measurementType}`,
      type: 'info' as const,
      source: context?.source || 'zahner-service',
      timestamp: new Date(),
      details: `Measurement Type: ${measurementType}, Node ID: ${nodeId}, Execution ID: ${executionId}, Parameters: ${JSON.stringify(parameters)}`
    };
    this.workflowGateway.broadcast('notification', notification);
  }

  private async handleMeasurementCompleted(event: EventPayload): Promise<void> {
    const { measurementType, result, parameters, context } = event.data;

    this.consoleManager.log('NotificationEventHandler', 'enableLog', `处理 measurement.completed 事件`, {
      measurementType,
      source: context?.source,
      timestamp: event.timestamp
    });

    const notification = {
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: '测量完成',
      message: `Measurement completed: ${measurementType}`,
      type: 'success' as const,
      source: context?.source || 'zahner-service',
      timestamp: new Date(),
      details: `Measurement Type: ${measurementType}, Result: ${JSON.stringify(result)}, Parameters: ${JSON.stringify(parameters)}`
    };

    this.consoleManager.log('NotificationEventHandler', 'enableLog', `广播测量完成通知`, {
      notificationId: notification.id,
      measurementType,
      title: notification.title
    });

    this.workflowGateway.broadcast('notification', notification);
  }

  private async handleMeasurementFailed(event: EventPayload): Promise<void> {
    const { measurementType, error, parameters, context } = event.data;

    // 使用 error 级别日志
    this.consoleManager.log('NotificationEventHandler', 'enableError', `🚨 测量失败: ${measurementType}`, {
      measurementType,
      error,
      source: context?.source,
      timestamp: event.timestamp
    });

    const notification = {
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: '测量失败',
      message: `Measurement failed: ${measurementType}`,
      type: 'error' as const,
      source: context?.source || 'zahner-service',
      timestamp: new Date(),
      details: `Measurement Type: ${measurementType}, Error: ${error}, Parameters: ${JSON.stringify(parameters)}`
    };

    this.consoleManager.log('NotificationEventHandler', 'enableLog', `广播测量失败通知`, {
      notificationId: notification.id,
      measurementType,
      title: notification.title
    });

    this.workflowGateway.broadcast('notification', notification);
  }

  // 设备事件处理
  private async handleDeviceConnected(event: EventPayload): Promise<void> {
    const { deviceType, endpoint, context } = event.data;
    const notification = {
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: '设备连接',
      message: `Device connected: ${deviceType}`,
      type: 'success' as const,
      source: context?.source || 'device-service',
      timestamp: new Date(),
      details: `Endpoint: ${endpoint}, Source: ${context?.source || 'unknown'}`
    };
    this.workflowGateway.broadcast('notification', notification);
  }

  private async handleDeviceDisconnected(event: EventPayload): Promise<void> {
    const { deviceType, endpoint, context } = event.data;
    const notification = {
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: '设备断开',
      message: `Device disconnected: ${deviceType}`,
      type: 'warning' as const,
      source: context?.source || 'device-service',
      timestamp: new Date(),
      details: `Endpoint: ${endpoint}, Source: ${context?.source || 'unknown'}`
    };
    this.workflowGateway.broadcast('notification', notification);
  }

  private async handleDeviceError(event: EventPayload): Promise<void> {
    const { deviceType, error, context } = event.data;

    // 使用 error 级别日志
    this.consoleManager.log('NotificationEventHandler', 'enableError', `🚨 设备错误: ${deviceType}`, {
      deviceType,
      error,
      source: context?.source || 'device-service'
    });

    const notification = {
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: '设备错误',
      message: `Device error: ${deviceType}`,
      type: 'error' as const,
      source: context?.source || 'device-service',
      timestamp: new Date(),
      details: `Error: ${error}, Source: ${context?.source || 'unknown'}`
    };
    this.workflowGateway.broadcast('notification', notification);
  }

  // 系统事件处理
  private async handleSystemHealthCheck(event: EventPayload): Promise<void> {
    const { status, metrics } = event.data;
    const notification = {
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: '系统健康检查',
      message: `System health check: ${status}`,
      type: status === 'healthy' ? 'success' : 'warning' as const,
      source: 'system',
      timestamp: new Date(),
      details: `Metrics: ${JSON.stringify(metrics)}`
    };
    this.workflowGateway.broadcast('notification', notification);
  }

  private async handleClientConnected(event: EventPayload): Promise<void> {
    const { clientId, totalClients } = event.data;
    const notification = {
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: '客户端连接',
      message: `Client connected: ${clientId}`,
      type: 'info' as const,
      source: 'gateway',
      timestamp: new Date(),
      details: `Total clients: ${totalClients}`
    };
    this.workflowGateway.broadcast('notification', notification);
  }

  private async handleClientDisconnected(event: EventPayload): Promise<void> {
    const { clientId, totalClients } = event.data;
    const notification = {
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: '客户端断开',
      message: `Client disconnected: ${clientId}`,
      type: 'info' as const,
      source: 'gateway',
      timestamp: new Date(),
      details: `Total clients: ${totalClients}`
    };
    this.workflowGateway.broadcast('notification', notification);
  }

  // 操作事件处理
  private async handleWorkflowCreated(event: EventPayload): Promise<void> {
    const { workflowId, name } = event.data;
    const notification = {
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: '工作流创建',
      message: `Workflow created: ${name}`,
      type: 'success' as const,
      source: 'workflow-service',
      timestamp: new Date(),
      details: `Workflow ID: ${workflowId}`
    };
    this.workflowGateway.broadcast('notification', notification);
  }

  private async handleWorkflowUpdated(event: EventPayload): Promise<void> {
    const { workflowId, name } = event.data;
    const notification = {
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: '工作流更新',
      message: `Workflow updated: ${name}`,
      type: 'info' as const,
      source: 'workflow-service',
      timestamp: new Date(),
      details: `Workflow ID: ${workflowId}`
    };
    this.workflowGateway.broadcast('notification', notification);
  }

  private async handleWorkflowDeleted(event: EventPayload): Promise<void> {
    const { workflowId, name } = event.data;
    const notification = {
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: '工作流删除',
      message: `Workflow deleted: ${name}`,
      type: 'warning' as const,
      source: 'workflow-service',
      timestamp: new Date(),
      details: `Workflow ID: ${workflowId}`
    };
    this.workflowGateway.broadcast('notification', notification);
  }

  /**
   * 获取处理器统计信息
   */
  getStats() {
    return {
      name: 'NotificationEventHandler',
      handledEvents: [
        'workflow.started', 'workflow.completed', 'workflow.failed',
        'workflow.node.completed', 'workflow.node.failed',
        'node.started', 'node.completed', 'node.failed',
        'measurement.started', 'measurement.completed', 'measurement.failed',
        'device.connected', 'device.disconnected', 'device.error',
        'system.health_check', 'client.connected', 'client.disconnected',
        'workflow.created', 'workflow.updated', 'workflow.deleted'
      ],
      timestamp: new Date()
    };
  }
}