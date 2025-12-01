import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Injectable, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ConsoleDisplayManager } from '../common/console-display-manager.service';
// --- 【新增】导入 ExecutionService 和 EventBus ---
import { ExecutionService, ExecutionSnapshot } from '../modules/execution/execution.service';
import { EventBus } from '../notification/event-bus.service';

interface ConnectedClient {
  id: string;
  socket: Socket;
  workflowIds: Set<string>;
  connectedAt: Date;
  lastActivity: Date;
}

@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:8083',
      'http://localhost:4173',
      'http://localhost:3000',
      'http://127.0.0.1:8083',
    ],
    credentials: true,
  },
})
@Injectable()
export class WorkflowGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  private static instances = 0;

  @WebSocketServer()
  server: Server;

  private connectedClients = new Map<string, ConnectedClient>();
  private messageCounter = 0;

  constructor(
    private readonly consoleDisplayManager: ConsoleDisplayManager,
    // --- 【新增】注入 EventBus 和 ExecutionService ---
    private readonly eventBus: EventBus,
    @Inject(forwardRef(() => ExecutionService))
    private readonly executionService: ExecutionService,
  ) {
    WorkflowGateway.instances++;
  }

  afterInit(server: Server) {
    this.consoleDisplayManager.log('WorkflowGateway', 'enableLog', 'WebSocket Gateway initialized');

    // --- 【关键】监听系统状态变更，广播给所有客户端 ---
    this.eventBus.on('execution.state.changed').subscribe((event) => {
      // event.data 就是 ExecutionSnapshot
      this.broadcastSystemSnapshot(event.data);
    });

    // --- 【新增】监听节点重置事件，广播给所有客户端 ---
    this.eventBus.on('execution.nodes.reset').subscribe((event) => {
      this.consoleDisplayManager.log('WorkflowGateway', 'enableDebug', `Broadcasting node reset: ${event.data.targetStatus}`);
      this.broadcastNodesReset(event.data);
    });

  }

  handleConnection(client: Socket) {
    this.consoleDisplayManager.log('WorkflowGateway', 'enableLog', `Client connected: ${client.id}`);

    const clientInfo: ConnectedClient = {
      id: client.id,
      socket: client,
      workflowIds: new Set(),
      connectedAt: new Date(),
      lastActivity: new Date(),
    };

    this.connectedClients.set(client.id, clientInfo);

    // 发送欢迎消息
    client.emit('connected', {
      message: 'Welcome to ZahnerFlow WebSocket Gateway',
      clientId: client.id,
      serverTime: new Date(),
      connectedClients: this.connectedClients.size,
    });

    // --- 【关键】连接建立后，立即推送当前的“唯一真理” ---
    try {
      const currentSnapshot = this.executionService.getExecutionSnapshot();
      client.emit('systemStateSnapshot', currentSnapshot);
      this.consoleDisplayManager.log('WorkflowGateway', 'enableDebug', `Sent initial snapshot to ${client.id} (Status: ${currentSnapshot.status})`);
    } catch (error) {
      this.consoleDisplayManager.log('WorkflowGateway', 'enableError', `Failed to send initial snapshot: ${error}`);
    }

    this.performHealthCheck();
    this.broadcast('clientConnected', { clientId: client.id, totalClients: this.connectedClients.size });
  }

  // --- 【新增】全量广播方法 ---
  broadcastSystemSnapshot(snapshot: ExecutionSnapshot) {
    // 广播事件名为 systemStateSnapshot，前端 Store 监听这个事件即可
    this.server.emit('systemStateSnapshot', snapshot);
    // 降低日志频率，仅在非 running 状态或有错误时打印详细日志，避免刷屏
    if (snapshot.status !== 'running') {
      this.consoleDisplayManager.log('WorkflowGateway', 'enableDebug', `Broadcasted system state: ${snapshot.status}`);
    }
  }

  // --- 【新增】节点重置广播方法 ---
  broadcastNodesReset(resetEvent: { targetStatus: string; timestamp: Date; message: string }) {
    // 广播节点重置事件，前端监听此事件来重置所有节点状态
    this.server.emit('nodesReset', {
      targetStatus: resetEvent.targetStatus,
      timestamp: resetEvent.timestamp,
      message: resetEvent.message
    });

    this.consoleDisplayManager.log('WorkflowGateway', 'enableDebug', `Broadcasted nodes reset: ${resetEvent.targetStatus}`);
  }

  handleDisconnect(client: Socket) {
    this.consoleDisplayManager.log('WorkflowGateway', 'enableLog', `Client disconnected: ${client.id}`);
    const clientInfo = this.connectedClients.get(client.id);
    if (clientInfo) {
      clientInfo.workflowIds.forEach(workflowId => {
        client.leave(`workflow:${workflowId}`);
      });
      this.connectedClients.delete(client.id);
    }
    this.broadcast('clientDisconnected', { clientId: client.id, totalClients: this.connectedClients.size });
  }

  // ... (SubscribeMessage join/leave 保持原样) ...
  @SubscribeMessage('joinWorkflow')
  handleJoinWorkflow(@MessageBody() data: { workflowId: string }, @ConnectedSocket() client: Socket) {
    const { workflowId } = data;
    const clientInfo = this.connectedClients.get(client.id);
    if (clientInfo) {
      clientInfo.workflowIds.add(workflowId);
      clientInfo.lastActivity = new Date();
    }
    client.join(`workflow:${workflowId}`);
    client.emit('joinedWorkflow', { workflowId, message: `Successfully joined workflow ${workflowId}`, timestamp: new Date() });
  }

  @SubscribeMessage('leaveWorkflow')
  handleLeaveWorkflow(@MessageBody() data: { workflowId: string }, @ConnectedSocket() client: Socket) {
    const { workflowId } = data;
    const clientInfo = this.connectedClients.get(client.id);
    if (clientInfo) {
      clientInfo.workflowIds.delete(workflowId);
      clientInfo.lastActivity = new Date();
    }
    client.leave(`workflow:${workflowId}`);
    client.emit('leftWorkflow', { workflowId, message: `Successfully left workflow ${workflowId}`, timestamp: new Date() });
  }

  // ... (保留旧的 sendNodeStatusUpdate 等方法以兼容尚未重构的前端部分，或用于详细日志显示) ...
  
  sendNodeStatusUpdate(workflowId: string, nodeId: string, status: string, data?: any) {
    const message = {
      messageId: this.generateMessageId(),
      workflowId,
      nodeId,
      status,
      data: { ...data, executionId: undefined, nodeType: data?.nodeType, error: data?.error, result: data?.result },
      timestamp: new Date(),
    };
    this.server.to(`workflow:${workflowId}`).emit('nodeStatusUpdate', message);
  }

  sendExecutionUpdate(workflowId: string, executionId: string, status: string, progress: number) {
    // ⚠️ 注意：前端应该主要依赖 systemStateSnapshot，这个方法仅用于兼容旧逻辑或显示进度条
    const message = {
      messageId: this.generateMessageId(),
      workflowId,
      status,
      progress,
      timestamp: new Date(),
    };
    this.server.to(`workflow:${workflowId}`).emit('executionUpdate', message);
  }

  sendNodeCompleted(workflowId: string, nodeId: string, result: any) {
    const message = { messageId: this.generateMessageId(), workflowId, nodeId, result, timestamp: new Date() };
    this.server.to(`workflow:${workflowId}`).emit('nodeCompleted', message);
  }

  sendError(workflowId: string, error: string) {
    const message = { messageId: this.generateMessageId(), workflowId, error, level: 'error', timestamp: new Date() };
    this.server.to(`workflow:${workflowId}`).emit('error', message);
  }

  sendConsoleLog(level: string, message: string, data?: any) {
    const logMessage = { messageId: this.generateMessageId(), level, message, data, timestamp: new Date() };
    this.server.emit('consoleLog', logMessage);
  }

  broadcast(event: string, data: any) {
    const message = { messageId: this.generateMessageId(), ...data, timestamp: new Date() };
    this.server.emit(event, message);
  }

  // ... (其余辅助方法保持原样) ...
  
  sendDeviceStatusUpdate(deviceName: string, status: any) {
    const message = { messageId: this.generateMessageId(), deviceName, status, timestamp: new Date() };
    this.broadcast('deviceStatusUpdate', message);
  }
  
  sendMeasurementData(workflowId: string, nodeId: string, data: any) {
    const message = { messageId: this.generateMessageId(), workflowId, nodeId, data, timestamp: new Date() };
    this.sendToWorkflow(workflowId, 'measurementData', message);
  }

  sendRealtimeLog(workflowId: string, logEntry: any) {
    const message = { messageId: this.generateMessageId(), workflowId, ...logEntry, timestamp: new Date() };
    this.sendToWorkflow(workflowId, 'realtimeLog', message);
  }
  
  // ... (sendProgressUpdate, sendSystemStatus, sendNotification 保持原样) ...
  sendNotification(title: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', source: string = 'system') {
      const notification = {
        id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title, message, type, source, timestamp: new Date(),
      };
      this.broadcast('notification', notification);
  }

  private sendToWorkflow(workflowId: string, event: string, data: any) {
    this.server.to(`workflow:${workflowId}`).emit(event, data);
  }

  private generateMessageId(): string {
    return `msg_${++this.messageCounter}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private performHealthCheck() {
    const now = new Date();
    const healthData = {
      totalClients: this.connectedClients.size,
      activeWorkflows: this.getActiveWorkflowCount(),
      serverUptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      timestamp: now,
    };
    this.consoleDisplayManager.log('WorkflowGateway', 'enableDebug', `Health check: ${JSON.stringify(healthData)}`);
    this.broadcast('healthCheck', healthData);
  }

  onModuleDestroy() {}

  private getActiveWorkflowCount(): number {
    const workflowIds = new Set<string>();
    for (const client of this.connectedClients.values()) {
      client.workflowIds.forEach(id => workflowIds.add(id));
    }
    return workflowIds.size;
  }
  
  // ... (getConnectionStats, updateClientActivity, sendToClient, disconnectClient 保持原样) ...
  getConnectionStats() {
      return {
        totalClients: this.connectedClients.size,
        activeWorkflows: this.getActiveWorkflowCount(),
        clientDetails: Array.from(this.connectedClients.values()).map(client => ({
          id: client.id,
          connectedAt: client.connectedAt,
          lastActivity: client.lastActivity,
          workflowCount: client.workflowIds.size,
        })),
      };
  }
  
  updateClientActivity(clientId: string) {
      const client = this.connectedClients.get(clientId);
      if (client) client.lastActivity = new Date();
  }
  
  sendToClient(clientId: string, event: string, data: any) {
      const client = this.connectedClients.get(clientId);
      if (client) {
          this.updateClientActivity(clientId);
          const message = { messageId: this.generateMessageId(), ...data, timestamp: new Date() };
          client.socket.emit(event, message);
          return true;
      }
      return false;
  }
  
  disconnectClient(clientId: string, reason: string = 'Server request') {
      const client = this.connectedClients.get(clientId);
      if (client) {
          client.socket.emit('forceDisconnect', { reason, timestamp: new Date() });
          client.socket.disconnect(true);
          return true;
      }
      return false;
  }
}