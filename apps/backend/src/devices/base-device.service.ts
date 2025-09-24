import { Injectable, Logger } from '@nestjs/common';
import { SimpleEventBus } from '../notification/simple-event-bus.service';

export interface DeviceStatus {
  connected: boolean;
  busy: boolean;
  lastActivity: Date;
  error?: string;
}

@Injectable()
export abstract class BaseDeviceService {
  protected readonly logger: Logger;
  protected connected: boolean = false;
  protected busy: boolean = false;
  protected lastActivity: Date = new Date();
  protected error?: string;

  constructor(
    protected readonly eventBus: SimpleEventBus,
    protected readonly deviceType: string,
  ) {
    this.logger = new Logger(`${deviceType}DeviceService`);
  }

  // 获取设备状态
  getStatus(): DeviceStatus {
    return {
      connected: this.connected,
      busy: this.busy,
      lastActivity: this.lastActivity,
      error: this.error
    };
  }

  // 更新设备状态
  protected updateStatus(connected: boolean, busy?: boolean, error?: string): void {
    const oldConnected = this.connected;
    const oldBusy = this.busy;

    this.connected = connected;
    if (busy !== undefined) this.busy = busy;
    if (error !== undefined) this.error = error;
    this.lastActivity = new Date();

    // 只在状态真正发生变化时才记录日志
    if (oldConnected !== connected || oldBusy !== this.busy) {
      this.logger.log(`设备状态变更: ${this.deviceType} ${oldConnected}→${connected}, ${oldBusy}→${this.busy}`);
    }

    // 发送状态变更事件
    this.eventBus.emit('device.status.changed', {
      deviceType: this.deviceType,
      oldStatus: { connected: oldConnected, busy: oldBusy },
      newStatus: { connected: this.connected, busy: this.busy },
      timestamp: new Date(),
    });
  }

  // 抽象方法：子类实现具体的设备操作
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract healthCheck(): Promise<boolean>;
}