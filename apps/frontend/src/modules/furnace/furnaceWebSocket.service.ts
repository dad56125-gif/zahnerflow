/**
 * Furnace WebSocket 服务
 * 
 * 继承自 BaseWebSocketService，添加炉温控制器特定的事件处理
 */

import { BaseWebSocketService, BaseCallbacks } from '../common';

// ==================== 炉温专用类型 ====================

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

export interface ProgressData {
  progress: number;
  message?: string;
}

// ==================== 回调类型扩展 ====================

interface FurnaceCallbacks extends BaseCallbacks {
  statusUpdate: ((update: FurnaceStatusUpdate) => void)[];
  samplingData: ((data: FurnaceSamplingData) => void)[];
  notification: ((notification: FurnaceNotification) => void)[];
  readProgress: ((data: ProgressData) => void)[];
  writeProgress: ((data: ProgressData) => void)[];
}

// ==================== 服务实现 ====================

export class FurnaceWebSocketService extends BaseWebSocketService<FurnaceCallbacks> {
  constructor(serverUrl: string = window.location.origin) {
    super(serverUrl, {
      deviceName: 'Furnace',
      subscribeEvent: 'subscribeToFurnace',
      unsubscribeEvent: 'unsubscribeFromFurnace',
    });

    // 扩展回调集合
    this.callbacks = {
      ...this.callbacks,
      statusUpdate: [],
      samplingData: [],
      notification: [],
      readProgress: [],
      writeProgress: [],
    };
  }

  /**
   * 设置炉温特定的事件处理器
   */
  protected setupDeviceEventHandlers(): void {
    const socket = this.getSocket();
    if (!socket) return;

    // 炉温连接就绪
    socket.on('furnaceConnected', (data) => {
      console.log('Furnace WebSocket service ready:', data);
    });

    // 订阅确认
    socket.on('subscribedToFurnace', (data) => {
      this.markSubscribed();
      console.log('Subscribed to furnace updates:', data);
    });

    // 取消订阅确认
    socket.on('unsubscribedFromFurnace', (data) => {
      this.markUnsubscribed();
      console.log('Unsubscribed from furnace updates:', data);
    });

    // 状态更新
    socket.on('furnaceStatusUpdate', (update: FurnaceStatusUpdate) => {
      this.callbacks.statusUpdate.forEach(cb => cb(update));
    });

    // 采样数据
    socket.on('furnaceSamplingData', (data: FurnaceSamplingData) => {
      this.callbacks.samplingData.forEach(cb => cb(data));
    });

    // 通知
    socket.on('furnaceNotification', (notification: FurnaceNotification) => {
      this.callbacks.notification.forEach(cb => cb(notification));
    });

    // 错误
    socket.on('furnaceError', (error: unknown) => {
      console.error('Furnace error:', error);
      this.callbacks.error.forEach(cb => cb(error));
    });

    // 读取进度
    socket.on('furnace:read_progress', (data: ProgressData) => {
      this.callbacks.readProgress.forEach(cb => cb(data));
    });

    // 写入进度
    socket.on('furnace:write_progress', (data: ProgressData) => {
      this.callbacks.writeProgress.forEach(cb => cb(data));
    });
  }

  // ==================== 炉温专用回调注册 ====================

  onStatusUpdate(callback: (update: FurnaceStatusUpdate) => void): void {
    this.callbacks.statusUpdate.push(callback);
  }

  onSamplingData(callback: (data: FurnaceSamplingData) => void): void {
    this.callbacks.samplingData.push(callback);
  }

  onNotification(callback: (notification: FurnaceNotification) => void): void {
    this.callbacks.notification.push(callback);
  }

  onReadProgress(callback: (data: ProgressData) => void): void {
    this.callbacks.readProgress.push(callback);
  }

  onWriteProgress(callback: (data: ProgressData) => void): void {
    this.callbacks.writeProgress.push(callback);
  }

  // ==================== 兼容性方法（旧API） ====================

  /** @deprecated 使用 subscribe() 代替 */
  subscribeToFurnace(): void {
    this.subscribe();
  }

  /** @deprecated 使用 unsubscribe() 代替 */
  unsubscribeFromFurnace(): void {
    this.unsubscribe();
  }
}

// 创建单例实例
export const furnaceWebSocketService = new FurnaceWebSocketService();