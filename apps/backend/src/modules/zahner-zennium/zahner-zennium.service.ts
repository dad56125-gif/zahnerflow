import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as WebSocket from 'ws';

import { DeviceStatus, CalibrationResult, ModuleStatus } from '../../interfaces/module-interfaces';
import { EventBus } from '../../notification/event-bus.service';
import { ConsoleDisplayManager } from '../../common/console-display-manager.service';
import { MeasurementType } from '@zahnerflow/types';

@Injectable()
export class ZahnerZenniumService implements OnModuleInit, OnModuleDestroy {
  readonly name = 'zahner-zennium';
  readonly version = '3.0.1'; // Bump version
  readonly dependencies = ['HttpModule'];

  private readonly logger = new Logger(ZahnerZenniumService.name);
  private readonly moduleName = 'ZahnerZenniumService';

  private readonly timeoutMs = 900000;
  private readonly endpoint: string;

  private wsClient: WebSocket | null = null;
  private readonly wsEndpoint: string;
  private wsReconnectTimer: NodeJS.Timeout | null = null;

  private connected = false;
  private busy = false;
  private lastActivity = new Date();
  private error?: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly eventBus: EventBus,
    private readonly consoleManager: ConsoleDisplayManager,
  ) {
    const baseUrl = process.env.ZAHNER_FASTAPI_URL || 'localhost:8000';
    const hostAndPort = baseUrl.replace('http://', '').replace('https://', '');
    this.endpoint = `http://${hostAndPort}`;
    this.wsEndpoint = `ws://${hostAndPort}/ws`;
  }

  async onModuleInit() {
    await this.healthCheck().catch(e =>
      this.log('enableWarn', `FastAPI check failed: ${e.message}`)
    );
    this.connectWebSocket();
  }

  async onModuleDestroy() {
    this.disconnectWebSocket();
    if (this.connected) {
      await this.disconnect().catch(() => {});
    }
  }

  // ==========================================
  // [修复] 缺失的辅助方法 (Controller 依赖)
  // ==========================================

  // Controller 调用的是 health()，这里做个别名
  async health(): Promise<DeviceStatus> {
    const isHealthy = await this.healthCheck();
    return this.getDeviceStatus();
  }

  // Controller 调用 calibrate
  async calibrate(): Promise<CalibrationResult> {
    try {
      // 实际上 Python 代码在 connect 时已经做了校准，
      // 这里我们可以复用 connect，或者如果 Python 有专门的 calibration 测量类型，调用它。
      // 为简单起见，这里假设重新 connect 会触发 calibrateOffsets
      await this.connect('localhost');
      return { 
        success: true, 
        timestamp: new Date(), 
        parameters: { message: 'Calibrated via reconnection' } 
      };
    } catch (e: any) {
      return { 
        success: false, 
        timestamp: new Date(), 
        parameters: {}, 
        error: e.message 
      };
    }
  }

  // Controller 调用 getOptions
  async getDeviceOptions(): Promise<any> {
    try {
      const res = await firstValueFrom(this.httpService.get(`${this.endpoint}/options`));
      return res.data;
    } catch (e) {
      this.log('enableWarn', 'Failed to fetch options from Python');
      return { 
        potentiostat_modes: ['POTMODE_POTENTIOSTATIC', 'POTMODE_GALVANOSTATIC'],
        scan_strategies: ['SINGLE_SINE'] 
      };
    }
  }

  // ==========================================
  // Core Logic (WS & HTTP)
  // ==========================================

  private connectWebSocket() {
    if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) return;

    this.log('enableDebug', `Connecting WS to ${this.wsEndpoint}...`);
    this.wsClient = new WebSocket(this.wsEndpoint);

    this.wsClient.on('open', () => {
      this.log('enableLog', 'WebSocket stream connected to Python Middleware');
      if (this.wsReconnectTimer) {
        clearTimeout(this.wsReconnectTimer);
        this.wsReconnectTimer = null;
      }
    });

    this.wsClient.on('message', (data: WebSocket.Data) => {
      try {
        const payload = JSON.parse(data.toString());
        this.eventBus.emit('device.raw_stream', payload);
      } catch (e) {
        // ignore parse error
      }
    });

    this.wsClient.on('close', () => {
      this.wsClient = null;
      this.wsReconnectTimer = setTimeout(() => this.connectWebSocket(), 5000);
    });
    
    this.wsClient.on('error', () => {});
  }

  private disconnectWebSocket() {
    if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer);
    if (this.wsClient) {
      this.wsClient.removeAllListeners();
      this.wsClient.close();
      this.wsClient = null;
    }
  }

  private updateStatus(connected: boolean, busy?: boolean, error?: string) {
    const oldConnected = this.connected;
    const oldBusy = this.busy;

    this.connected = connected;
    if (busy !== undefined) this.busy = busy;
    if (error !== undefined) this.error = error;
    this.lastActivity = new Date();

    if (oldConnected !== connected || oldBusy !== this.busy) {
      this.eventBus.emit('device.status.changed', {
        deviceType: this.name,
        status: { connected: this.connected, busy: this.busy, error: this.error }
      });
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await firstValueFrom(
        this.httpService.get(`${this.endpoint}/health`, { timeout: 3000 })
      );
      return res?.status === 200;
    } catch {
      return false;
    }
  }

  async connect(host?: string): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.httpService.post(`${this.endpoint}/connect`,
          { host: host || 'localhost' },
          { timeout: 10000 }
        )
      );

      if (res.data?.status === 'success') {
        this.updateStatus(true, false);
        this.eventBus.emit('device.connected', { deviceType: this.name });
      } else {
        throw new Error(res.data?.message || 'Unknown error');
      }
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message;
      this.updateStatus(false, false, msg);
      throw new Error(`Connection Failed: ${msg}`);
    }
  }

  async disconnect(): Promise<void> {
    try {
      await firstValueFrom(this.httpService.post(`${this.endpoint}/disconnect`));
      this.updateStatus(false, false);
      this.eventBus.emit('device.disconnected', { deviceType: this.name });
    } catch (e) {
      // ignore
    }
  }

  async performMeasurement(measurementType: string, parameters: Record<string, any>, nodeId?: string, executionId?: string): Promise<any> {
    if (!this.connected) throw new Error('Zahner device not connected');

    this.updateStatus(true, true);
    this.eventBus.emit('measurement.started', { type: measurementType, nodeId, executionId });

    try {
      this.log('enableLog', `Sending measurement: type=${measurementType}, params=${JSON.stringify(parameters)}`);
      const response = await firstValueFrom(
        this.httpService.post(`${this.endpoint}/measure`, {
          measurement_type: measurementType,
          parameters: parameters,
        }, { timeout: this.timeoutMs })
      );

      const result = response.data;
      if (result.status === 'error') throw new Error(result.error || 'Measurement logic error');

      this.eventBus.emit('measurement.completed', { type: measurementType, result, nodeId });
      return result;

    } catch (error: any) {
      const errMsg = error.response?.data?.error || error.message;
      this.eventBus.emit('measurement.failed', { type: measurementType, error: errMsg, nodeId });
      throw new Error(`Measurement Failed: ${errMsg}`);
    } finally {
      this.updateStatus(true, false); 
    }
  }

  // 适配接口
  async startup(p: any) { await this.connect(p?.host); }
  async shutdown() { await this.disconnect(); }

  async getDeviceStatus(): Promise<DeviceStatus> {
    if (this.connected) {
       const alive = await this.healthCheck();
       if (!alive) this.updateStatus(false, false, 'Middleware lost');
    }
    return {
      connected: this.connected,
      busy: this.busy,
      lastActivity: this.lastActivity,
      capabilities: Object.values(MeasurementType),
      error: this.error
    };
  }
  
  private log(level: 'enableLog' | 'enableError' | 'enableWarn' | 'enableDebug', msg: string) {
    if (this.consoleManager.shouldDisplayLog(this.moduleName, level)) {
      this.consoleManager.log(this.moduleName, level, msg);
    }
  }
}