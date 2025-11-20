import { Injectable } from '@nestjs/common';
import { EventBus, EventPayload } from './event-bus.service';
import { ConsoleDisplayManager } from '../common/console-display-manager.service';
import { WorkflowGateway } from '../gateways/workflow.gateway';

export enum NodeStatus {
  READY = 'ready',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused',
  CANCELLED = 'cancelled',
  PENDING = 'pending'
}

@Injectable()
export class StateEventHandler {
  // 内存中的实时状态缓存
  private readonly nodeStates = new Map<string, NodeStatus>();
  private readonly workflowStates = new Map<string, any>();
  private readonly deviceStates = new Map<string, any>();

  constructor(
    private readonly eventBus: EventBus,
    private readonly consoleManager: ConsoleDisplayManager,
    private readonly workflowGateway: WorkflowGateway,
    // ❌ Removed FilesService
  ) {
    this.registerEventHandlers();
  }

  private registerEventHandlers(): void {
    this.eventBus.registerHandlers({
      // Workflow
      'workflow.started': this.handleWorkflowStarted.bind(this),
      'workflow.completed': this.handleWorkflowCompleted.bind(this),
      'workflow.failed': this.handleWorkflowFailed.bind(this),

      // Node
      'node.started': this.handleNodeStarted.bind(this),
      'node.completed': this.handleNodeCompleted.bind(this),
      'node.failed': this.handleNodeFailed.bind(this),

      // Device
      'device.connected': (e) => this.updateDevice(e, 'connected'),
      'device.disconnected': (e) => this.updateDevice(e, 'disconnected'),
      'device.error': (e) => this.updateDevice(e, 'error'),
      
      // Query (响应前端的主动查询)
      'state.query.workflow': this.handleWorkflowQuery.bind(this),
    });
  }

  // --- Workflow Logic ---
  private handleWorkflowStarted(event: EventPayload) {
    const { executionId, workflowId } = event.data;
    this.workflowStates.set(executionId, { 
      status: 'running', 
      workflowId, 
      startTime: event.timestamp 
    });
    this.workflowGateway.sendExecutionUpdate(workflowId, executionId, 'running', 0);
  }

  private handleWorkflowCompleted(event: EventPayload) {
    const { executionId, workflowId, success, duration } = event.data;
    const state = this.workflowStates.get(executionId);
    if (state) {
        state.status = success ? 'completed' : 'finished';
        state.endTime = event.timestamp;
        state.duration = duration;
    }
    // ❌ 原来的 generateWorkflowTimeLog 已被移除，数据现在由 ExecutionService 存入 SQLite
    this.workflowGateway.sendExecutionUpdate(workflowId, executionId, success ? 'completed' : 'failed', 100);
  }

  private handleWorkflowFailed(event: EventPayload) {
    const { executionId, workflowId, error } = event.data;
    const state = this.workflowStates.get(executionId);
    if (state) {
        state.status = 'failed';
        state.error = error;
        state.endTime = event.timestamp;
    }
    this.workflowGateway.sendExecutionUpdate(workflowId, executionId, 'failed', 100);
  }

  // --- Node Logic ---
  private handleNodeStarted(event: EventPayload) {
    const { nodeId, workflowId, nodeType } = event.data;
    this.nodeStates.set(nodeId, NodeStatus.RUNNING);
    if (workflowId) {
        this.workflowGateway.sendNodeStatusUpdate(workflowId, nodeId, NodeStatus.RUNNING, { nodeType });
    }
  }

  private handleNodeCompleted(event: EventPayload) {
    const { nodeId, workflowId, result } = event.data;
    this.nodeStates.set(nodeId, NodeStatus.COMPLETED);
    if (workflowId) {
        this.workflowGateway.sendNodeStatusUpdate(workflowId, nodeId, NodeStatus.COMPLETED, { result });
    }
  }

  private handleNodeFailed(event: EventPayload) {
    const { nodeId, workflowId, error } = event.data;
    this.nodeStates.set(nodeId, NodeStatus.FAILED);
    if (workflowId) {
        this.workflowGateway.sendNodeStatusUpdate(workflowId, nodeId, NodeStatus.FAILED, { error });
    }
  }

  // --- Device Logic ---
  private updateDevice(event: EventPayload, status: string) {
    const { deviceType, error } = event.data;
    this.deviceStates.set(deviceType, { status, error, timestamp: event.timestamp });
    this.workflowGateway.sendDeviceStatusUpdate(deviceType, { status, error });
  }

  // --- Query Logic ---
  private handleWorkflowQuery(event: EventPayload) {
      const { executionId } = event.data;
      const state = this.workflowStates.get(executionId);
      // 可以通过 EventBus 回复，或者 Controller 直接调用 getWorkflowState 方法
      // 这里仅做逻辑占位
  }

  // Public Accessors (for Controller)
  getWorkflowState(executionId: string) { return this.workflowStates.get(executionId); }
  getAllStates() {
      return {
          nodes: Object.fromEntries(this.nodeStates),
          workflows: Object.fromEntries(this.workflowStates),
          devices: Object.fromEntries(this.deviceStates)
      };
  }
}