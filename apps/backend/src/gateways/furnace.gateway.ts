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
import { FurnaceService } from '../modules/furnace/furnace.service';

interface FurnaceClient {
  id: string;
  socket: Socket;
  connectedAt: Date;
  lastActivity: Date;
  isSubscribedToFurnace: boolean;
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
export class FurnaceGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer()
  server: Server;

  private readonly clients = new Map<string, FurnaceClient>();
  private readonly logger = new ConsoleDisplayManager();

  constructor(
    @Inject(forwardRef(() => FurnaceService))
    private readonly furnaceService: FurnaceService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('FurnaceGateway', 'enableLog', 'Furnace WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log('FurnaceGateway', 'enableLog', `Furnace client connected: ${client.id}`);

    const clientInfo: FurnaceClient = {
      id: client.id,
      socket: client,
      connectedAt: new Date(),
      lastActivity: new Date(),
      isSubscribedToFurnace: false,
    };

    this.clients.set(client.id, clientInfo);

    // 发送欢迎消息
    client.emit('furnaceConnected', {
      message: 'Connected to Furnace WebSocket Gateway',
      clientId: client.id,
      serverTime: new Date(),
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log('FurnaceGateway', 'enableLog', `Furnace client disconnected: ${client.id}`);

    const clientInfo = this.clients.get(client.id);
    if (clientInfo?.isSubscribedToFurnace) {
      // 取消订阅熔炉更新
      this.furnaceService.unsubscribe_from_furnace_updates(client.id);
    }

    this.clients.delete(client.id);
  }

  @SubscribeMessage('subscribeToFurnace')
  handleSubscribeToFurnace(@ConnectedSocket() client: Socket) {
    const clientInfo = this.clients.get(client.id);
    if (!clientInfo) {
      client.emit('error', { message: 'Client not found' });
      return;
    }

    clientInfo.isSubscribedToFurnace = true;
    clientInfo.lastActivity = new Date();

    // 订阅熔炉轮询管理器的更新
    this.furnaceService.subscribe_to_furnace_updates(client.id);

    this.logger.log('FurnaceGateway', 'enableLog', `Client ${client.id} subscribed to furnace updates`);

    client.emit('subscribedToFurnace', {
      message: 'Successfully subscribed to furnace updates',
      timestamp: new Date(),
    });
  }

  @SubscribeMessage('unsubscribeFromFurnace')
  handleUnsubscribeFromFurnace(@ConnectedSocket() client: Socket) {
    const clientInfo = this.clients.get(client.id);
    if (!clientInfo) {
      client.emit('error', { message: 'Client not found' });
      return;
    }

    clientInfo.isSubscribedToFurnace = false;
    clientInfo.lastActivity = new Date();

    // 取消订阅熔炉轮询管理器的更新
    this.furnaceService.unsubscribe_from_furnace_updates(client.id);

    this.logger.log('FurnaceGateway', 'enableLog', `Client ${client.id} unsubscribed from furnace updates`);

    client.emit('unsubscribedFromFurnace', {
      message: 'Successfully unsubscribed from furnace updates',
      timestamp: new Date(),
    });
  }

  /**
   * 发送熔炉状态更新到订阅的客户端
   */
  sendFurnaceStatusUpdate(statusUpdate: any) {
    this.server.emit('furnaceStatusUpdate', statusUpdate);
    this.logger.log('FurnaceGateway', 'enableDebug', `Sent furnace status update`);
  }

  /**
   * 发送熔炉采样数据到订阅的客户端
   */
  sendFurnaceSamplingData(samplingData: any) {
    this.server.emit('furnaceSamplingData', samplingData);
    this.logger.log('FurnaceGateway', 'enableDebug', `Sent furnace sampling data`);
  }

  /**
   * 广播熔炉相关通知
   */
  broadcastFurnaceNotification(notification: {
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message: string;
    source?: string;
  }) {
    const furnaceNotification = {
      id: `furnace_notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      device_name: 'furnace',
      ...notification,
      timestamp: new Date(),
    };

    this.server.emit('furnaceNotification', furnaceNotification);
    this.logger.log('FurnaceGateway', 'enableLog', `Broadcasted furnace notification: [${notification.type}] ${notification.title}`);
  }

  /**
   * 发送熔炉错误到订阅的客户端
   */
  sendFurnaceError(error: string) {
    const errorMessage = {
      device_name: 'furnace',
      error,
      level: 'error',
      timestamp: new Date(),
    };

    this.server.emit('furnaceError', errorMessage);
    this.logger.log('FurnaceGateway', 'enableError', `Sent furnace error: ${error}`);
  }

  /**
   * 获取连接统计信息
   */
  getConnectionStats() {
    const subscribedCount = Array.from(this.clients.values())
      .filter(client => client.isSubscribedToFurnace).length;

    return {
      totalClients: this.clients.size,
      subscribedToFurnace: subscribedCount,
      clientDetails: Array.from(this.clients.values()).map(client => ({
        id: client.id,
        connectedAt: client.connectedAt,
        lastActivity: client.lastActivity,
        isSubscribedToFurnace: client.isSubscribedToFurnace,
      })),
    };
  }

  onModuleDestroy(): void {
    this.logger.log('FurnaceGateway', 'enableLog', 'Furnace WebSocket Gateway destroyed');
  }
}