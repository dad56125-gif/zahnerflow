import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as WebSocket from 'ws';

import { DeviceStatus, CalibrationResult, ModuleStatus } from '../../interfaces/module-interfaces';
import { EventBus } from '../../notification/event-bus.service';
import { ConsoleDisplayManager } from '../../common/console-display-manager.service';
import { MeasurementType } from '@zahnerflow/types';

interface BatteryHealthResult {
  status: 'healthy' | 'warning';
  avgVoltage: number;
  deviation: number;
  issues: string[];
}

@Injectable()
export class ZahnerZenniumService implements OnModuleInit, OnModuleDestroy {
  readonly name = 'zahner-zennium';
  readonly version = '3.1.0'; // 新增模拟器模式支持
  readonly dependencies = ['HttpModule'];

  private readonly logger = new Logger(ZahnerZenniumService.name);
  private readonly moduleName = 'ZahnerZenniumService';

  // 三段式超时配置
  private readonly warningThreshold1 = 600000;   // 10分钟：第一次警告
  private readonly warningThreshold2 = 1200000;  // 20分钟：第二次警告
  private readonly failureTimeout = 1800000;     // 30分钟：最终失败
  private readonly connectTimeout = 30000;       // 连接超时：30秒
  private readonly healthCheckTimeout = 10000;   // 健康检查：10秒
  private readonly realEndpoint: string;
  private readonly realWsEndpoint: string;
  private readonly simulatorEndpoint: string;
  private readonly simulatorWsEndpoint: string;

  private wsClient: WebSocket | null = null;
  private wsReconnectTimer: NodeJS.Timeout | null = null;

  private connected = false;
  private busy = false;
  private lastDataReceived: number = 0;  // 无响应超时追踪
  private voltageBuffer: number[] = [];  // ✅ 电池健康检测数据缓存
  private lastActivity = new Date();
  private error?: string;

  // 设备模式: 'real' = 真实Zahner设备, 'simulator' = 模拟器
  private deviceMode: 'real' | 'simulator' = 'real';

  // 动态端点选择
  private get activeEndpoint(): string {
    return this.deviceMode === 'simulator' ? this.simulatorEndpoint : this.realEndpoint;
  }

  private get activeWsEndpoint(): string {
    return this.deviceMode === 'simulator' ? this.simulatorWsEndpoint : this.realWsEndpoint;
  }

  // 兼容性别名
  private get endpoint(): string {
    return this.activeEndpoint;
  }

  private get wsEndpoint(): string {
    return this.activeWsEndpoint;
  }

  constructor(
    private readonly httpService: HttpService,
    private readonly eventBus: EventBus,
    private readonly consoleManager: ConsoleDisplayManager,
  ) {
    // 真实设备端点
    const realUrl = process.env.ZAHNER_FASTAPI_URL || 'localhost:8000';
    const realHostPort = realUrl.replace('http://', '').replace('https://', '');
    this.realEndpoint = `http://${realHostPort}`;
    this.realWsEndpoint = `ws://${realHostPort}/ws`;

    // 模拟器端点
    const simUrl = process.env.ZAHNER_SIMULATOR_URL || 'localhost:8001';
    const simHostPort = simUrl.replace('http://', '').replace('https://', '');
    this.simulatorEndpoint = `http://${simHostPort}`;
    this.simulatorWsEndpoint = `ws://${simHostPort}/ws`;

    // 从环境变量读取默认模式: ZAHNER_MODE=simulator 启用模拟器
    const envMode = process.env.ZAHNER_MODE?.toLowerCase();
    if (envMode === 'simulator' || envMode === 'sim') {
      this.deviceMode = 'simulator';
      this.logger.log(`[Zahner] ⚡ SIMULATOR MODE (set by ZAHNER_MODE env)`);
    } else {
      this.deviceMode = 'real';
      this.logger.log(`[Zahner] 🔌 REAL DEVICE MODE`);
    }

    this.logger.log(`[Zahner] Endpoints - Real: ${this.realEndpoint}, Simulator: ${this.simulatorEndpoint}`);
  }

  // ==========================================
  // 设备模式切换 API
  // ==========================================

  async setDeviceMode(mode: 'real' | 'simulator'): Promise<{ success: boolean; mode: string }> {
    if (this.deviceMode === mode) {
      return { success: true, mode };
    }

    // 如果当前已连接，先断开
    if (this.connected) {
      await this.disconnect();
    }

    const oldMode = this.deviceMode;
    this.deviceMode = mode;

    // 重新连接 WebSocket
    this.disconnectWebSocket();
    this.connectWebSocket();

    this.logger.log(`[Zahner] Device mode changed: ${oldMode} -> ${mode}`);
    this.eventBus.emit('device.mode.changed', { oldMode, newMode: mode });

    return { success: true, mode };
  }

  getDeviceMode(): { mode: string; endpoint: string } {
    return {
      mode: this.deviceMode,
      endpoint: this.activeEndpoint
    };
  }

  async onModuleInit() {
    // 仅执行健康检查，不自动连接 WebSocket
    // WebSocket 将在用户手动 connect() 时触发
    await this.healthCheck().catch(e =>
      this.log('enableWarn', `FastAPI check failed: ${e.message}`)
    );
    // 移除自动连接：this.connectWebSocket();
  }

  async onModuleDestroy() {
    this.disconnectWebSocket();
    if (this.connected) {
      await this.disconnect().catch(() => { });
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
        this.lastDataReceived = Date.now();  // ✅ 更新最后收到数据的时间

        // ✅ 收集电压数据用于健康分析 (仅在忙碌状态下且可能是 OCP 测量时)
        if (this.busy && payload.v !== undefined) {
          this.voltageBuffer.push(payload.v);
        }

        this.eventBus.emit('device.raw_stream', payload);
      } catch (e) {
        // ignore parse error
      }
    });

    this.wsClient.on('close', () => {
      this.wsClient = null;
      this.wsReconnectTimer = setTimeout(() => this.connectWebSocket(), 5000);
    });

    this.wsClient.on('error', () => { });
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
        this.httpService.get(`${this.endpoint}/health`, { timeout: this.healthCheckTimeout })
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
          { timeout: this.connectTimeout }
        )
      );

      if (res.data?.status === 'success') {
        this.updateStatus(true, false);
        this.eventBus.emit('device.connected', { deviceType: this.name });
        this.logger.log(`[Zahner] Device connected successfully`);
        // 设备连接成功后，启动 WebSocket 流
        this.connectWebSocket();
      } else {
        throw new Error(res.data?.message || 'Unknown error');
      }
    } catch (error: any) {
      // 处理 HTTP 错误（如 503 HTTPException）
      const msg = error.response?.data?.detail || error.response?.data?.message || error.message;
      this.logger.error(`[Zahner] Connection failed: ${msg}`);
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

    // 【日志】设备层 API 接收的测量参数
    this.logger.log(`[设备层 Zahner] 测量参数 - 类型: ${measurementType}, 节点ID: ${nodeId}, 执行ID: ${executionId}`);
    this.logger.log(`[设备层 Zahner] 原始参数: ${JSON.stringify(parameters)}`);

    this.updateStatus(true, true);
    this.voltageBuffer = []; // ✅ 测量开始，清空缓存
    this.eventBus.emit('measurement.started', { type: measurementType, nodeId, executionId });

    try {
      this.log('enableLog', `Sending measurement: type=${measurementType}, params=${JSON.stringify(parameters)}`);

      // 【日志】发送到 Python 设备 API 的参数
      const pythonParams = {
        measurement_type: measurementType,
        parameters: parameters,
      };
      this.logger.log(`[设备层 Zahner] 发送到 Python API: ${JSON.stringify(pythonParams)}`);

      // ✅ 三段式超时：使用 failureTimeout（30分钟）作为最终超时
      const measurementDurationMs = (parameters.measurement_duration || 60) * 1000;
      const dynamicTimeout = Math.max(this.failureTimeout, measurementDurationMs + 300000);
      this.logger.log(`[设备层 Zahner] 动态超时时间: ${dynamicTimeout / 1000}秒 (测量时长: ${parameters.measurement_duration || 60}秒)`);

      // ✅ 无响应超时监控（检测设备无数据推送）
      this.lastDataReceived = Date.now();  // 初始化
      let warning1Sent = false;
      let warning2Sent = false;

      const warningInterval = setInterval(() => {
        const noResponseTime = Date.now() - this.lastDataReceived;

        // 只有超过阈值没有收到数据才发警告
        if (!warning1Sent && noResponseTime >= this.warningThreshold1) {
          warning1Sent = true;
          this.logger.warn(`[Zahner] ⚠️ 设备已 ${Math.floor(noResponseTime / 60000)} 分钟无响应！`);
          this.eventBus.emit('measurement.warning', {
            level: 1, elapsed: noResponseTime, nodeId, executionId,
            message: '设备已10分钟无数据响应，请检查设备状态'
          });
        }

        if (!warning2Sent && noResponseTime >= this.warningThreshold2) {
          warning2Sent = true;
          this.logger.warn(`[Zahner] ⚠️⚠️ 设备已 ${Math.floor(noResponseTime / 60000)} 分钟无响应，建议检查连接！`);
          this.eventBus.emit('measurement.warning', {
            level: 2, elapsed: noResponseTime, nodeId, executionId,
            message: '设备已20分钟无数据响应，建议检查连接'
          });
        }

        // 如果收到新数据，重置警告状态
        if (noResponseTime < this.warningThreshold1) {
          warning1Sent = false;
          warning2Sent = false;
        }
      }, 60000); // 每分钟检查一次

      try {
        const response = await firstValueFrom(
          this.httpService.post(`${this.endpoint}/measure`, pythonParams, { timeout: dynamicTimeout })
        );

        const responseData = response.data;
        if (responseData.status === 'error') throw new Error(responseData.error || 'Measurement logic error');

        // FastAPI 返回格式是 { status: "success", result: {...} }
        // 实际测量结果在 responseData.result 中
        const result = responseData.result || responseData;

        // 🔍 调试日志：检查 eis_data 是否存在
        if (result.eis_data) {
          this.logger.log(`[Zahner] EIS data received: ${result.eis_data.point_count} points`);
        } else {
          this.logger.log(`[Zahner] No eis_data in result. Keys: ${Object.keys(result).join(', ')}`);
        }

        this.eventBus.emit('measurement.completed', { type: measurementType, result, nodeId });

        // ✅ 电池健康检测分析
        if (measurementType === 'ocp_measurement' && parameters.check_battery_health) {
          const healthResult = this.analyzeBatteryHealth();
          result.battery_health = healthResult;

          if (healthResult.status === 'warning') {
            this.eventBus.emit('battery.health.warning', {
              nodeId,
              executionId,
              message: '电池健康检测发现异常',
              issues: healthResult.issues
            });
          }
          this.voltageBuffer = []; // 分析完销毁缓存
        }

        return result;
      } finally {
        clearInterval(warningInterval);
      }

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

  private analyzeBatteryHealth(): BatteryHealthResult {
    const voltages = this.voltageBuffer;
    if (voltages.length < 5) {
      return { status: 'warning', avgVoltage: 0, deviation: 0, issues: ['数据分析点不足'] };
    }

    const avg = voltages.reduce((a, b) => a + b, 0) / voltages.length;

    // 标准差计算
    const variance = voltages.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / voltages.length;
    const std = Math.sqrt(variance);
    const deviation = (std / avg) * 100; // 偏差百分比 (标准差/平均值*100)

    const issues: string[] = [];

    // 规则1: 平均电压 < 1V 且偏差 >= 5%
    if (avg < 1.0 && deviation >= 5) {
      const devStr = deviation.toFixed(1);
      issues.push(`平均电压偏低且不稳定 (${avg.toFixed(3)}V, 偏差${devStr}%)`);
    }

    // 规则2: 超过1个点 < 0.6V
    const below06 = voltages.filter(v => v < 0.6).length;
    if (below06 > 1) {
      issues.push(`检测到 ${below06} 个极低电压点 (< 0.6V)`);
    }

    // 规则3: 超过3个点 < 0.8V
    const below08 = voltages.filter(v => v < 0.8).length;
    if (below08 > 3) {
      issues.push(`检测到 ${below08} 个低电压点 (< 0.8V)`);
    }

    return {
      status: issues.length > 0 ? 'warning' : 'healthy',
      avgVoltage: avg,
      deviation,
      issues
    };
  }
}
