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
  readonly version = '2.5.1'; // Bump version
  readonly dependencies = ['HttpModule'];

  private readonly logger = new Logger(ZahnerZenniumService.name);
  private readonly moduleName = 'ZahnerZenniumService';

  private connected = false;
  private busy = false;
  private lastActivity = new Date();
  private error?: string;

  private readonly timeoutMs = 900000;
  private readonly endpoint: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly eventBus: EventBus,
    private readonly consoleManager: ConsoleDisplayManager,
  ) {
    this.endpoint = process.env.ZAHNER_FASTAPI_URL || 'http://localhost:8000';
  }

  async onModuleInit() {
    await this.healthCheck().catch(e =>
      this.log('enableWarn', `FastAPI 服务检查失败: ${e.message}`)
    );
  }

  async onModuleDestroy() {
    if (this.connected) {
      await this.disconnect().catch(() => {});
    }
  }

  // ---------- 状态管理 ----------

  private updateStatus(connected: boolean, busy?: boolean, error?: string) {
    const oldConnected = this.connected;
    const oldBusy = this.busy;

    this.connected = connected;
    if (busy !== undefined) this.busy = busy;
    if (error !== undefined) this.error = error;
    this.lastActivity = new Date();

    if (oldConnected !== connected || oldBusy !== this.busy) {
      this.logger.log(`Device status change: ${this.name} Conn:${oldConnected}->${connected}, Busy:${oldBusy}->${this.busy}`);
    }

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
    this.log('enableLog', `Connecting to Zahner at ${host || 'localhost'}...`);

    try {
      if (!(await this.healthCheck())) {
        throw new Error(`Zahner Middleware (FastAPI) at ${this.endpoint} is not reachable.`);
      }

      const res = await firstValueFrom(
        this.httpService.post(`${this.endpoint}/connect`,
          { host: host || 'localhost' },
          { timeout: 30000 }
        )
      );

      if (res?.data?.status === 'success') {
        this.updateStatus(true, false);
        this.log('enableLog', 'Connection successful');
        this.eventBus.emit('device.connected', {
          deviceType: 'zahner-zennium',
          endpoint: this.endpoint,
          timestamp: new Date(),
          context: { source: 'zahner-service' }
        });
      } else {
        throw new Error(res?.data?.error || 'Unknown connection error from Python backend');
      }
    } catch (error: any) {
      const errMsg = error.response?.data?.error || error.message;
      this.updateStatus(false, false, errMsg);
      this.log('enableError', `Connection failed: ${errMsg}`);
      
      this.eventBus.emit('device.error', {
        deviceType: 'zahner-zennium',
        error: errMsg,
        timestamp: new Date(),
        context: { source: 'zahner-service' }
      });
      
      // ✅ 关键：必须抛出错误，让上层感知
      throw new Error(`Zahner Connection Error: ${errMsg}`);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    try {
      this.updateStatus(false, false);
      this.log('enableLog', 'Device disconnected');
      this.eventBus.emit('device.disconnected', {
        deviceType: 'zahner-zennium',
        timestamp: new Date(),
        context: { source: 'zahner-service' }
      });
    } catch (error: any) {
      this.log('enableError', `Disconnect failed: ${error.message}`);
    }
  }

  async performMeasurement(measurementType: string, parameters: Record<string, any>, nodeId?: string, executionId?: string): Promise<any> {
    if (!this.connected) {
      // ✅ 关键：未连接直接报错
      throw new Error('Zahner device is NOT connected. Cannot start measurement.');
    }

    this.updateStatus(true, true); // Busy
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
      
      // 检查 Python 端是否返回逻辑错误
      if (result && result.status === 'error') {
         throw new Error(result.error || 'Unknown measurement error');
      }

      this.eventBus.emit('measurement.completed', {
        measurementType, result, parameters, nodeId, executionId, timestamp: new Date(), context: { source: 'zahner-service' }
      });

      return result;

    } catch (error: any) {
      const errMsg = error.response?.data?.error || error.message;
      
      this.eventBus.emit('measurement.failed', {
        measurementType, error: errMsg, parameters, nodeId, executionId, timestamp: new Date(), context: { source: 'zahner-service' }
      });
      
      // ✅ 关键：抛出带具体信息的错误
      throw new Error(`Measurement Failed (${measurementType}): ${errMsg}`);
    } finally {
      this.updateStatus(true, false); // Idle
    }
  }

  // ---------- 适配接口 ----------

  async getDeviceStatus(): Promise<DeviceStatus> {
    if (this.connected) {
        const healthy = await this.healthCheck();
        if (!healthy) this.updateStatus(false, false, 'Connection lost to middleware');
    }
    return {
      connected: this.connected,
      busy: this.busy,
      lastActivity: this.lastActivity,
      capabilities: Object.values(MeasurementType),
      error: this.error
    };
  }

  // ✅ 修复：Explicitly handle startup errors
  async startup(p: any) { 
    try {
      await this.connect(p?.host);
      return { status: 'success' };
    } catch (e: any) {
      // 这里的错会被 ExecutionService 捕获
      throw new Error(`Startup Sequence Failed: ${e.message}`);
    }
  }

  async shutdown() { 
    await this.disconnect();
    return { status: 'success' };
  }

  // ... (Other helpers unchanged)
  async calibrate(): Promise<CalibrationResult> {
    const result = await this.performMeasurement('calibration', {}, 'cal-node', 'cal-exec');
    return { success: result.status === 'success', timestamp: new Date(), parameters: result.data || {} };
  }
  async getDeviceOptions(): Promise<any> {
    try {
      const res = await firstValueFrom(this.httpService.get(`${this.endpoint}/options`));
      return res.data;
    } catch {
      return { potentiostat_modes: ['POTMODE_POTENTIOSTATIC'], supported_measurements: Object.values(MeasurementType) };
    }
  }
  async health() { return this.getDeviceStatus(); }
  async checkConnection() { return this.connected; }
  async getModuleStatus(): Promise<ModuleStatus> {
      return { state: this.connected ? 'running' : 'stopped', health: this.connected ? 'healthy' : 'unhealthy', lastCheck: new Date() };
  }
}