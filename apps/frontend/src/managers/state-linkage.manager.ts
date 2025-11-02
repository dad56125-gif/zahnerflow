/**
 * 工作流状态联动管理器 (State Linkage Manager)
 *
 * 主要职责：
 * 1. 工作流执行控制 - 启动、暂停、恢复、取消工作流执行
 * 2. 节点状态管理 - 管理工作流中各个节点的生命周期和状态变化
 * 3. WebSocket实时通信 - 监听后端的状态更新事件并同步到前端
 * 4. 状态同步和回调 - 为React组件提供实时状态数据和更新回调
 *
 * 应用场景：
 * - 可视化工作流编辑器的状态管理
 * - 工作流执行的实时监控和进度显示
 * - 调试过程中的Console日志输出
 * - 执行错误的捕获和UI反馈
 *
 * 架构位置：
 * - 前端层的状态管理器
 * - 连接后端Execution API和WebSocket Gateway
 * - 为React组件提供统一的状态管理接口
 *
 * 注意事项：
 * - 所有API端点都基于真实后端服务
 * - WebSocket事件通过websocket.service.ts统一处理
 * - 通知功能已移至统一的双发送层架构，避免重复处理
 */

import { workflowWebSocketService, NodeStatusUpdate, ExecutionUpdate, NodeCompleted, ConsoleLog } from '../services/websocket.service';
import { ElectrochemicalNode, NodeStatus } from '../types/nodes';

export interface ExecutionState {
  executionId: string;
  workflowId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  currentNode: string;
  completedNodes: string[];
  progress: number;
  error?: string;
  startTime: Date;
  endTime?: Date;
}

export class StateLinkageManager {
  private nodes: ElectrochemicalNode[] = [];
  private executionState: ExecutionState | null = null;
  private onNodesUpdate: ((nodes: ElectrochemicalNode[]) => void) | null = null;
  private onExecutionUpdate: ((state: ExecutionState) => void) | null = null;
  private currentWorkflowId: string | null = null;

  constructor() {
    // Not in constructor, connect manually when needed
  }

  private async sendNotification(
    type: 'info' | 'success' | 'warning' | 'error',
    title: string,
    message: string,
    source: string = 'state-linkage-manager'
  ): Promise<void> {
    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message, type, source, timestamp: Date.now() }),
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) {
        console.error('Failed to send notification:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  private async checkBackendServices(): Promise<void> {
    try {
      const response = await fetch('/health', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000)
      });
      if (response.ok) {
        await this.sendNotification('success', '后端连接成功', 'NestJS后端服务连接成功', 'nest-backend');
      } else {
        await this.sendNotification('error', '后端连接失败', `NestJS后端服务连接失败: ${response.status} ${response.statusText}`, 'nest-backend');
      }
    } catch (error) {
      await this.sendNotification('error', '后端连接失败', `NestJS后端服务连接失败: ${error instanceof Error ? error.message : '网络错误'}`, 'nest-backend');
    }

    try {
      const response = await fetch('/api/devices/zahner-zennium/health', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000)
      });
      if (response.ok) {
        await this.sendNotification('success', 'FastAPI连接成功', 'Python FastAPI服务连接成功', 'fastapi-backend');
      } else {
        await this.sendNotification('error', 'FastAPI连接失败', `Python FastAPI服务连接失败: ${response.status} ${response.statusText}`, 'fastapi-backend');
      }
    } catch (error) {
      await this.sendNotification('error', 'FastAPI连接失败', `Python FastAPI服务连接失败: ${error instanceof Error ? error.message : '网络错误'}`, 'fastapi-backend');
    }
  }

  private initializeWebSocket(): void {
    if (this.isWebSocketInitialized) {
      if (!workflowWebSocketService.connected) workflowWebSocketService.connect();
      return;
    }
    if (!workflowWebSocketService.connected) workflowWebSocketService.connect();

    workflowWebSocketService.onConnected(async () => {
      console.log('WebSocket connected - joining workflow room');
      await this.sendNotification('success', 'WebSocket连接成功', '与后端WebSocket服务连接成功', 'websocket-manager');
      await this.checkBackendServices();
      if (this.currentWorkflowId) {
        workflowWebSocketService.joinWorkflow(this.currentWorkflowId);
      }
    });

    workflowWebSocketService.onDisconnected(async () => {
      console.log('WebSocket disconnected');
      await this.sendNotification('warning', 'WebSocket连接断开', '与后端WebSocket服务连接已断开', 'websocket-manager');
    });

    workflowWebSocketService.onNodeStatusUpdate(this.handleNodeStatusUpdate.bind(this));
    workflowWebSocketService.onExecutionUpdate(this.handleExecutionUpdate.bind(this));
    workflowWebSocketService.onNodeCompleted(this.handleNodeCompleted.bind(this));
    workflowWebSocketService.onConsoleLog(this.handleConsoleLog.bind(this));

    this.isWebSocketInitialized = true;
  }

  async initialize(): Promise<void> {
    if (!workflowWebSocketService.connected) this.initializeWebSocket();
  }

  private isWebSocketInitialized = false;

  setCurrentWorkflow(workflowId: string): void {
    this.currentWorkflowId = workflowId;
    if (workflowWebSocketService.connected) {
      workflowWebSocketService.joinWorkflow(workflowId);
    }
  }

  setNodesUpdateCallback(callback: (nodes: ElectrochemicalNode[]) => void): void {
    this.onNodesUpdate = callback;
  }

  setExecutionUpdateCallback(callback: (state: ExecutionState) => void): void {
    this.onExecutionUpdate = callback;
  }

  setNodes(nodes: ElectrochemicalNode[]): void {
    this.nodes = nodes.map(node => ({
      ...node,
      status: (node.status || 'ready') as NodeStatus,
    }));
    if (this.onNodesUpdate) this.onNodesUpdate(this.nodes);
  }

  async startExecution(workflowId: string, nodes: ElectrochemicalNode[]): Promise<void> {
    try {
      this.setCurrentWorkflow(workflowId);
      this.setNodes(nodes);

      const response = await fetch('/api/executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId }),
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const result = await response.json();
      this.executionState = {
        executionId: result.executionId,
        workflowId,
        status: result.status === 'success' ? 'running' : 'failed',
        currentNode: '',
        completedNodes: [],
        progress: result.status === 'success' ? 0 : 0,
        startTime: new Date(result.startTime),
        endTime: result.endTime ? new Date(result.endTime) : undefined,
        error: result.error
      };

      if (this.onExecutionUpdate) this.onExecutionUpdate(this.executionState);
    } catch (error) {
      console.error('Failed to start execution:', error);
    }
  }

  async pauseExecution(executionId: string): Promise<void> {
    try {
      const response = await fetch(`/api/executions/${executionId}/pause`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      await response.json(); // Consume body

      if (this.executionState) {
        this.executionState.status = 'paused';
        if (this.onExecutionUpdate) this.onExecutionUpdate(this.executionState);
      }
    } catch (error) {
      console.error('Failed to pause execution:', error);
    }
  }

  async resumeExecution(executionId: string): Promise<void> {
    try {
      const response = await fetch(`/api/executions/${executionId}/resume`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      await response.json(); // Consume body

      if (this.executionState) {
        this.executionState.status = 'running';
        if (this.onExecutionUpdate) this.onExecutionUpdate(this.executionState);
      }
    } catch (error) {
      console.error('Failed to resume execution:', error);
    }
  }

  async cancelExecution(executionId: string): Promise<void> {
    try {
      const response = await fetch(`/api/executions/${executionId}/cancel`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      await response.json(); // Consume body

      this.nodes = this.nodes.map(node => {
        if (!this.executionState?.completedNodes.includes(node.id)) {
          return { ...node, status: 'error' as NodeStatus };
        }
        return node;
      });

      if (this.onNodesUpdate) this.onNodesUpdate(this.nodes);

      const workflowId = this.executionState?.workflowId || 'unknown';
      this.executionState = null;
      if (this.onExecutionUpdate) {
        this.onExecutionUpdate({
          executionId, workflowId, status: 'cancelled', currentNode: '', completedNodes: [],
          progress: 0, startTime: new Date(), endTime: new Date(), error: 'Cancelled by user'
        });
      }
    } catch (error) {
      console.error('Failed to cancel execution:', error);
      const workflowId = this.executionState?.workflowId || 'unknown';
      this.executionState = null;
      if (this.onExecutionUpdate) {
        this.onExecutionUpdate({
          executionId, workflowId, status: 'cancelled', currentNode: '', completedNodes: [],
          progress: 0, startTime: new Date(), endTime: new Date(), error: 'Cancel failed - reset locally'
        });
      }
    }
  }

  getNodes(): ElectrochemicalNode[] {
    return [...this.nodes];
  }

  getExecutionState(): ExecutionState | null {
    return this.executionState;
  }

  private handleNodeStatusUpdate(update: NodeStatusUpdate): void {
    this.nodes = this.nodes.map(node => 
      node.id === update.nodeId ? { ...node, status: update.status as NodeStatus } : node
    );
    if (this.onNodesUpdate) this.onNodesUpdate(this.nodes);

    if (this.executionState) {
      this.executionState.currentNode = update.nodeId;
      if (update.status === 'completed') {
        this.executionState.completedNodes.push(update.nodeId);
        this.executionState.progress = Math.min(100, 
          Math.round((this.executionState.completedNodes.length / this.nodes.length) * 100)
        );
      }
      if (this.onExecutionUpdate) this.onExecutionUpdate(this.executionState);
    }
  }

  private handleExecutionUpdate(update: ExecutionUpdate): void {
    if (this.executionState && this.executionState.executionId === update.executionId) {
      this.executionState.status = update.status;
      this.executionState.progress = update.progress;
      if (this.onExecutionUpdate) this.onExecutionUpdate(this.executionState);
    }
  }

  private handleNodeCompleted(completed: NodeCompleted): void {
    this.nodes = this.nodes.map(node => 
      node.id === completed.nodeId ? { ...node, status: 'completed' as NodeStatus } : node
    );
    if (this.onNodesUpdate) this.onNodesUpdate(this.nodes);

    if (this.executionState) {
      this.executionState.completedNodes.push(completed.nodeId);
      this.executionState.progress = Math.min(100, 
        Math.round((this.executionState.completedNodes.length / this.nodes.length) * 100)
      );
      if (this.onExecutionUpdate) this.onExecutionUpdate(this.executionState);
    }
  }

  private handleConsoleLog(log: ConsoleLog): void {
    console.log(`[${log.level.toUpperCase()}] ${log.message}`, log.data);
  }

  cleanup(): void {
    if (this.currentWorkflowId) {
      workflowWebSocketService.leaveWorkflow(this.currentWorkflowId);
    }
    workflowWebSocketService.disconnect();
    this.nodes = [];
    this.executionState = null;
    this.currentWorkflowId = null;
  }
}

export const stateLinkageManager = new StateLinkageManager();
