import { Injectable } from '@nestjs/common';
import { SimpleEventBus, EventPayload, EventHandler } from '../simple-event-bus.service';
import { ConsoleDisplayManager } from '../../common/console-display-manager.service';

@Injectable()
export class MetricsEventHandler implements EventHandler {
  private readonly startTime = Date.now();

  // 性能指标
  private readonly metrics = {
    eventsProcessed: 0,
    eventsByType: new Map<string, number>(),
    processingTimes: [] as number[],
    errors: 0,
    lastEventTime: 0,

    // 业务指标
    workflowsStarted: 0,
    workflowsCompleted: 0,
    workflowsFailed: 0,
    nodesStarted: 0,
    nodesCompleted: 0,
    nodesFailed: 0,
    devicesConnected: 0,
    devicesDisconnected: 0,
    deviceErrors: 0,

    // 实时指标
    activeWorkflows: new Set<string>(),
    activeNodes: new Set<string>(),
    connectedDevices: new Set<string>(),
  };

  constructor(
    private readonly eventBus: SimpleEventBus,
    private readonly consoleManager: ConsoleDisplayManager,
  ) {
    // 注册事件处理器
    this.registerEventHandlers();
  }

  /**
   * 注册事件处理器
   */
  private registerEventHandlers(): void {
    const handlers = {
      // 工作流指标
      'workflow.started': this.handleWorkflowStarted.bind(this),
      'workflow.completed': this.handleWorkflowCompleted.bind(this),
      'workflow.failed': this.handleWorkflowFailed.bind(this),

      // 节点指标
      'node.started': this.handleNodeStarted.bind(this),
      'node.completed': this.handleNodeCompleted.bind(this),
      'node.failed': this.handleNodeFailed.bind(this),

      // 设备指标
      'device.connected': this.handleDeviceConnected.bind(this),
      'device.disconnected': this.handleDeviceDisconnected.bind(this),
      'device.error': this.handleDeviceError.bind(this),

      // 系统指标
      'system.health_check': this.handleSystemHealthCheck.bind(this),
      'client.connected': this.handleClientConnected.bind(this),
      'client.disconnected': this.handleClientDisconnected.bind(this),

      // 指标查询
      'metrics.query': this.handleMetricsQuery.bind(this),
    };

    this.eventBus.onEvents(handlers);
    this.consoleManager.log('MetricsEventHandler', 'enableLog', `Registered ${Object.keys(handlers).length} metrics event handlers`);
  }

  /**
   * 处理事件
   */
  async handle(event: EventPayload): Promise<void> {
    const startTime = Date.now();

    try {
      this.consoleManager.log('MetricsEventHandler', 'enableDebug', `Processing metrics event: ${event.type}`, {
        eventType: event.type,
        timestamp: event.timestamp,
        dataKeys: Object.keys(event.data || {})
      });

      // 更新通用指标
      this.updateGeneralMetrics(event.type, startTime);

      // 根据事件类型调用对应的处理方法
      const methodName = `handle${event.type.split('.').map(part =>
        part.charAt(0).toUpperCase() + part.slice(1)
      ).join('')}`;

      if (typeof (this as any)[methodName] === 'function') {
        await (this as any)[methodName](event);
      }

      // 更新处理时间
      const processingTime = Date.now() - startTime;
      this.metrics.processingTimes.push(processingTime);

      // 保持处理时间数组在合理大小
      if (this.metrics.processingTimes.length > 1000) {
        this.metrics.processingTimes = this.metrics.processingTimes.slice(-500);
      }

    } catch (error) {
      this.metrics.errors++;
      this.consoleManager.log('MetricsEventHandler', 'enableError', `Failed to handle metrics event: ${event.type}`, error);
    }
  }

  // 工作流指标处理
  private async handleWorkflowStarted(event: EventPayload): Promise<void> {
    const { executionId, workflowId } = event.data;

    this.metrics.workflowsStarted++;
    this.metrics.activeWorkflows.add(executionId);

    this.consoleManager.log('MetricsEventHandler', 'enableDebug', `Workflow metrics updated`, {
      workflowId,
      executionId,
      totalStarted: this.metrics.workflowsStarted,
      activeWorkflows: this.metrics.activeWorkflows.size
    });
  }

  private async handleWorkflowCompleted(event: EventPayload): Promise<void> {
    const { executionId, workflowId, success, duration } = event.data;

    if (success) {
      this.metrics.workflowsCompleted++;
    }

    this.metrics.activeWorkflows.delete(executionId);

    // 记录工作流完成时间
    this.eventBus.emit('metrics.workflow.completed', {
      workflowId,
      executionId,
      duration,
      success,
      timestamp: event.timestamp
    });

    this.consoleManager.log('MetricsEventHandler', 'enableDebug', `Workflow metrics updated`, {
      workflowId,
      executionId,
      success,
      duration,
      totalCompleted: this.metrics.workflowsCompleted,
      activeWorkflows: this.metrics.activeWorkflows.size
    });
  }

  private async handleWorkflowFailed(event: EventPayload): Promise<void> {
    const { executionId, workflowId, duration } = event.data;

    this.metrics.workflowsFailed++;
    this.metrics.activeWorkflows.delete(executionId);

    // 记录工作流失败
    this.eventBus.emit('metrics.workflow.failed', {
      workflowId,
      executionId,
      duration,
      timestamp: event.timestamp
    });

    this.consoleManager.log('MetricsEventHandler', 'enableDebug', `Workflow metrics updated`, {
      workflowId,
      executionId,
      duration,
      totalFailed: this.metrics.workflowsFailed,
      activeWorkflows: this.metrics.activeWorkflows.size
    });
  }

  // 节点指标处理
  private async handleNodeStarted(event: EventPayload): Promise<void> {
    const { nodeId, executionId, nodeType } = event.data;

    this.metrics.nodesStarted++;
    this.metrics.activeNodes.add(nodeId);

    this.consoleManager.log('MetricsEventHandler', 'enableDebug', `Node metrics updated`, {
      nodeId,
      executionId,
      nodeType,
      totalStarted: this.metrics.nodesStarted,
      activeNodes: this.metrics.activeNodes.size
    });
  }

  private async handleNodeCompleted(event: EventPayload): Promise<void> {
    const { nodeId, executionId, duration } = event.data;

    this.metrics.nodesCompleted++;
    this.metrics.activeNodes.delete(nodeId);

    // 记录节点完成时间
    this.eventBus.emit('metrics.node.completed', {
      nodeId,
      executionId,
      duration,
      timestamp: event.timestamp
    });

    this.consoleManager.log('MetricsEventHandler', 'enableDebug', `Node metrics updated`, {
      nodeId,
      executionId,
      duration,
      totalCompleted: this.metrics.nodesCompleted,
      activeNodes: this.metrics.activeNodes.size
    });
  }

  private async handleNodeFailed(event: EventPayload): Promise<void> {
    const { nodeId, executionId, duration } = event.data;

    this.metrics.nodesFailed++;
    this.metrics.activeNodes.delete(nodeId);

    // 记录节点失败
    this.eventBus.emit('metrics.node.failed', {
      nodeId,
      executionId,
      duration,
      timestamp: event.timestamp
    });

    this.consoleManager.log('MetricsEventHandler', 'enableDebug', `Node metrics updated`, {
      nodeId,
      executionId,
      duration,
      totalFailed: this.metrics.nodesFailed,
      activeNodes: this.metrics.activeNodes.size
    });
  }

  // 设备指标处理
  private async handleDeviceConnected(event: EventPayload): Promise<void> {
    const { deviceType, endpoint } = event.data;

    this.metrics.devicesConnected++;
    this.metrics.connectedDevices.add(deviceType);

    this.consoleManager.log('MetricsEventHandler', 'enableDebug', `Device metrics updated`, {
      deviceType,
      endpoint,
      totalConnected: this.metrics.devicesConnected,
      connectedDevices: Array.from(this.metrics.connectedDevices)
    });
  }

  private async handleDeviceDisconnected(event: EventPayload): Promise<void> {
    const { deviceType, endpoint } = event.data;

    this.metrics.devicesDisconnected++;
    this.metrics.connectedDevices.delete(deviceType);

    this.consoleManager.log('MetricsEventHandler', 'enableDebug', `Device metrics updated`, {
      deviceType,
      endpoint,
      totalDisconnected: this.metrics.devicesDisconnected,
      connectedDevices: Array.from(this.metrics.connectedDevices)
    });
  }

  private async handleDeviceError(event: EventPayload): Promise<void> {
    const { deviceType, error } = event.data;

    this.metrics.deviceErrors++;

    // 记录设备错误
    this.eventBus.emit('metrics.device.error', {
      deviceType,
      error,
      timestamp: event.timestamp
    });

    this.consoleManager.log('MetricsEventHandler', 'enableDebug', `Device metrics updated`, {
      deviceType,
      error,
      totalErrors: this.metrics.deviceErrors
    });
  }

  // 系统指标处理
  private async handleSystemHealthCheck(event: EventPayload): Promise<void> {
    const { status, metrics: healthMetrics } = event.data;

    // 记录系统健康指标
    this.eventBus.emit('metrics.system.health', {
      status,
      metrics: healthMetrics,
      eventMetrics: this.getMetrics(),
      timestamp: event.timestamp
    });

    this.consoleManager.log('MetricsEventHandler', 'enableDebug', `System health metrics recorded`, {
      status,
      metricsCollected: Object.keys(healthMetrics || {}).length
    });
  }

  private async handleClientConnected(event: EventPayload): Promise<void> {
    const { clientId, totalClients } = event.data;

    // 记录客户端连接指标
    this.eventBus.emit('metrics.client.connected', {
      clientId,
      totalClients,
      timestamp: event.timestamp
    });

    this.consoleManager.log('MetricsEventHandler', 'enableDebug', `Client connection metrics updated`, {
      clientId,
      totalClients
    });
  }

  private async handleClientDisconnected(event: EventPayload): Promise<void> {
    const { clientId, totalClients } = event.data;

    // 记录客户端断开指标
    this.eventBus.emit('metrics.client.disconnected', {
      clientId,
      totalClients,
      timestamp: event.timestamp
    });

    this.consoleManager.log('MetricsEventHandler', 'enableDebug', `Client disconnection metrics updated`, {
      clientId,
      totalClients
    });
  }

  // 指标查询处理
  private async handleMetricsQuery(event: EventPayload): Promise<void> {
    const { queryId, type } = event.data;

    let response: any;

    switch (type) {
      case 'general':
        response = this.getMetrics();
        break;
      case 'performance':
        response = this.getPerformanceMetrics();
        break;
      case 'business':
        response = this.getBusinessMetrics();
        break;
      case 'realtime':
        response = this.getRealtimeMetrics();
        break;
      default:
        response = this.getMetrics();
    }

    this.eventBus.emit('metrics.query.response', {
      queryId,
      type,
      response,
      timestamp: event.timestamp
    });
  }

  /**
   * 更新通用指标
   */
  private updateGeneralMetrics(eventType: string, startTime: number): void {
    this.metrics.eventsProcessed++;
    this.metrics.lastEventTime = startTime;

    // 更新事件类型计数
    const currentCount = this.metrics.eventsByType.get(eventType) || 0;
    this.metrics.eventsByType.set(eventType, currentCount + 1);
  }

  /**
   * 获取通用指标
   */
  getMetrics() {
    return {
      eventsProcessed: this.metrics.eventsProcessed,
      eventsByType: Object.fromEntries(this.metrics.eventsByType),
      errors: this.metrics.errors,
      uptime: Date.now() - this.startTime,
      lastEventTime: this.metrics.lastEventTime,
      timestamp: new Date()
    };
  }

  /**
   * 获取性能指标
   */
  getPerformanceMetrics() {
    const processingTimes = this.metrics.processingTimes;
    const avgProcessingTime = processingTimes.length > 0
      ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
      : 0;

    const sortedTimes = [...processingTimes].sort((a, b) => a - b);
    const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)] || 0;
    const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0;
    const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)] || 0;

    return {
      avgProcessingTime,
      p50ProcessingTime: p50,
      p95ProcessingTime: p95,
      p99ProcessingTime: p99,
      totalEventsProcessed: this.metrics.eventsProcessed,
      errorRate: this.metrics.eventsProcessed > 0
        ? (this.metrics.errors / this.metrics.eventsProcessed) * 100
        : 0,
      timestamp: new Date()
    };
  }

  /**
   * 获取业务指标
   */
  getBusinessMetrics() {
    return {
      workflows: {
        started: this.metrics.workflowsStarted,
        completed: this.metrics.workflowsCompleted,
        failed: this.metrics.workflowsFailed,
        successRate: this.metrics.workflowsStarted > 0
          ? (this.metrics.workflowsCompleted / this.metrics.workflowsStarted) * 100
          : 0
      },
      nodes: {
        started: this.metrics.nodesStarted,
        completed: this.metrics.nodesCompleted,
        failed: this.metrics.nodesFailed,
        successRate: this.metrics.nodesStarted > 0
          ? (this.metrics.nodesCompleted / this.metrics.nodesStarted) * 100
          : 0
      },
      devices: {
        connected: this.metrics.devicesConnected,
        disconnected: this.metrics.devicesDisconnected,
        errors: this.metrics.deviceErrors,
        errorRate: this.metrics.devicesConnected > 0
          ? (this.metrics.deviceErrors / this.metrics.devicesConnected) * 100
          : 0
      },
      timestamp: new Date()
    };
  }

  /**
   * 获取实时指标
   */
  getRealtimeMetrics() {
    return {
      activeWorkflows: this.metrics.activeWorkflows.size,
      activeNodes: this.metrics.activeNodes.size,
      connectedDevices: Array.from(this.metrics.connectedDevices),
      eventsPerSecond: this.calculateEventsPerSecond(),
      timestamp: new Date()
    };
  }

  /**
   * 计算每秒事件数
   */
  private calculateEventsPerSecond(): number {
    const now = Date.now();
    const oneMinuteAgo = now - 60000; // 最近1分钟

    // 这里简化处理，实际应用中可能需要更复杂的时间窗口计算
    return this.metrics.eventsProcessed / ((now - this.startTime) / 1000);
  }

  /**
   * 获取完整的指标统计
   */
  getStats() {
    return {
      name: 'MetricsEventHandler',
      general: this.getMetrics(),
      performance: this.getPerformanceMetrics(),
      business: this.getBusinessMetrics(),
      realtime: this.getRealtimeMetrics(),
      timestamp: new Date()
    };
  }
}