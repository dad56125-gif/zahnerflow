import { io, Socket } from 'socket.io-client';

export interface FurnaceStatusUpdate {
  device_name: string;
  timestamp: string;
  status: {
    pv: number;
    sv: number;
    mv: number;
    status: string;
    segment: number;
    segment_time: number;
    segment_time_set: number;
  };
  connection_state: {
    status: 'connected' | 'disconnected';
    last_connected?: string;
    reconnect_attempts: number;
  };
  operation_state: 'idle' | 'running' | 'paused' | 'stopped';
  is_busy: boolean;
}

export interface FurnaceSamplingData {
  device_name: string;
  timestamp: string;
  temperature: number;
  sv: number;
  mv: number;
}

export interface FurnaceNotification {
  id: string;
  device_name: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  source?: string;
  timestamp: string;
}

export class FurnaceWebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnected = false;
  private isSubscribed = false;

  // 回调函数集合
  private callbacks = {
    connected: [] as (() => void)[],
    disconnected: [] as (() => void)[],
    statusUpdate: [] as ((update: FurnaceStatusUpdate) => void)[],
    samplingData: [] as ((data: FurnaceSamplingData) => void)[],
    notification: [] as ((notification: FurnaceNotification) => void)[],
    error: [] as ((error: any) => void)[],
  };

  constructor(private serverUrl: string = 'http://localhost:3001') {}

  /**
   * 连接WebSocket服务器
   */
  connect(): void {
    // 如果socket实例已存在，让socket.io自己处理连接状态
    if (this.socket) {
      return;
    }

    console.log(`Connecting to Furnace WebSocket server: ${this.serverUrl}`);

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
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log('Furnace WebSocket connected');
      this.callbacks.connected.forEach(callback => callback());
    });

    // 断开连接事件
    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      this.isSubscribed = false;
      console.log(`Furnace WebSocket disconnected: ${reason}`);
      this.callbacks.disconnected.forEach(callback => callback());

      // 尝试重新连接
      if (reason !== 'io client disconnect') {
        this.attemptReconnect();
      }
    });

    // 连接错误事件
    this.socket.on('connect_error', (error) => {
      console.error('Furnace WebSocket connection error:', error);
      this.isConnected = false;
      this.callbacks.error.forEach(callback => callback(error));
      this.attemptReconnect();
    });

    // 熔炉专用事件
    this.socket.on('furnaceConnected', (data) => {
      console.log('Furnace WebSocket service ready:', data);
    });

    this.socket.on('subscribedToFurnace', (data) => {
      this.isSubscribed = true;
      console.log('Subscribed to furnace updates:', data);
    });

    this.socket.on('unsubscribedFromFurnace', (data) => {
      this.isSubscribed = false;
      console.log('Unsubscribed from furnace updates:', data);
    });

    // 熔炉状态更新事件
    this.socket.on('furnaceStatusUpdate', (update: FurnaceStatusUpdate) => {
      this.callbacks.statusUpdate.forEach(callback => callback(update));
    });

    // 熔炉采样数据事件
    this.socket.on('furnaceSamplingData', (data: FurnaceSamplingData) => {
      this.callbacks.samplingData.forEach(callback => callback(data));
    });

    // 熔炉通知事件
    this.socket.on('furnaceNotification', (notification: FurnaceNotification) => {
      this.callbacks.notification.forEach(callback => callback(notification));
    });

    // 熔炉错误事件
    this.socket.on('furnaceError', (error: any) => {
      console.error('Furnace error:', error);
      this.callbacks.error.forEach(callback => callback(error));
    });

    // 通用错误事件
    this.socket.on('error', (error: any) => {
      console.error('Furnace WebSocket error:', error);
      this.callbacks.error.forEach(callback => callback(error));
    });
  }

  /**
   * 尝试重新连接
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max furnace WebSocket reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Attempting furnace WebSocket reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

    setTimeout(() => {
      if (this.socket && !this.socket.connected) {
        this.connect();
      }
    }, delay);
  }

  /**
   * 订阅熔炉更新
   */
  subscribeToFurnace(): void {
    if (!this.socket?.connected) {
      console.error('Cannot subscribe to furnace: WebSocket not connected');
      return;
    }

    console.log('Subscribing to furnace updates');
    this.socket.emit('subscribeToFurnace');
  }

  /**
   * 取消订阅熔炉更新
   */
  unsubscribeFromFurnace(): void {
    if (!this.socket?.connected) {
      console.error('Cannot unsubscribe from furnace: WebSocket not connected');
      return;
    }

    console.log('Unsubscribing from furnace updates');
    this.socket.emit('unsubscribeFromFurnace');
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.isSubscribed = false;
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

  onStatusUpdate(callback: (update: FurnaceStatusUpdate) => void): void {
    this.callbacks.statusUpdate.push(callback);
  }

  onSamplingData(callback: (data: FurnaceSamplingData) => void): void {
    this.callbacks.samplingData.push(callback);
  }

  onNotification(callback: (notification: FurnaceNotification) => void): void {
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
    return this.isConnected;
  }

  /**
   * 获取订阅状态
   */
  get subscribed(): boolean {
    return this.isSubscribed;
  }

  /**
   * 获取Socket实例
   */
  getSocket(): Socket | null {
    return this.socket;
  }
}

// 创建单例实例
export const furnaceWebSocketService = new FurnaceWebSocketService();