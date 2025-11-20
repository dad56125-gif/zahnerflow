import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { DeviceStatus, CalibrationResult, ModuleStatus } from '../../interfaces/module-interfaces';
import { EventBus } from '../../notification/event-bus.service';
import { ConsoleDisplayManager } from '../../common/console-display-manager.service';
import { MeasurementType } from '@zahnerflow/types';

@Injectable()
export class ZahnerZenniumService implements OnModuleInit, OnModuleDestroy {
  readonly name = 'zahner-zennium';
  readonly version = '2.5.0';
  readonly dependencies = ['HttpModule'];

  private readonly logger = new Logger(ZahnerZenniumService.name);
  private readonly moduleName = 'ZahnerZenniumService';

  // 状态管理 (原 BaseDeviceService 的功能)
  private connected = false;
  private busy = false;
  private lastActivity = new Date();
  private error?: string;

  // 配置
  private readonly timeoutMs = 900000; // 15分钟
  private readonly endpoint: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly eventBus: EventBus,
    private readonly consoleManager: ConsoleDisplayManager,
  ) {
    this.endpoint = process.env.ZAHNER_FASTAPI_URL || 'http://localhost:8000';
  }

  async onModuleInit() {
    // 启动时仅做健康检查，不自动连接
    await this.healthCheck().catch(e =>
      this.log('enableWarn', `FastAPI 服务检查失败: ${e.message}`)
    );
  }

  async onModuleDestroy() {
    if (this.connected) {
      await this.disconnect().catch(() => {});
    }
  }

  // ---------- 状态管理辅助方法 ----------

  private updateStatus(connected: boolean, busy?: boolean, error?: string) {
    const oldConnected = this.connected;
    const oldBusy = this.busy;

    this.connected = connected;
    if (busy !== undefined) this.busy = busy;
    if (error !== undefined) this.error = error;
    this.lastActivity = new Date();

    // 只在状态真正发生变化时才记录日志
    if (oldConnected !== connected || oldBusy !== this.busy) {
      this.logger.log(`设备状态变化 ${this.name} ${oldConnected}->${connected}, ${oldBusy}->${this.busy}`);
    }

    // 发送状态变更事件
    this.eventBus.emit('device.status.changed', {
      deviceType: this.name,
      oldStatus: { connected: oldConnected, busy: oldBusy },
      newStatus: { connected: this.connected, busy: this.busy },
      timestamp: new Date(),
    });
  }

  private log(level: 'enableLog' | 'enableError' | 'enableWarn', msg: string) {
    if (this.consoleManager.shouldDisplayLog(this.moduleName, level)) {
      this.consoleManager.log(this.moduleName, level, msg);
    }
  }

  // ---------- 核心功能 ----------

  async healthCheck(): Promise<boolean> {
    try {
      const res = await firstValueFrom(
        this.httpService.get(`${this.endpoint}/health`, { timeout: 5000 })
      );
      return res?.status === 200;
    } catch {
      return false;
    }
  }

  async connect(host?: string): Promise<void> {
    this.log('enableLog', '正在连接 Zahner 设备...');

    try {
      // 1. 检查 FastAPI
      if (!(await this.healthCheck())) throw new Error('FastAPI 服务不可用');

      // 2. 连接硬件
      const res = await firstValueFrom(
        this.httpService.post(`${this.endpoint}/connect`,
          { host: host || 'localhost' },
          { timeout: 30000 }
        )
      );

      if (res?.data?.status === 'success') {
        this.updateStatus(true, false);
        this.log('enableLog', '设备连接成功');
        this.eventBus.emit('device.connected', {
          deviceType: 'zahner-zennium',
          endpoint: this.endpoint,
          timestamp: new Date(),
          context: { source: 'zahner-service' }
        });
      } else {
        throw new Error(res?.data?.error || '未知错误');
      }
    } catch (error: any) {
      this.updateStatus(false, false, error.message);
      this.log('enableError', `连接失败: ${error.message}`);
      this.eventBus.emit('device.error', {
        deviceType: 'zahner-zennium',
        error: error.message,
        endpoint: this.endpoint,
        timestamp: new Date(),
        context: { source: 'zahner-service' }
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    try {
      // HTTP 无状态，主要更新本地状态
      this.updateStatus(false, false);
      this.log('enableLog', '设备已断开');
      this.eventBus.emit('device.disconnected', {
        deviceType: 'zahner-zennium',
        timestamp: new Date(),
        context: { source: 'zahner-service' }
      });
    } catch (error: any) {
      this.log('enableError', `断开失败: ${error.message}`);
    }
  }

  // 执行测量
  async performMeasurement(measurementType: string, parameters: Record<string, any>, nodeId?: string, executionId?: string): Promise<any> {
    if (!this.connected) throw new Error('设备未连接');

    this.updateStatus(true, true); // Set Busy
    this.eventBus.emit('measurement.started', {
      measurementType, parameters, nodeId, executionId, timestamp: new Date(), context: { source: 'zahner-service' }
    });

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.endpoint}/measure`, {
          measurement_type: measurementType,
          parameters,
        }, { timeout: this.timeoutMs })
      );

      const result = response?.data;

      this.eventBus.emit('measurement.completed', {
        measurementType, result, parameters, nodeId, executionId, timestamp: new Date(), context: { source: 'zahner-service' }
      });

      return result;
    } catch (error: any) {
      this.eventBus.emit('measurement.failed', {
        measurementType, error: error.message, parameters, nodeId, executionId, timestamp: new Date(), context: { source: 'zahner-service' }
      });
      throw error;
    } finally {
      this.updateStatus(true, false); // Clear Busy
    }
  }

  // ---------- 辅助接口 ----------

  async getDeviceStatus(): Promise<DeviceStatus> {
    // 实时检查一次健康状况
    if (this.connected) {
        const healthy = await this.healthCheck();
        if (!healthy) this.updateStatus(false, false, '连接丢失');
    }

    return {
      connected: this.connected,
      busy: this.busy,
      lastActivity: this.lastActivity,
      capabilities: Object.values(MeasurementType),
      error: this.error
    };
  }

  async calibrate(): Promise<CalibrationResult> {
    const result = await this.performMeasurement('calibration', {}, 'cal-node', 'cal-exec');
    return {
      success: result.status === 'success',
      timestamp: new Date(),
      parameters: result.data || {}
    };
  }

  async getDeviceOptions(): Promise<any> {
    try {
      const res = await firstValueFrom(this.httpService.get(`${this.endpoint}/options`));
      return res.data;
    } catch {
      return {
        potentiostat_modes: ['POTMODE_POTENTIOSTATIC'], // Fallback
        supported_measurements: Object.values(MeasurementType)
      };
    }
  }

  // 兼容旧接口
  async health() { return this.getDeviceStatus(); }
  async startup(p: any) { return this.connect(p?.host).then(() => ({ status: 'success' })); }
  async shutdown() { return this.disconnect().then(() => ({ status: 'success' })); }
  async checkConnection() { return this.connected; }
  async getModuleStatus(): Promise<ModuleStatus> {
      return {
          state: this.connected ? 'running' : 'stopped',
          health: this.connected ? 'healthy' : 'unhealthy',
          lastCheck: new Date()
      };
  }
}