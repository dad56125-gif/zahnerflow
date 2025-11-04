import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { BaseDeviceService } from './base-device.service';
import { SimpleEventBus } from '../notification/simple-event-bus.service';
import { ConsoleDisplayManager } from '../common/console-display-manager.service';

@Injectable()
export class ZahnerDeviceService extends BaseDeviceService {
  private readonly timeoutMs = 30000;
  private readonly endpoint: string;

  constructor(
    private readonly httpService: HttpService,
    eventBus: SimpleEventBus,
    private readonly consoleManager: ConsoleDisplayManager,
  ) {
    super(eventBus, 'zahner-zennium');
    this.endpoint = process.env.ZAHNER_FASTAPI_URL || 'http://localhost:8000';
  }

  // 仅健康检查 - 检查 FastAPI 服务是否可用
  async healthCheck(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.endpoint}/health`, {
          timeout: this.timeoutMs,
        })
      );

      return response?.status === 200;
    } catch (error) {
      return false;
    }
  }

  // 连接设备 - 实际连接硬件设备
  async connect(host?: string): Promise<void> {
    this.updateStatus(false, false);

    try {
      // 1. 首先检查 FastAPI 服务是否可用
      const isHealthy = await this.healthCheck();
      if (!isHealthy) {
        throw new Error('FastAPI 服务不可用');
      }

      // 2. 然后调用 /connect 端点实际连接硬件设备
      const connectResponse = await firstValueFrom(
        this.httpService.post(`${this.endpoint}/connect`, {
          host: host || 'localhost'
        }, {
          timeout: this.timeoutMs,
        })
      );

      if (connectResponse?.data?.status === 'success') {
        this.updateStatus(true, false);

        // 发送设备连接事件
        this.eventBus.emit('device.connected', {
          deviceType: 'zahner-zennium',
          endpoint: this.endpoint,
          timestamp: new Date(),
          context: { source: 'zahner-device-service' }
        });
      } else {
        throw new Error(`设备连接失败: ${connectResponse?.data?.error || '未知错误'}`);
      }
    } catch (error) {
      this.updateStatus(false, false, error.message);

      // 发送设备连接失败事件
      this.eventBus.emit('device.error', {
        deviceType: 'zahner-zennium',
        error: error.message,
        endpoint: this.endpoint,
        timestamp: new Date(),
        context: { source: 'zahner-device-service' }
      });

      throw error;
    }
  }

  // 断开连接
  async disconnect(): Promise<void> {
    try {
      // 对于 HTTP API，不需要特别的断开操作
      this.updateStatus(false, false);

      // 发送设备断开事件
      this.eventBus.emit('device.disconnected', {
        deviceType: 'zahner-zennium',
        endpoint: this.endpoint,
        timestamp: new Date(),
        context: { source: 'zahner-device-service' }
      });
    } catch (error) {
      this.updateStatus(false, false, error.message);
      throw error;
    }
  }


  // 执行测量（无通知，返回结构化结果）
  async executeMeasurement(measurementType: string, parameters: Record<string, any>): Promise<any> {
    if (!this.connected) {
      throw new Error(`设备未连接: ${this.deviceType}`);
    }

    try {
      this.updateStatus(true, true); // 设置为忙碌状态

      const response = await firstValueFrom(
        this.httpService.post(`${this.endpoint}/measure`, {
          type: measurementType,
          parameters,
        }, {
          timeout: this.timeoutMs,
        })
      );

      return response?.data;
    } catch (error) {
      throw error;
    } finally {
      this.updateStatus(true, false); // 恢复为非忙碌状态
    }
  }

  // 获取设备选项
  async getDeviceOptions(): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.endpoint}/options`, {
          timeout: this.timeoutMs,
        })
      );

      return response.data;
    } catch (error) {
      this.consoleManager.log('ZahnerDeviceService', 'enableWarn', `获取设备选项失败: ${error.message}`);
      return {
        potentiostat_modes: ['POTMODE_POTENTIOSTATIC', 'POTMODE_GALVANOSTATIC', 'POTMODE_PSEUDOGALVANOSTATIC'],
        scan_directions: ['START_TO_MAX', 'START_TO_MIN'],
        scan_strategies: ['SINGLE_SINE', 'MULTI_SINE'],
        supported_measurements: ['eis_potentiostatic', 'eis_galvanostatic', 'ocp', 'ca', 'cp', 'lsv', 'current_ramp']
      };
    }
  }
}