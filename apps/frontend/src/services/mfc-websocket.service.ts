import { io, Socket } from 'socket.io-client';

// MFC WebSocket消息类型定义（严格按照Parametername.md规范）
export interface MfcStatusUpdate {
  type: 'status_update';
  data: {
    device_address: number;
    flow_sccm: number;
    setpoint_sccm: number;
    gas_type?: string;
    max_flow_sccm?: number;
    connection_status: 'connected' | 'disconnected';
    last_communication: string;
  }[];
  timestamp: string;
}

export interface MfcSamplingData {
  type: 'sampling_data';
  data: {
    device_address: number;
    timestamp: string;
    flow_sccm: number;
    setpoint_sccm: number;
  }[];
  timestamp: string;
}

export interface MfcConnectionUpdate {
  type: 'connection_update';
  data: {
    status: 'connected' | 'disconnected' | 'error';
    device_count: number;
    connection_id?: string;
  };
  timestamp: string;
}

export interface MfcNotification {
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
 * MFC WebSocket服务
 *
 * 提供MFC设备的实时数据推送功能
 * 支持多客户端连接和设备状态同步
 */
export class MfcWebSocketService {
  private socket: Socket | null = null;
  private reconnect_attempts = 0;
  private max_reconnect_attempts = 5;
  private reconnect_delay = 1000;
  private is_connected = false;
  private is_subscribed = false;

  // 回调函数集合
  private callbacks = {
    connected: [] as (() => void)[],
    disconnected: [] as (() => void)[],
    statusUpdate: [] as ((update: MfcStatusUpdate) => void)[],
    samplingData: [] as ((data: MfcSamplingData) => void)[],
    connectionUpdate: [] as ((update: MfcConnectionUpdate) => void)[],
    notification: [] as ((notification: MfcNotification) => void)[],
    error: [] as ((error: any) => void)[],
  };

  constructor(private serverUrl: string = window.location.origin) {}

  /**
   * 连接WebSocket服务器
   */
  connect(): void {
    // 如果socket实例已存在，让socket.io自己处理连接状态
    if (this.socket) {
      return;
    }

    console.log(`Connecting to MFC WebSocket server: ${this.serverUrl}`);

    this.socket = io(this.serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 5000,
      retries: 3,
    });

    this.setupEventHandlers();
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    // 连接事件
    this.socket.on('connect', () => {
      this.is_connected = true;
      this.reconnect_attempts = 0;
      console.log('MFC WebSocket connected');
      this.callbacks.connected.forEach(callback => callback());
    });

    // 断开连接事件
    this.socket.on('disconnect', (reason) => {
      this.is_connected = false;
      this.is_subscribed = false;
      console.log(`MFC WebSocket disconnected: ${reason}`);
      this.callbacks.disconnected.forEach(callback => callback());

      // 尝试重新连接
      if (reason !== 'io client disconnect') {
        this.attemptReconnect();
      }
    });

    // 连接错误事件
    this.socket.on('connect_error', (error) => {
      console.error('MFC WebSocket connection error:', error);
      this.is_connected = false;
      this.callbacks.error.forEach(callback => callback(error));
      this.attemptReconnect();
    });

    // MFC专用事件
    this.socket.on('mfcConnected', (data) => {
      console.log('MFC WebSocket service ready:', data);
    });

    this.socket.on('subscribedToMfc', (data) => {
      this.is_subscribed = true;
      console.log('Subscribed to MFC updates:', data);
    });

    this.socket.on('unsubscribedFromMfc', (data) => {
      this.is_subscribed = false;
      console.log('Unsubscribed from MFC updates:', data);
    });

    // MFC状态更新事件
    this.socket.on('mfcStatusUpdate', (update: MfcStatusUpdate) => {
      this.callbacks.statusUpdate.forEach(callback => callback(update));
    });

    // MFC采样数据事件
    this.socket.on('mfcSamplingData', (data: MfcSamplingData) => {
      this.callbacks.samplingData.forEach(callback => callback(data));
    });

    // MFC连接状态更新事件
    this.socket.on('mfcConnectionUpdate', (update: MfcConnectionUpdate) => {
      this.callbacks.connectionUpdate.forEach(callback => callback(update));
    });

    // MFC通知事件
    this.socket.on('mfcNotification', (notification: MfcNotification) => {
      this.callbacks.notification.forEach(callback => callback(notification));
    });

    // MFC错误事件
    this.socket.on('mfcError', (error: any) => {
      console.error('MFC error:', error);
      this.callbacks.error.forEach(callback => callback(error));
    });

    // 通用错误事件
    this.socket.on('error', (error: any) => {
      console.error('MFC WebSocket error:', error);
      this.callbacks.error.forEach(callback => callback(error));
    });
  }

  /**
   * 尝试重新连接
   */
  private attemptReconnect(): void {
    if (this.reconnect_attempts >= this.max_reconnect_attempts) {
      console.error('Max MFC WebSocket reconnection attempts reached');
      return;
    }

    this.reconnect_attempts++;
    const delay = this.reconnect_delay * Math.pow(2, this.reconnect_attempts - 1);

    console.log(`Attempting MFC WebSocket reconnection ${this.reconnect_attempts}/${this.max_reconnect_attempts} in ${delay}ms`);

    setTimeout(() => {
      if (this.socket && !this.socket.connected) {
        this.connect();
      }
    }, delay);
  }

  /**
   * 订阅MFC更新
   */
  subscribeToMfc(): void {
    if (!this.socket?.connected) {
      console.error('Cannot subscribe to MFC: WebSocket not connected');
      return;
    }

    console.log('Subscribing to MFC updates');
    this.socket.emit('subscribeToMfc');
  }

  /**
   * 取消订阅MFC更新
   */
  unsubscribeFromMfc(): void {
    if (!this.socket?.connected) {
      console.error('Cannot unsubscribe from MFC: WebSocket not connected');
      return;
    }

    console.log('Unsubscribing from MFC updates');
    this.socket.emit('unsubscribeFromMfc');
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.is_connected = false;
      this.is_subscribed = false;
    }
  }

  /**
   * 注册回调函数
   */
  onConnected(callback: () => void): void {
    this.callbacks.connected.push(callback);
  }

  onDisconnected(callback: () => void): void {
    this.callbacks.disconnected.push(callback);
  }

  onStatusUpdate(callback: (update: MfcStatusUpdate) => void): void {
    this.callbacks.statusUpdate.push(callback);
  }

  onSamplingData(callback: (data: MfcSamplingData) => void): void {
    this.callbacks.samplingData.push(callback);
  }

  onConnectionUpdate(callback: (update: MfcConnectionUpdate) => void): void {
    this.callbacks.connectionUpdate.push(callback);
  }

  onNotification(callback: (notification: MfcNotification) => void): void {
    this.callbacks.notification.push(callback);
  }

  onError(callback: (error: any) => void): void {
    this.callbacks.error.push(callback);
  }

  /**
   * 移除回调函数
   */
  removeCallback(callback: (...args: any[]) => void): void {
    Object.keys(this.callbacks).forEach((key) => {
      const index = (this.callbacks as any)[key].indexOf(callback);
      if (index > -1) {
        (this.callbacks as any)[key].splice(index, 1);
      }
    });
  }

  /**
   * 获取连接状态
   */
  get connected(): boolean {
    return this.is_connected;
  }

  /**
   * 获取订阅状态
   */
  get subscribed(): boolean {
    return this.is_subscribed;
  }

  /**
   * 获取Socket实例
   */
  getSocket(): Socket | null {
    return this.socket;
  }
}

// 创建单例实例
export const mfcWebSocketService = new MfcWebSocketService();