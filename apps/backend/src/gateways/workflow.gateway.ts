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
import { Logger, Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ConsoleDisplayManager } from '../common/console-display-manager.service';

interface ConnectedClient {
  id: string;
  socket: Socket;
  workflowIds: Set<string>;
  connectedAt: Date;
  lastActivity: Date;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@Injectable()
export class WorkflowGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private static instances = 0;
  private static healthInterval: NodeJS.Timeout | null = null;

  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('WorkflowGateway');
  private connectedClients = new Map<string, ConnectedClient>();
  private messageCounter = 0;

  constructor(
    private readonly consoleDisplayManager: ConsoleDisplayManager,
  ) {
    WorkflowGateway.instances++;
    // 不在构造函数中发送通知，等待WebSocket服务器初始化完成
  }

  afterInit(server: Server) {
    this.consoleDisplayManager.log('WorkflowGateway', 'enableLog', 'WebSocket Gateway initialized');

    // 避免重复设置心跳检测
    if (!WorkflowGateway.healthInterval) {
      WorkflowGateway.healthInterval = setInterval(() => {
        this.performHealthCheck();
      }, 30000); // 每30秒检测一次
    }
  }

  handleConnection(client: Socket) {
    this.consoleDisplayManager.log('WorkflowGateway', 'enableLog', `Client connected: ${client.id}`);

    // 记录连接信息
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

    // 客户端连接时立即执行一次健康检查
    this.performHealthCheck();

    // 广播客户端连接事件
    this.broadcast('clientConnected', {
      clientId: client.id,
      totalClients: this.connectedClients.size,
    });

    // 事件驱动架构中，客户端连接事件通过事件总线处理，不需要在这里发送通知
  }

  handleDisconnect(client: Socket) {
    this.consoleDisplayManager.log('WorkflowGateway', 'enableLog', `Client disconnected: ${client.id}`);

    // 清理客户端信息
    const clientInfo = this.connectedClients.get(client.id);
    if (clientInfo) {
      // 移除所有工作流订阅
      clientInfo.workflowIds.forEach(workflowId => {
        client.leave(`workflow:${workflowId}`);
      });

      this.connectedClients.delete(client.id);
    }

    // 广播客户端断开事件
    this.broadcast('clientDisconnected', {
      clientId: client.id,
      totalClients: this.connectedClients.size,
    });

    // 事件驱动架构中，客户端断开事件通过事件总线处理，不需要在这里发送通知
  }

  @SubscribeMessage('joinWorkflow')
  handleJoinWorkflow(@MessageBody() data: { workflowId: string }, @ConnectedSocket() client: Socket) {
    const { workflowId } = data;
    
    // 更新客户端信息
    const clientInfo = this.connectedClients.get(client.id);
    if (clientInfo) {
      clientInfo.workflowIds.add(workflowId);
      clientInfo.lastActivity = new Date();
    }
    
    client.join(`workflow:${workflowId}`);
    this.consoleDisplayManager.log('WorkflowGateway', 'enableLog', `Client ${client.id} joined workflow ${workflowId}`);
    
    client.emit('joinedWorkflow', {
      workflowId,
      message: `Successfully joined workflow ${workflowId}`,
      timestamp: new Date(),
    });
    
    // 发送客户端加入工作流事件
    this.sendToWorkflow(workflowId, 'clientJoinedWorkflow', {
      clientId: client.id,
      workflowId,
    });
  }

  @SubscribeMessage('leaveWorkflow')
  handleLeaveWorkflow(@MessageBody() data: { workflowId: string }, @ConnectedSocket() client: Socket) {
    const { workflowId } = data;
    
    // 更新客户端信息
    const clientInfo = this.connectedClients.get(client.id);
    if (clientInfo) {
      clientInfo.workflowIds.delete(workflowId);
      clientInfo.lastActivity = new Date();
    }
    
    client.leave(`workflow:${workflowId}`);
    this.consoleDisplayManager.log('WorkflowGateway', 'enableLog', `Client ${client.id} left workflow ${workflowId}`);
    
    client.emit('leftWorkflow', {
      workflowId,
      message: `Successfully left workflow ${workflowId}`,
      timestamp: new Date(),
    });
    
    // 发送客户端离开工作流事件
    this.sendToWorkflow(workflowId, 'clientLeftWorkflow', {
      clientId: client.id,
      workflowId,
    });
  }

  // 发送节点状态更新到所有订阅该工作流的客户端
  sendNodeStatusUpdate(workflowId: string, nodeId: string, status: string, data?: any) {
    const message = {
      messageId: this.generateMessageId(),
      workflowId,
      nodeId,
      status,
      data,
      timestamp: new Date(),
    };
    
    this.server.to(`workflow:${workflowId}`).emit('nodeStatusUpdate', message);
    this.consoleDisplayManager.log('WorkflowGateway', 'enableDebug', `Sent node status update: ${workflowId}/${nodeId} -> ${status}`);
  }

  // 发送执行状态更新
  sendExecutionUpdate(workflowId: string, executionId: string, status: string, progress: number) {
    const message = {
      messageId: this.generateMessageId(),
      workflowId,
      executionId,
      status,
      progress,
      timestamp: new Date(),
    };
    
    this.server.to(`workflow:${workflowId}`).emit('executionUpdate', message);
    this.consoleDisplayManager.log('WorkflowGateway', 'enableDebug', `Sent execution update: ${executionId} -> ${status} (${progress}%)`);
  }

  // 发送节点完成事件
  sendNodeCompleted(workflowId: string, nodeId: string, result: any) {
    const message = {
      messageId: this.generateMessageId(),
      workflowId,
      nodeId,
      result,
      timestamp: new Date(),
    };
    
    this.server.to(`workflow:${workflowId}`).emit('nodeCompleted', message);
    this.consoleDisplayManager.log('WorkflowGateway', 'enableDebug', `Sent node completed: ${workflowId}/${nodeId}`);
  }

  // 发送错误消息
  sendError(workflowId: string, error: string) {
    const message = {
      messageId: this.generateMessageId(),
      workflowId,
      error,
      level: 'error',
      timestamp: new Date(),
    };
    
    this.server.to(`workflow:${workflowId}`).emit('error', message);
    this.consoleDisplayManager.log('WorkflowGateway', 'enableError', `Sent error to workflow ${workflowId}: ${error}`);
  }

  // 发送console日志到所有客户端
  sendConsoleLog(level: string, message: string, data?: any) {
    const logMessage = {
      messageId: this.generateMessageId(),
      level,
      message,
      data,
      timestamp: new Date(),
    };
    
    this.server.emit('consoleLog', logMessage);
    this.consoleDisplayManager.log('WorkflowGateway', 'enableDebug', `Sent console log [${level}]: ${message}`);
  }

  // 广播消息到所有客户端
  broadcast(event: string, data: any) {
    const message = {
      messageId: this.generateMessageId(),
      ...data,
      timestamp: new Date(),
    };
    
    this.server.emit(event, message);
    this.consoleDisplayManager.log('WorkflowGateway', 'enableDebug', `Broadcasted event: ${event}`);
  }

  // 新增的增强功能

  /**
   * 发送设备状态更新
   */
  sendDeviceStatusUpdate(deviceName: string, status: any) {
    const message = {
      messageId: this.generateMessageId(),
      deviceName,
      status,
      timestamp: new Date(),
    };
    
    this.broadcast('deviceStatusUpdate', message);
  }

  /**
   * 发送测量数据更新
   */
  sendMeasurementData(workflowId: string, nodeId: string, data: any) {
    const message = {
      messageId: this.generateMessageId(),
      workflowId,
      nodeId,
      data,
      timestamp: new Date(),
    };
    
    this.sendToWorkflow(workflowId, 'measurementData', message);
  }

  /**
   * 发送实时日志
   */
  sendRealtimeLog(workflowId: string, logEntry: {
    level: 'debug' | 'info' | 'warn' | 'error';
    source: string;
    message: string;
    details?: any;
  }) {
    const message = {
      messageId: this.generateMessageId(),
      workflowId,
      ...logEntry,
      timestamp: new Date(),
    };
    
    this.sendToWorkflow(workflowId, 'realtimeLog', message);
  }

  /**
   * 发送进度更新
   */
  sendProgressUpdate(workflowId: string, nodeId: string, progress: {
    current: number;
    total: number;
    percentage: number;
    stage: string;
    eta?: number;
  }) {
    const message = {
      messageId: this.generateMessageId(),
      workflowId,
      nodeId,
      progress,
      timestamp: new Date(),
    };
    
    this.sendToWorkflow(workflowId, 'progressUpdate', message);
  }

  /**
   * 发送系统状态更新
   */
  sendSystemStatus(status: {
    cpu: number;
    memory: number;
    diskSpace: number;
    activeConnections: number;
    activeWorkflows: number;
  }) {
    const message = {
      messageId: this.generateMessageId(),
      status,
      timestamp: new Date(),
    };
    
    this.broadcast('systemStatus', message);
  }

  /**
   * 发送通知到所有客户端 (简化版本)
   */
  sendNotification(title: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', source: string = 'system') {
    const notification = {
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title,
      message,
      type,
      source,
      timestamp: new Date(),
    };
    
    this.broadcast('notification', notification);
    this.consoleDisplayManager.log('WorkflowGateway', 'enableLog', `发送通知: [${type}] ${title}`);
  }

  /**
   * 发送到特定工作流
   */
  private sendToWorkflow(workflowId: string, event: string, data: any) {
    this.server.to(`workflow:${workflowId}`).emit(event, data);
    this.consoleDisplayManager.log('WorkflowGateway', 'enableDebug', `Sent ${event} to workflow ${workflowId}`);
  }

  /**
   * 生成唯一消息ID
   */
  private generateMessageId(): string {
    return `msg_${++this.messageCounter}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 执行健康检查
   */
  private performHealthCheck() {
    const now = new Date();
    const healthData = {
      totalClients: this.connectedClients.size,
      activeWorkflows: this.getActiveWorkflowCount(),
      serverUptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      timestamp: now,
    };
    
  
    // 使用ConsoleDisplayManager控制健康检查日志的输出
    this.consoleDisplayManager.log('WorkflowGateway', 'enableDebug', `Health check: ${JSON.stringify(healthData)}`);

    // 检查非活跃连接
    const inactiveClients: string[] = [];
    for (const [clientId, client] of this.connectedClients) {
      const inactiveTime = now.getTime() - client.lastActivity.getTime();
      if (inactiveTime > 300000) { // 5分钟无活动
        inactiveClients.push(clientId);
      }
    }
    
    // 清理非活跃连接
    inactiveClients.forEach(clientId => {
      const client = this.connectedClients.get(clientId);
      if (client) {
        this.consoleDisplayManager.log('WorkflowGateway', 'enableWarn', `Disconnecting inactive client: ${clientId}`);
        client.socket.disconnect(true);
      }
    });
    
    // 广播健康状态
    this.broadcast('healthCheck', healthData);
  }

  /**
   * 获取活跃工作流数量
   */
  private getActiveWorkflowCount(): number {
    const workflowIds = new Set<string>();
    for (const client of this.connectedClients.values()) {
      client.workflowIds.forEach(id => workflowIds.add(id));
    }
    return workflowIds.size;
  }

  /**
   * 获取连接统计信息
   */
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

  /**
   * 发送自定义事件到特定客户端
   */
  sendToClient(clientId: string, event: string, data: any) {
    const client = this.connectedClients.get(clientId);
    if (client) {
      const message = {
        messageId: this.generateMessageId(),
        ...data,
        timestamp: new Date(),
      };
      
      client.socket.emit(event, message);
      this.consoleDisplayManager.log('WorkflowGateway', 'enableDebug', `Sent ${event} to client ${clientId}`);
      return true;
    }
    return false;
  }

  /**
   * 断开特定客户端
   */
  disconnectClient(clientId: string, reason: string = 'Server request') {
    const client = this.connectedClients.get(clientId);
    if (client) {
      this.consoleDisplayManager.log('WorkflowGateway', 'enableLog', `Disconnecting client ${clientId}: ${reason}`);
      client.socket.emit('forceDisconnect', { reason, timestamp: new Date() });
      client.socket.disconnect(true);
      return true;
    }
    return false;
  }
}