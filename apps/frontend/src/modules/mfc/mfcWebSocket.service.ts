/**
 * MFC WebSocket 服务
 * 
 * 继承自 BaseWebSocketService，添加质量流量控制器特定的事件处理
 */

import { BaseWebSocketService, BaseCallbacks } from '../common';

// ==================== MFC 专用类型 ====================

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

export interface MfcDeviceDiscovered {
  type: 'device_discovered';
  data: {
    device_address: number;
    gas_type: string;
    max_flow_sccm: number;
    connection_status: 'connected' | 'disconnected';
    last_communication: string;
  };
  timestamp: string;
}

export interface MfcScanProgress {
  type: 'scan_progress';
  data: {
    current: number;
    start: number;
    end: number;
    percent: number;
    found_count: number;
  };
  timestamp: string;
}

// ==================== 回调类型扩展 ====================

interface MfcCallbacks extends BaseCallbacks {
  statusUpdate: ((update: MfcStatusUpdate) => void)[];
  samplingData: ((data: MfcSamplingData) => void)[];
  connectionUpdate: ((update: MfcConnectionUpdate) => void)[];
  deviceDiscovered: ((discovered: MfcDeviceDiscovered) => void)[];
  notification: ((notification: MfcNotification) => void)[];
  scanProgress: ((progress: MfcScanProgress) => void)[];
}

// ==================== 服务实现 ====================

export class MfcWebSocketService extends BaseWebSocketService<MfcCallbacks> {
  constructor(serverUrl: string = window.location.origin) {
    super(serverUrl, {
      deviceName: 'MFC',
      subscribeEvent: 'subscribeToMfc',
      unsubscribeEvent: 'unsubscribeFromMfc',
    });

    // 扩展回调集合
    this.callbacks = {
      ...this.callbacks,
      statusUpdate: [],
      samplingData: [],
      connectionUpdate: [],
      deviceDiscovered: [],
      notification: [],
      scanProgress: [],
    };
  }

  /**
   * 设置 MFC 特定的事件处理器
   */
  protected setupDeviceEventHandlers(): void {
    const socket = this.getSocket();
    if (!socket) return;

    // MFC 连接就绪
    socket.on('mfcConnected', (data) => {
      console.log('MFC WebSocket service ready:', data);
    });

    // 订阅确认
    socket.on('subscribedToMfc', (data) => {
      this.markSubscribed();
      console.log('Subscribed to MFC updates:', data);
    });

    // 取消订阅确认
    socket.on('unsubscribedFromMfc', (data) => {
      this.markUnsubscribed();
      console.log('Unsubscribed from MFC updates:', data);
    });

    // 状态更新
    socket.on('mfcStatusUpdate', (update: MfcStatusUpdate) => {
      this.callbacks.statusUpdate.forEach(cb => cb(update));
    });

    // 采样数据
    socket.on('mfcSamplingData', (data: MfcSamplingData) => {
      this.callbacks.samplingData.forEach(cb => cb(data));
    });

    // 连接状态更新
    socket.on('mfcConnectionUpdate', (update: MfcConnectionUpdate) => {
      this.callbacks.connectionUpdate.forEach(cb => cb(update));
    });

    // 设备发现
    socket.on('mfcDeviceDiscovered', (discovered: MfcDeviceDiscovered) => {
      console.log('MFC device discovered:', discovered);
      this.callbacks.deviceDiscovered.forEach(cb => cb(discovered));
    });

    // 通知
    socket.on('mfcNotification', (notification: MfcNotification) => {
      this.callbacks.notification.forEach(cb => cb(notification));
    });

    // 扫描进度
    socket.on('mfcScanProgress', (progress: MfcScanProgress) => {
      this.callbacks.scanProgress.forEach(cb => cb(progress));
    });

    // 错误
    socket.on('mfcError', (error: unknown) => {
      console.error('MFC error:', error);
      this.callbacks.error.forEach(cb => cb(error));
    });
  }

  // ==================== MFC 专用回调注册 ====================

  onStatusUpdate(callback: (update: MfcStatusUpdate) => void): void {
    this.callbacks.statusUpdate.push(callback);
  }

  onSamplingData(callback: (data: MfcSamplingData) => void): void {
    this.callbacks.samplingData.push(callback);
  }

  onConnectionUpdate(callback: (update: MfcConnectionUpdate) => void): void {
    this.callbacks.connectionUpdate.push(callback);
  }

  onDeviceDiscovered(callback: (discovered: MfcDeviceDiscovered) => void): void {
    this.callbacks.deviceDiscovered.push(callback);
  }

  onNotification(callback: (notification: MfcNotification) => void): void {
    this.callbacks.notification.push(callback);
  }

  onScanProgress(callback: (progress: MfcScanProgress) => void): void {
    this.callbacks.scanProgress.push(callback);
  }

  // ==================== 兼容性方法（旧API） ====================

  /** @deprecated 使用 subscribe() 代替 */
  subscribeToMfc(): void {
    this.subscribe();
  }

  /** @deprecated 使用 unsubscribe() 代替 */
  unsubscribeFromMfc(): void {
    this.unsubscribe();
  }
}

// 创建单例实例
export const mfcWebSocketService = new MfcWebSocketService();