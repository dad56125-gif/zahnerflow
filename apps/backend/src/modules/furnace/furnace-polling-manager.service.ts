import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { FurnaceDeviceService } from '../../devices/furnace-device.service';
import { WorkflowGateway } from '../../gateways/workflow.gateway';
import { SamplingService } from '../sampling/sampling.service';

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

@Injectable()
export class FurnacePollingManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FurnacePollingManagerService.name);
  private readonly POLLING_INTERVAL = 2000; // 2秒轮询间隔
  private readonly SAMPLING_INTERVAL = 1000; // 1秒采样间隔
  private readonly RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAY = 1000;

  private pollingTimer: NodeJS.Timeout | null = null;
  private samplingTimer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private isSampling = false;
  private retryCount = 0;
  private lastStatus: any = null;
  private readonly subscribers = new Set<string>(); // WebSocket客户端ID集合

  constructor(
    private readonly furnaceDeviceService: FurnaceDeviceService,
    @Inject(forwardRef(() => WorkflowGateway))
    private readonly workflowGateway: WorkflowGateway,
    private readonly samplingService: SamplingService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Furnace Polling Manager initialized');
  }

  onModuleDestroy(): Promise<void> {
    this.stopPolling();
    this.stopSampling();
    this.logger.log('Furnace Polling Manager destroyed');
    return Promise.resolve();
  }

  /**
   * 订阅熔炉状态更新
   */
  subscribe(clientId: string): void {
    this.subscribers.add(clientId);
    this.logger.log(`Client ${clientId} subscribed to furnace updates`);

    // 如果还没有开始轮询，开始轮询
    if (!this.isPolling) {
      this.startPolling();
    }
  }

  /**
   * 取消订阅熔炉状态更新
   */
  unsubscribe(clientId: string): void {
    this.subscribers.delete(clientId);
    this.logger.log(`Client ${clientId} unsubscribed from furnace updates`);

    // 如果没有订阅者了，停止轮询
    if (this.subscribers.size === 0) {
      this.stopPolling();
      this.stopSampling();
    }
  }

  /**
   * 开始轮询熔炉状态
   */
  private startPolling(): void {
    if (this.isPolling) {
      return;
    }

    this.isPolling = true;
    this.retryCount = 0;
    this.logger.log('Starting furnace status polling');

    // 立即执行一次状态检查
    this.pollFurnaceStatus();

    // 设置定时轮询
    this.pollingTimer = setInterval(() => {
      this.pollFurnaceStatus();
    }, this.POLLING_INTERVAL);
  }

  /**
   * 停止轮询熔炉状态
   */
  private stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.isPolling = false;
    this.logger.log('Stopped furnace status polling');
  }

  /**
   * 开始采样
   */
  private startSampling(): void {
    if (this.isSampling) {
      return;
    }

    this.isSampling = true;
    this.logger.log('Starting furnace sampling');

    this.samplingTimer = setInterval(() => {
      this.sampleFurnaceData();
    }, this.SAMPLING_INTERVAL);
  }

  /**
   * 停止采样
   */
  private stopSampling(): void {
    if (this.samplingTimer) {
      clearInterval(this.samplingTimer);
      this.samplingTimer = null;
    }
    this.isSampling = false;
    this.logger.log('Stopped furnace sampling');
  }

  /**
   * 轮询熔炉状态
   */
  private async pollFurnaceStatus(): Promise<void> {
    try {
      // 检查设备是否忙碌（轮询暂停状态）
      if (this.isDeviceBusy()) {
        this.logger.debug('设备轮询已暂停，跳过本次状态查询');
        return;
      }

      const status = await this.furnaceDeviceService.status();
      const connectionState = await this.getConnectionState();
      const operationState = this.deriveOperationState(status?.status);

      const statusUpdate: FurnaceStatusUpdate = {
        device_name: 'furnace',
        timestamp: new Date().toISOString(),
        status: {
          pv: status?.pv ?? 0,
          sv: status?.sv ?? 0,
          mv: status?.mv ?? 0,
          status: this.normalizeStatus(status?.status),
          segment: status?.segment ?? 0,
          segment_time: status?.segment_time ?? 0,
          segment_time_set: status?.segment_time_set ?? 0,
        },
        connection_state: connectionState,
        operation_state: operationState,
        is_busy: this.isDeviceBusy(),
      };

      // 检查状态是否发生变化
      const hasChanged = this.hasStatusChanged(statusUpdate);

      if (hasChanged || this.retryCount === 0) {
        // 发送状态更新到所有订阅者
        this.broadcastStatusUpdate(statusUpdate);
        this.lastStatus = { ...statusUpdate };
        this.retryCount = 0;
      }

      // 标记设备活跃状态给采样服务
      this.samplingService.mark_device_activity('furnace');

    } catch (error) {
      this.logger.error(`Failed to poll furnace status: ${error.message}`);
      await this.handlePollingError(error);
    }
  }

  /**
   * 采样熔炉数据
   */
  private async sampleFurnaceData(): Promise<void> {
    try {
      // 只有在设备连接且不忙碌时才采样
      if (!await this.isDeviceConnected() || this.isDeviceBusy()) {
        return;
      }

      const status = await this.furnaceDeviceService.status();

      const samplingData: FurnaceSamplingData = {
        device_name: 'furnace',
        timestamp: new Date().toISOString(),
        temperature: status?.pv ?? 0,
        sv: status?.sv ?? 0,
        mv: status?.mv ?? 0,
      };

      // 发送采样数据到采样服务
      await this.samplingService.addFurnaceSample(samplingData);

      // 广播采样数据到所有订阅者
      this.broadcastSamplingData(samplingData);

    } catch (error) {
      this.logger.warn(`Failed to sample furnace data: ${error.message}`);
      // 采样错误不影响轮询，静默处理
    }
  }

  /**
   * 广播状态更新到所有订阅者
   */
  private broadcastStatusUpdate(statusUpdate: FurnaceStatusUpdate): void {
    this.workflowGateway.sendDeviceStatusUpdate('furnace', statusUpdate);
    // 改为info级别，减少debug日志噪音
    this.logger.debug(`Broadcasted furnace status update to ${this.subscribers.size} subscribers`);
  }

  /**
   * 广播采样数据到所有订阅者
   */
  private broadcastSamplingData(samplingData: FurnaceSamplingData): void {
    this.workflowGateway.broadcast('furnaceSamplingData', samplingData);
    this.logger.debug(`Broadcasted furnace sampling data to ${this.subscribers.size} subscribers`);
  }

  /**
   * 获取连接状态
   */
  private async getConnectionState(): Promise<any> {
    try {
      // 这里应该从设备服务获取实际的连接状态
      // 暂时返回模拟状态
      return {
        status: 'connected',
        last_connected: new Date().toISOString(),
        reconnect_attempts: 0,
      };
    } catch {
      return {
        status: 'disconnected',
        reconnect_attempts: 0,
      };
    }
  }

  /**
   * 根据状态字符串推断运行状态
   */
  private deriveOperationState(rawStatus: string): 'idle' | 'running' | 'paused' | 'stopped' {
    const status = String(rawStatus ?? '').toLowerCase();

    if (status === 'run' || status === 'running') {
      return 'running';
    } else if (status === 'pause' || status === 'paused' || status === 'hold') {
      return 'paused';
    } else if (status === 'stop' || status === 'stopped') {
      return 'stopped';
    } else {
      return 'idle';
    }
  }

  /**
   * 规范化状态字符串
   */
  private normalizeStatus(rawStatus: string): string {
    const status = String(rawStatus ?? '').toLowerCase();

    if (status === 'pause' || status === 'paused' || status === 'hold') {
      return 'hold';
    } else if (status === 'run' || status === 'running') {
      return 'run';
    } else if (status === 'stop' || status === 'stopped') {
      return 'stop';
    } else {
      return status || 'unknown';
    }
  }

  /**
   * 检查状态是否发生变化
   */
  private hasStatusChanged(currentStatus: FurnaceStatusUpdate): boolean {
    if (!this.lastStatus) {
      return true;
    }

    return (
      this.lastStatus.status.pv !== currentStatus.status.pv ||
      this.lastStatus.status.sv !== currentStatus.status.sv ||
      this.lastStatus.status.mv !== currentStatus.status.mv ||
      this.lastStatus.status.status !== currentStatus.status.status ||
      this.lastStatus.status.segment !== currentStatus.status.segment ||
      this.lastStatus.connection_state.status !== currentStatus.connection_state.status ||
      this.lastStatus.operation_state !== currentStatus.operation_state
    );
  }

  /**
   * 检查设备是否忙碌
   * 重构后改为从FurnaceControlService获取设备忙碌状态
   * 注意：这里需要注入FurnaceControlService，但由于循环依赖问题，
   * 实际实现中可能需要通过其他方式传递状态
   */
  private isDeviceBusy(): boolean {
    // TODO: 重构后需要从FurnaceControlService获取设备忙碌状态
    // 暂时返回false，避免编译错误
    // 实际实现中可以通过事件总线或共享状态来解决这个问题
    return false;
  }

  /**
   * 检查设备是否连接
   */
  private async isDeviceConnected(): Promise<boolean> {
    try {
      const connectionState = await this.getConnectionState();
      return connectionState.status === 'connected';
    } catch {
      return false;
    }
  }

  /**
   * 处理轮询错误
   */
  private async handlePollingError(error: any): Promise<void> {
    this.retryCount++;

    if (this.retryCount <= this.RETRY_ATTEMPTS) {
      this.logger.warn(`Polling attempt ${this.retryCount} failed, retrying in ${this.RETRY_DELAY}ms`);

      // 发送错误状态到订阅者
      const errorStatus: FurnaceStatusUpdate = {
        device_name: 'furnace',
        timestamp: new Date().toISOString(),
        status: {
          pv: 0,
          sv: 0,
          mv: 0,
          status: 'error',
          segment: 0,
          segment_time: 0,
          segment_time_set: 0,
        },
        connection_state: {
          status: 'disconnected',
          reconnect_attempts: this.retryCount,
        },
        operation_state: 'idle',
        is_busy: false,
      };

      this.broadcastStatusUpdate(errorStatus);

      // 延迟后重试
      setTimeout(() => {
        if (this.isPolling) {
          this.pollFurnaceStatus();
        }
      }, this.RETRY_DELAY * this.retryCount);
    } else {
      this.logger.error(`Polling failed after ${this.RETRY_ATTEMPTS} attempts, stopping polling`);

      // 停止轮询，但保留订阅关系，等待外部重新启动
      this.stopPolling();
      this.stopSampling();

      // 发送最终错误状态
      const finalErrorStatus: FurnaceStatusUpdate = {
        device_name: 'furnace',
        timestamp: new Date().toISOString(),
        status: {
          pv: 0,
          sv: 0,
          mv: 0,
          status: 'disconnected',
          segment: 0,
          segment_time: 0,
          segment_time_set: 0,
        },
        connection_state: {
          status: 'disconnected',
          reconnect_attempts: this.retryCount,
        },
        operation_state: 'idle',
        is_busy: false,
      };

      this.broadcastStatusUpdate(finalErrorStatus);
    }
  }

  /**
   * 获取轮询管理器状态
   */
  getStatus(): {
    is_polling: boolean;
    is_sampling: boolean;
    subscriber_count: number;
    retry_count: number;
    last_update?: string;
  } {
    return {
      is_polling: this.isPolling,
      is_sampling: this.isSampling,
      subscriber_count: this.subscribers.size,
      retry_count: this.retryCount,
      last_update: this.lastStatus?.timestamp,
    };
  }
}