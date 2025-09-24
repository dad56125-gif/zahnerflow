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
import { ElectrochemicalNode, NodeStatus } from '../nodes/types';

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
    // 不在构造函数中自动连接WebSocket，而是在需要时手动连接
  }

  // 调用后端通知API发送通知
  private async sendNotification(
    type: 'info' | 'success' | 'warning' | 'error',
    title: string,
    message: string,
    source: string = 'state-linkage-manager'
  ): Promise<void> {
    try {
      const response = await fetch('http://localhost:3001/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          message,
          type,
          source,
          timestamp: Date.now()
        }),
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        console.error('Failed to send notification:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  // 检测后端服务连接状态
  private async checkBackendServices(): Promise<void> {
    // 检测NestJS后端连接
    try {
      const response = await fetch('http://localhost:3001/health', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
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

    // 检测FastAPI连接
    try {
      const response = await fetch('http://localhost:8000/health', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
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

  // 初始化WebSocket连接
  private initializeWebSocket(): void {
    // 避免重复注册回调
    if (this.isWebSocketInitialized) {
      // 只连接WebSocket，不重新注册回调
      if (!workflowWebSocketService.connected) {
        workflowWebSocketService.connect();
      }
      return;
    }

    // 连接WebSocket（如果尚未连接）
    if (!workflowWebSocketService.connected) {
      workflowWebSocketService.connect();
    }

    // 注册事件回调（只注册一次）
    workflowWebSocketService.onConnected(async () => {
      console.log('WebSocket connected - joining workflow room');

      // 发送WebSocket连接成功通知
      await this.sendNotification('success', 'WebSocket连接成功', '与后端WebSocket服务连接成功', 'websocket-manager');

      // 检测后端服务连接状态
      await this.checkBackendServices();

      if (this.currentWorkflowId) {
        workflowWebSocketService.joinWorkflow(this.currentWorkflowId);
      }
    });

    workflowWebSocketService.onDisconnected(async () => {
      console.log('WebSocket disconnected');

      // 发送WebSocket断开连接通知
      await this.sendNotification('warning', 'WebSocket连接断开', '与后端WebSocket服务连接已断开', 'websocket-manager');
    });

    workflowWebSocketService.onNodeStatusUpdate((update: NodeStatusUpdate) => {
      this.handleNodeStatusUpdate(update);
    });

    workflowWebSocketService.onExecutionUpdate((update: ExecutionUpdate) => {
      this.handleExecutionUpdate(update);
    });

    workflowWebSocketService.onNodeCompleted((completed: NodeCompleted) => {
      this.handleNodeCompleted(completed);
    });

    workflowWebSocketService.onConsoleLog((log: ConsoleLog) => {
      this.handleConsoleLog(log);
    });

  
    // 标记WebSocket已初始化
    this.isWebSocketInitialized = true;
  }

  // 初始化WebSocket连接（公开方法）
  async initialize(): Promise<void> {
    if (!workflowWebSocketService.connected) {
      this.initializeWebSocket();
    }
  }

  // WebSocket是否已初始化
  private isWebSocketInitialized = false;

  // 设置当前工作流
  setCurrentWorkflow(workflowId: string): void {
    this.currentWorkflowId = workflowId;

    if (workflowWebSocketService.connected) {
      workflowWebSocketService.joinWorkflow(workflowId);
    }
  }

  // 设置节点更新回调
  setNodesUpdateCallback(callback: (nodes: ElectrochemicalNode[]) => void): void {
    this.onNodesUpdate = callback;
  }

  // 设置执行状态更新回调
  setExecutionUpdateCallback(callback: (state: ExecutionState) => void): void {
    this.onExecutionUpdate = callback;
  }

  // 设置节点
  setNodes(nodes: ElectrochemicalNode[]): void {
    this.nodes = nodes.map(node => ({
      ...node,
      // 只有当节点状态未定义时才设置为ready，否则保持原有状态
      status: (node.status || 'ready') as NodeStatus,
    }));

    if (this.onNodesUpdate) {
      this.onNodesUpdate(this.nodes);
    }
  }

  // 开始执行
  async startExecution(workflowId: string, nodes: ElectrochemicalNode[]): Promise<void> {
    try {
      this.setCurrentWorkflow(workflowId);
      this.setNodes(nodes);

      // 调用后端API开始执行
      const response = await fetch('http://localhost:3001/api/executions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workflowId
        }),
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      // 初始化执行状态 - 基于后端返回的ExecutionResult结构
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

      if (this.onExecutionUpdate) {
        this.onExecutionUpdate(this.executionState);
      }

    } catch (error) {
      console.error('Failed to start execution:', error);
      
      // 发送执行启动失败通知 - 通过后端通知服务
      // TODO: 调用后端API发送通知，而不是本地处理
    }
  }

  // 暂停执行
  async pauseExecution(executionId: string): Promise<void> {
    try {
      const response = await fetch(`http://localhost:3001/api/executions/${executionId}/pause`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (this.executionState) {
        this.executionState.status = 'paused';
        if (this.onExecutionUpdate) {
          this.onExecutionUpdate(this.executionState);
        }
      }

    } catch (error) {
      console.error('Failed to pause execution:', error);
      
      // 发送暂停执行失败通知 - 通过后端通知服务
      // TODO: 调用后端API发送通知，而不是本地处理
    }
  }

  // 恢复执行
  async resumeExecution(executionId: string): Promise<void> {
    try {
      const response = await fetch(`http://localhost:3001/api/executions/${executionId}/resume`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (this.executionState) {
        this.executionState.status = 'running';
        if (this.onExecutionUpdate) {
          this.onExecutionUpdate(this.executionState);
        }
      }

    } catch (error) {
      console.error('Failed to resume execution:', error);
      
      // 发送恢复执行失败通知 - 通过后端通知服务
      // TODO: 调用后端API发送通知，而不是本地处理
    }
  }

  // 取消执行
  async cancelExecution(executionId: string): Promise<void> {
    try {
      const response = await fetch(`http://localhost:3001/api/executions/${executionId}/cancel`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      // 更新所有未完成的节点为错误状态
      this.nodes = this.nodes.map(node => {
        if (!this.executionState?.completedNodes.includes(node.id)) {
          return { ...node, status: 'error' };
        }
        return node;
      });

      if (this.onNodesUpdate) {
        this.onNodesUpdate(this.nodes);
      }

      // 重置执行状态，通知前端执行已停止
      const workflowId = this.executionState?.workflowId || 'unknown';
      this.executionState = null;
      if (this.onExecutionUpdate) {
        this.onExecutionUpdate({
          executionId,
          workflowId,
          status: 'cancelled',
          currentNode: '',
          completedNodes: [],
          progress: 0,
          startTime: new Date(),
          endTime: new Date(),
          error: 'Cancelled by user'
        });
      }

    } catch (error) {
      console.error('Failed to cancel execution:', error);
      // 即使API调用失败，也重置本地执行状态
      const workflowId = this.executionState?.workflowId || 'unknown';
      this.executionState = null;
      if (this.onExecutionUpdate) {
        this.onExecutionUpdate({
          executionId,
          workflowId,
          status: 'cancelled',
          currentNode: '',
          completedNodes: [],
          progress: 0,
          startTime: new Date(),
          endTime: new Date(),
          error: 'Cancel failed - reset locally'
        });
      }
    }
  }

  // 获取当前节点状态
  getNodes(): ElectrochemicalNode[] {
    return [...this.nodes];
  }

  // 获取当前执行状态
  getExecutionState(): ExecutionState | null {
    return this.executionState;
  }

  // 处理节点状态更新
  private handleNodeStatusUpdate(update: NodeStatusUpdate): void {
    
    // 更新节点状态
    this.nodes = this.nodes.map(node => 
      node.id === update.nodeId ? { ...node, status: update.status } : node
    );
    
    if (this.onNodesUpdate) {
      this.onNodesUpdate(this.nodes);
    }

    // 如果有执行状态，更新当前节点和进度
    if (this.executionState) {
      this.executionState.currentNode = update.nodeId;
      // 这里可以计算进度，简化处理
      if (update.status === 'completed') {
        this.executionState.completedNodes.push(update.nodeId);
        this.executionState.progress = Math.min(100, 
          Math.round((this.executionState.completedNodes.length / this.nodes.length) * 100)
        );
      }
      
      if (this.onExecutionUpdate) {
        this.onExecutionUpdate(this.executionState);
      }
    }
  }

  // 处理执行状态更新
  private handleExecutionUpdate(update: ExecutionUpdate): void {
    
    if (this.executionState && this.executionState.executionId === update.executionId) {
      this.executionState.status = update.status;
      this.executionState.progress = update.progress;
      
      if (this.onExecutionUpdate) {
        this.onExecutionUpdate(this.executionState);
      }
    }
  }

  // 处理节点完成
  private handleNodeCompleted(completed: NodeCompleted): void {
    
    // 更新节点状态为完成
    this.nodes = this.nodes.map(node => 
      node.id === completed.nodeId ? { ...node, status: 'completed' } : node
    );
    
    if (this.onNodesUpdate) {
      this.onNodesUpdate(this.nodes);
    }

    // 更新执行状态
    if (this.executionState) {
      this.executionState.completedNodes.push(completed.nodeId);
      this.executionState.progress = Math.min(100, 
        Math.round((this.executionState.completedNodes.length / this.nodes.length) * 100)
      );
      
      if (this.onExecutionUpdate) {
        this.onExecutionUpdate(this.executionState);
      }
    }
  }

  // 处理console日志
  private handleConsoleLog(log: ConsoleLog): void {
    console.log(`[${log.level.toUpperCase()}] ${log.message}`, log.data);
    
    // 这里可以将console日志添加到通知中心
    // TODO: 实现通知中心的console日志显示
  }

  
  // 清理资源
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

// 创建单例实例
export const stateLinkageManager = new StateLinkageManager();