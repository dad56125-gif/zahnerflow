import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Injectable, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ConsoleDisplayManager } from '../../common/console-display-manager.service';
import { MfcService } from './mfc.service';

/**
 * MFC客户端信息
 */
interface MfcClient {
  id: string;
  socket: Socket;
  connectedAt: Date;
  lastActivity: Date;
  isSubscribedToMfc: boolean;
}

/**
 * MFC状态更新消息
 */
interface MfcStatusUpdateMessage {
  type: 'status_update';
  data: {
    device_address: number;
    flow_sccm: number;
    setpoint_sccm: number;
    gas_type?: string;
    max_flow_sccm?: number;
    connection_status: 'connected' | 'disconnected' | 'connecting' | 'error';
    last_communication: string;
  }[];
  timestamp: string;
}

/**
 * MFC采样数据消息
 */
interface MfcSamplingDataMessage {
  type: 'sampling_data';
  data: {
    device_address: number;
    timestamp: string;
    flow_sccm: number;
    setpoint_sccm: number;
  }[];
  timestamp: string;
}

/**
 * MFC连接状态更新消息
 */
interface MfcConnectionUpdateMessage {
  type: 'connection_update';
  data: {
    status: 'connected' | 'disconnected' | 'connecting' | 'error';
    device_count: number;
    connection_id?: string;
    device_address?: number;
    details?: any;
  };
  timestamp: string;
}

/**
 * MFC通知消息
 */
interface MfcNotificationMessage {
  type: 'notification';
  data: {
    level: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message: string;
    source?: string;
  };
  timestamp: string;
}

/**
 * MFC设备发现消息
 */
interface MfcDeviceDiscoveredMessage {
  type: 'device_discovered';
  data: {
    device_address: number;
    gas_type: string;
    max_flow_sccm: number;
    connection_status: 'connected' | 'disconnected' | 'connecting' | 'error';
    last_communication: string;
  };
  timestamp: string;
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
export class MfcGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer()
  server: Server;

  private readonly clients = new Map<string, MfcClient>();
  // 使用 ConsoleDisplayManager 保持原有日志风格
  private readonly logger = new ConsoleDisplayManager();

  constructor(
    @Inject(forwardRef(() => MfcService))
    private readonly mfcService: MfcService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('MfcGateway', 'enableLog', 'MFC WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log('MfcGateway', 'enableLog', `MFC client connected: ${client.id}`);

    const clientInfo: MfcClient = {
      id: client.id,
      socket: client,
      connectedAt: new Date(),
      lastActivity: new Date(),
      isSubscribedToMfc: false,
    };

    this.clients.set(client.id, clientInfo);

    client.emit('mfcConnected', {
      message: 'Connected to MFC WebSocket Gateway',
      clientId: client.id,
      serverTime: new Date(),
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log('MfcGateway', 'enableLog', `MFC client disconnected: ${client.id}`);

    const clientInfo = this.clients.get(client.id);
    if (clientInfo?.isSubscribedToMfc) {
      this.mfcService.unsubscribe_from_mfc_updates(client.id);
    }

    this.clients.delete(client.id);
  }

  @SubscribeMessage('subscribeToMfc')
  handleSubscribeToMfc(@ConnectedSocket() client: Socket) {
    const clientInfo = this.clients.get(client.id);
    if (!clientInfo) {
      client.emit('error', { message: 'Client not found' });
      return;
    }

    clientInfo.isSubscribedToMfc = true;
    clientInfo.lastActivity = new Date();

    this.mfcService.subscribe_to_mfc_updates(client.id);

    this.logger.log('MfcGateway', 'enableLog', `Client ${client.id} subscribed to MFC updates`);

    client.emit('subscribedToMfc', {
      message: 'Successfully subscribed to MFC updates',
      timestamp: new Date(),
    });
  }

  @SubscribeMessage('unsubscribeFromMfc')
  handleUnsubscribeFromMfc(@ConnectedSocket() client: Socket) {
    const clientInfo = this.clients.get(client.id);
    if (!clientInfo) {
      client.emit('error', { message: 'Client not found' });
      return;
    }

    clientInfo.isSubscribedToMfc = false;
    clientInfo.lastActivity = new Date();

    this.mfcService.unsubscribe_from_mfc_updates(client.id);

    this.logger.log('MfcGateway', 'enableLog', `Client ${client.id} unsubscribed from MFC updates`);

    client.emit('unsubscribedFromMfc', {
      message: 'Successfully unsubscribed from MFC updates',
      timestamp: new Date(),
    });
  }

  // ==================== 广播方法 ====================

  sendMfcStatusUpdate(statusUpdate: MfcStatusUpdateMessage) {
    this.server.emit('mfcStatusUpdate', statusUpdate);
    // 降低日志级别到 debug，避免轮询刷屏
    this.logger.log('MfcGateway', 'enableDebug', `Sent MFC status update`);
  }

  sendMfcSamplingData(samplingData: MfcSamplingDataMessage) {
    this.server.emit('mfcSamplingData', samplingData);
    this.logger.log('MfcGateway', 'enableDebug', `Sent MFC sampling data`);
  }

  sendMfcDeviceDiscovered(deviceDiscovered: MfcDeviceDiscoveredMessage) {
    this.server.emit('mfcDeviceDiscovered', deviceDiscovered);
    this.logger.log('MfcGateway', 'enableDebug', `Sent MFC device discovered: address ${deviceDiscovered.data.device_address}`);
  }

  sendMfcConnectionUpdate(connectionUpdate: MfcConnectionUpdateMessage) {
    this.server.emit('mfcConnectionUpdate', connectionUpdate);
    this.logger.log('MfcGateway', 'enableLog', `Broadcasted MFC connection update: ${connectionUpdate.data.status}`);
  }

  broadcastSystemStatus(systemStatus: any) {
    this.server.emit('mfcSystemStatus', {
      type: 'system_status',
      data: systemStatus,
      timestamp: new Date().toISOString(),
    });
    this.logger.log('MfcGateway', 'enableDebug', `Broadcasted system status`);
  }

  broadcastFlowSetpointChange(deviceAddress: number, oldSccm: number, newSccm: number) {
    this.server.emit('mfcSetpointChange', {
      type: 'setpoint_change',
      data: {
        device_address: deviceAddress,
        old_sccm: oldSccm,
        new_sccm: newSccm,
        timestamp: new Date().toISOString(),
      },
    });
    this.logger.log('MfcGateway', 'enableLog', `Broadcasted setpoint change: ${deviceAddress} ${oldSccm}->${newSccm}`);
  }

  onModuleDestroy(): void {
    this.clients.forEach((client) => client.socket.disconnect());
    this.clients.clear();
  }
}