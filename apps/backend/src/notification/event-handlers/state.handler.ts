import { Injectable } from '@nestjs/common';
import { SimpleEventBus, EventPayload, EventHandler } from '../simple-event-bus.service';
import { ConsoleDisplayManager } from '../../common/console-display-manager.service';
import { WorkflowGateway } from '../../gateways/workflow.gateway';
import { FilesService } from '../../modules/files/files.service';

export enum NodeStatus {
  READY = 'ready',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused',
  CANCELLED = 'cancelled',
  PENDING = 'pending'
}

interface NodeTimeRecord {
  nodeId: string;
  nodeType: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: NodeStatus;
  executionId: string;
  workflowId: string;
}

@Injectable()
export class StateEventHandler implements EventHandler {
  private readonly nodeStates = new Map<string, NodeStatus>();
  private readonly workflowStates = new Map<string, any>();
  private readonly deviceStates = new Map<string, any>();
  private readonly nodeTimeRecords = new Map<string, NodeTimeRecord>();

  constructor(
    private readonly eventBus: SimpleEventBus,
    private readonly consoleManager: ConsoleDisplayManager,
    private readonly workflowGateway: WorkflowGateway,
    private readonly filesService: FilesService,
  ) {
    // 注册事件处理器
    this.registerEventHandlers();
  }

  /**
   * 注册事件处理器
   */
  private registerEventHandlers(): void {
    const handlers = {
      // 工作流状态事件
      'workflow.started': this.handleWorkflowStarted.bind(this),
      'workflow.completed': this.handleWorkflowCompleted.bind(this),
      'workflow.failed': this.handleWorkflowFailed.bind(this),

      // 节点状态事件
      'node.started': this.handleNodeStarted.bind(this),
      'node.completed': this.handleNodeCompleted.bind(this),
      'node.failed': this.handleNodeFailed.bind(this),

      // 设备状态事件
      'device.connected': this.handleDeviceConnected.bind(this),
      'device.disconnected': this.handleDeviceDisconnected.bind(this),
      'device.error': this.handleDeviceError.bind(this),

      // 状态查询事件
      'state.query.node': this.handleNodeStateQuery.bind(this),
      'state.query.workflow': this.handleWorkflowStateQuery.bind(this),
      'state.query.device': this.handleDeviceStateQuery.bind(this),
    };

    this.eventBus.onEvents(handlers);
    this.consoleManager.log('StateEventHandler', 'enableLog', `Registered ${Object.keys(handlers).length} state event handlers`);
  }

  /**
   * 处理事件
   */
  async handle(event: EventPayload): Promise<void> {
    try {
      this.consoleManager.log('StateEventHandler', 'enableDebug', `Processing state event: ${event.type}`, {
        eventType: event.type,
        timestamp: event.timestamp,
        data: event.data
      });

      // 根据事件类型调用对应的处理方法
      const methodName = `handle${event.type.split('.').map(part =>
        part.charAt(0).toUpperCase() + part.slice(1)
      ).join('')}`;

      if (typeof (this as any)[methodName] === 'function') {
        await (this as any)[methodName](event);
      } else {
        this.consoleManager.log('StateEventHandler', 'enableWarn', `No state handler found for event type: ${event.type}`);
      }
    } catch (error) {
      this.consoleManager.log('StateEventHandler', 'enableError', `Failed to handle state event: ${event.type}`, error);
    }
  }

  // 工作流状态处理
  private async handleWorkflowStarted(event: EventPayload): Promise<void> {
    const { executionId, workflowId } = event.data;

    const previousState = this.workflowStates.get(executionId);
    const newState = {
      executionId,
      workflowId,
      status: 'running',
      startTime: event.timestamp,
      context: event.context
    };

    this.workflowStates.set(executionId, newState);

    this.consoleManager.log('StateEventHandler', 'enableLog', `Workflow state updated: ${workflowId}`, {
      executionId,
      fromState: previousState?.status || 'unknown',
      toState: 'running',
      timestamp: event.timestamp
    });

    // 触发状态变更事件
    this.eventBus.emit('workflow.state.changed', {
      executionId,
      workflowId,
      fromState: previousState?.status || 'unknown',
      toState: 'running',
      timestamp: event.timestamp,
      context: event.context
    });
  }

  private async handleWorkflowCompleted(event: EventPayload): Promise<void> {
    const { executionId, workflowId, success, duration } = event.data;

    const previousState = this.workflowStates.get(executionId);
    const newState = {
      executionId,
      workflowId,
      status: success ? 'completed' : 'finished',
      endTime: event.timestamp,
      duration,
      success,
      context: event.context
    };

    this.workflowStates.set(executionId, newState);

    this.consoleManager.log('StateEventHandler', 'enableLog', `Workflow state updated: ${workflowId}`, {
      executionId,
      fromState: previousState?.status || 'unknown',
      toState: success ? 'completed' : 'finished',
      duration,
      timestamp: event.timestamp
    });

    // 触发状态变更事件
    this.eventBus.emit('workflow.state.changed', {
      executionId,
      workflowId,
      fromState: previousState?.status || 'unknown',
      toState: success ? 'completed' : 'finished',
      timestamp: event.timestamp,
      context: event.context
    });

    // 生成工作流时间日志文件
    await this.generateWorkflowTimeLog(executionId);
  }

  private async handleWorkflowFailed(event: EventPayload): Promise<void> {
    const { executionId, workflowId, error, duration } = event.data;

    const previousState = this.workflowStates.get(executionId);
    const newState = {
      executionId,
      workflowId,
      status: 'failed',
      endTime: event.timestamp,
      duration,
      error,
      context: event.context
    };

    this.workflowStates.set(executionId, newState);

    this.consoleManager.log('StateEventHandler', 'enableLog', `Workflow state updated: ${workflowId}`, {
      executionId,
      fromState: previousState?.status || 'unknown',
      toState: 'failed',
      error,
      duration,
      timestamp: event.timestamp
    });

    // 触发状态变更事件
    this.eventBus.emit('workflow.state.changed', {
      executionId,
      workflowId,
      fromState: previousState?.status || 'unknown',
      toState: 'failed',
      timestamp: event.timestamp,
      context: event.context
    });
  }

  // 节点状态处理
  private async handleNodeStarted(event: EventPayload): Promise<void> {
    const { nodeId, executionId, nodeType, workflowId } = event.data;

    const previousState = this.nodeStates.get(nodeId);
    const newState = NodeStatus.RUNNING;

    if (!this.isValidStateTransition(previousState, newState)) {
      this.consoleManager.log('StateEventHandler', 'enableWarn', `Invalid node state transition: ${nodeId}`, {
        nodeId,
        fromState: previousState,
        toState: newState
      });
      return;
    }

    this.nodeStates.set(nodeId, newState);

    // 记录节点开始时间
    this.nodeTimeRecords.set(nodeId, {
      nodeId,
      nodeType,
      startTime: event.timestamp,
      status: newState,
      executionId,
      workflowId
    });

    this.consoleManager.log('StateEventHandler', 'enableDebug', `Node state updated: ${nodeId}`, {
      nodeId,
      executionId,
      nodeType,
      fromState: previousState || 'unknown',
      toState: newState,
      timestamp: event.timestamp
    });

    // 触发状态变更事件
    this.eventBus.emit('node.state.changed', {
      nodeId,
      executionId,
      workflowId, // 添加workflowId
      nodeType,
      fromState: previousState || 'unknown',
      toState: newState,
      timestamp: event.timestamp,
      context: event.context
    });

    // 直接发送状态更新到前端 - 关键修复！
    if (workflowId) {
      this.workflowGateway.sendNodeStatusUpdate(workflowId, nodeId, newState, {
        nodeType,
        fromState: previousState || 'unknown',
        toState: newState
      });
    }
  }

  private async handleNodeCompleted(event: EventPayload): Promise<void> {
    const { nodeId, executionId, duration, workflowId } = event.data;

    const previousState = this.nodeStates.get(nodeId);
    const newState = NodeStatus.COMPLETED;

    if (!this.isValidStateTransition(previousState, newState)) {
      this.consoleManager.log('StateEventHandler', 'enableWarn', `Invalid node state transition: ${nodeId}`, {
        nodeId,
        fromState: previousState,
        toState: newState
      });
      return;
    }

    this.nodeStates.set(nodeId, newState);

    // 更新节点时间记录
    const timeRecord = this.nodeTimeRecords.get(nodeId);
    if (timeRecord) {
      timeRecord.endTime = event.timestamp;
      timeRecord.duration = duration;
      timeRecord.status = newState;
    }

    this.consoleManager.log('StateEventHandler', 'enableDebug', `Node state updated: ${nodeId}`, {
      nodeId,
      executionId,
      fromState: previousState || 'unknown',
      toState: newState,
      duration,
      timestamp: event.timestamp
    });

    // 触发状态变更事件
    this.eventBus.emit('node.state.changed', {
      nodeId,
      executionId,
      workflowId, // 添加workflowId
      fromState: previousState || 'unknown',
      toState: newState,
      duration,
      timestamp: event.timestamp,
      context: event.context
    });

    // 直接发送状态更新到前端 - 关键修复！
    if (workflowId) {
      this.workflowGateway.sendNodeStatusUpdate(workflowId, nodeId, newState, {
        fromState: previousState || 'unknown',
        toState: newState,
        duration
      });
    }
  }

  private async handleNodeFailed(event: EventPayload): Promise<void> {
    const { nodeId, executionId, error, duration, workflowId } = event.data;

    const previousState = this.nodeStates.get(nodeId);
    const newState = NodeStatus.FAILED;

    if (!this.isValidStateTransition(previousState, newState)) {
      this.consoleManager.log('StateEventHandler', 'enableWarn', `Invalid node state transition: ${nodeId}`, {
        nodeId,
        fromState: previousState,
        toState: newState
      });
      return;
    }

    this.nodeStates.set(nodeId, newState);

    // 更新节点时间记录
    const timeRecord = this.nodeTimeRecords.get(nodeId);
    if (timeRecord) {
      timeRecord.endTime = event.timestamp;
      timeRecord.duration = duration;
      timeRecord.status = newState;
    }

    this.consoleManager.log('StateEventHandler', 'enableDebug', `Node state updated: ${nodeId}`, {
      nodeId,
      executionId,
      fromState: previousState || 'unknown',
      toState: newState,
      error,
      duration,
      timestamp: event.timestamp
    });

    // 触发状态变更事件
    this.eventBus.emit('node.state.changed', {
      nodeId,
      executionId,
      workflowId, // 添加workflowId
      fromState: previousState || 'unknown',
      toState: newState,
      error,
      duration,
      timestamp: event.timestamp,
      context: event.context
    });

    // 直接发送状态更新到前端 - 关键修复！
    if (workflowId) {
      this.workflowGateway.sendNodeStatusUpdate(workflowId, nodeId, newState, {
        fromState: previousState || 'unknown',
        toState: newState,
        error,
        duration
      });
    }
  }

  // 设备状态处理
  private async handleDeviceConnected(event: EventPayload): Promise<void> {
    const { deviceType, endpoint } = event.data;

    const previousState = this.deviceStates.get(deviceType);
    const newState = {
      status: 'connected',
      endpoint,
      connectedAt: event.timestamp,
      context: event.context
    };

    this.deviceStates.set(deviceType, newState);

    this.consoleManager.log('StateEventHandler', 'enableLog', `Device state updated: ${deviceType}`, {
      deviceType,
      fromState: previousState?.status || 'unknown',
      toState: 'connected',
      endpoint,
      timestamp: event.timestamp
    });

    // 触发状态变更事件
    this.eventBus.emit('device.state.changed', {
      deviceType,
      endpoint,
      fromState: previousState?.status || 'unknown',
      toState: 'connected',
      timestamp: event.timestamp,
      context: event.context
    });
  }

  private async handleDeviceDisconnected(event: EventPayload): Promise<void> {
    const { deviceType, endpoint } = event.data;

    const previousState = this.deviceStates.get(deviceType);
    const newState = {
      status: 'disconnected',
      endpoint,
      disconnectedAt: event.timestamp,
      context: event.context
    };

    this.deviceStates.set(deviceType, newState);

    this.consoleManager.log('StateEventHandler', 'enableLog', `Device state updated: ${deviceType}`, {
      deviceType,
      fromState: previousState?.status || 'unknown',
      toState: 'disconnected',
      endpoint,
      timestamp: event.timestamp
    });

    // 触发状态变更事件
    this.eventBus.emit('device.state.changed', {
      deviceType,
      endpoint,
      fromState: previousState?.status || 'unknown',
      toState: 'disconnected',
      timestamp: event.timestamp,
      context: event.context
    });
  }

  private async handleDeviceError(event: EventPayload): Promise<void> {
    const { deviceType, error } = event.data;

    const previousState = this.deviceStates.get(deviceType);
    const newState = {
      status: 'error',
      error,
      errorAt: event.timestamp,
      context: event.context
    };

    this.deviceStates.set(deviceType, newState);

    this.consoleManager.log('StateEventHandler', 'enableError', `Device state updated: ${deviceType}`, {
      deviceType,
      fromState: previousState?.status || 'unknown',
      toState: 'error',
      error,
      timestamp: event.timestamp
    });

    // 触发状态变更事件
    this.eventBus.emit('device.state.changed', {
      deviceType,
      error,
      fromState: previousState?.status || 'unknown',
      toState: 'error',
      timestamp: event.timestamp,
      context: event.context
    });
  }

  // 状态查询处理
  private async handleNodeStateQuery(event: EventPayload): Promise<void> {
    const { nodeId } = event.data;
    const state = this.nodeStates.get(nodeId);

    this.eventBus.emit('state.query.node.response', {
      nodeId,
      state: state || null,
      timestamp: event.timestamp,
      context: event.context
    });
  }

  private async handleWorkflowStateQuery(event: EventPayload): Promise<void> {
    const { executionId } = event.data;
    const state = this.workflowStates.get(executionId);

    this.eventBus.emit('state.query.workflow.response', {
      executionId,
      state: state || null,
      timestamp: event.timestamp,
      context: event.context
    });
  }

  private async handleDeviceStateQuery(event: EventPayload): Promise<void> {
    const { deviceType } = event.data;
    const state = this.deviceStates.get(deviceType);

    this.eventBus.emit('state.query.device.response', {
      deviceType,
      state: state || null,
      timestamp: event.timestamp,
      context: event.context
    });
  }

  /**
   * 验证状态转换是否有效
   */
  private isValidStateTransition(from: NodeStatus | undefined, to: NodeStatus): boolean {
    if (!from) return true; // 初始状态

    const validTransitions: Record<NodeStatus, NodeStatus[]> = {
      [NodeStatus.READY]: [NodeStatus.RUNNING, NodeStatus.CANCELLED],
      [NodeStatus.RUNNING]: [NodeStatus.COMPLETED, NodeStatus.FAILED, NodeStatus.PAUSED],
      [NodeStatus.PAUSED]: [NodeStatus.RUNNING, NodeStatus.CANCELLED],
      [NodeStatus.COMPLETED]: [],
      [NodeStatus.FAILED]: [],
      [NodeStatus.CANCELLED]: [],
      [NodeStatus.PENDING]: [NodeStatus.READY, NodeStatus.RUNNING]
    };

    return validTransitions[from]?.includes(to) || false;
  }

  /**
   * 获取节点状态
   */
  getNodeState(nodeId: string): NodeStatus | undefined {
    return this.nodeStates.get(nodeId);
  }

  /**
   * 获取工作流状态
   */
  getWorkflowState(executionId: string): any | undefined {
    return this.workflowStates.get(executionId);
  }

  /**
   * 获取设备状态
   */
  getDeviceState(deviceType: string): any | undefined {
    return this.deviceStates.get(deviceType);
  }

  /**
   * 获取所有状态统计
   */
  getStateStats() {
    return {
      name: 'StateEventHandler',
      nodeStates: Object.fromEntries(this.nodeStates),
      workflowStates: Object.fromEntries(this.workflowStates),
      deviceStates: Object.fromEntries(this.deviceStates),
      totalNodes: this.nodeStates.size,
      totalWorkflows: this.workflowStates.size,
      totalDevices: this.deviceStates.size,
      timestamp: new Date()
    };
  }

  /**
   * 生成工作流时间日志文件
   */
  private async generateWorkflowTimeLog(executionId: string): Promise<void> {
    const workflowState = this.workflowStates.get(executionId);
    if (!workflowState) {
      this.consoleManager.log('StateEventHandler', 'enableWarn',
        `No workflow state found for execution: ${executionId}`);
      return;
    }

    // 筛选属于该工作流的节点记录
    const workflowNodeRecords = Array.from(this.nodeTimeRecords.values())
      .filter(record => record.executionId === executionId);

    // 获取工作流时间戳（从工作流状态中提取或生成）
    const workflowTimestamp = this.extractWorkflowTimestamp(workflowState);

    const timeLog = {
      workflow_id: workflowState.workflowId,
      execution_id: executionId,
      workflow_start_time: workflowState.startTime?.toISOString(),
      workflow_end_time: workflowState.endTime?.toISOString(),
      total_duration_ms: workflowState.duration,
      workflow_timestamp: workflowTimestamp,
      nodes: workflowNodeRecords.map(record => ({
        node_id: record.nodeId,
        node_type: record.nodeType,
        start_time: record.startTime.toISOString(),
        end_time: record.endTime?.toISOString(),
        duration_ms: record.duration,
        status: record.status
      })),
      created_at: new Date().toISOString()
    };

    // 使用现有的 FilesService 构建路径
    const outputPath = this.filesService.buildOutputPath({
      workflow_id: workflowState.workflowId,
      workflow_timestamp: workflowTimestamp,
      test_type: 'workflow_log'
    });

    // 写入JSON文件
    const fs = require('fs').promises;
    const path = require('path');
    const filePath = path.join(outputPath, 'workflow_time_log.json');

    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(timeLog, null, 2), 'utf8');
      this.consoleManager.log('StateEventHandler', 'enableLog',
        `Workflow time log saved: ${filePath}`);
    } catch (error) {
      this.consoleManager.log('StateEventHandler', 'enableError',
        `Failed to save workflow time log: ${error}`);
    }
  }

  /**
   * 从工作流状态中提取时间戳
   */
  private extractWorkflowTimestamp(workflowState: any): string {
    // 尝试从context中获取时间戳
    if (workflowState.context?.workflow_timestamp) {
      return workflowState.context.workflow_timestamp;
    }

    // 如果没有，从开始时间生成
    if (workflowState.startTime) {
      return workflowState.startTime.toISOString()
        .slice(2, 16) // YYMMDD_HHmm 格式
        .replace(/[-:]/g, '')
        .replace('T', '_');
    }

    // 降级：使用当前时间
    const now = new Date();
    return now.toISOString()
      .slice(2, 16)
      .replace(/[-:]/g, '')
      .replace('T', '_');
  }
}