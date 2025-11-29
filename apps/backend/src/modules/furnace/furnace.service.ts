import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef, HttpException, HttpStatus } from '@nestjs/common';
import { FurnaceDeviceService } from './furnaceDevice.service';
import { FurnaceErrorHandlerService } from './services/furnace-error-handler.service';
import { FurnaceDataService } from './furnace-data.service';
import { FurnaceGateway } from './furnaceGateway';
import type { ProgramSegment } from '@zahnerflow/types';

@Injectable()
export class FurnaceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FurnaceService.name);
  
  private isActive = false;
  private isConnected = false;
  private shouldPoll = false;
  private lastStatusJson = '';
  private lastStatusCode: number | null = null;  // ✅ 新增：缓存上一次状态码，用于状态变更检测

  // 节流控制
  private lastUpdateTimestamp = 0;
  private readonly UPDATE_INTERVAL = 2000; // 2s 周期（方案要求）
  private pendingStatusData: any = null;
  private throttleTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly device: FurnaceDeviceService,
    private readonly errorHandler: FurnaceErrorHandlerService,
    private readonly dataService: FurnaceDataService,
    @Inject(forwardRef(() => FurnaceGateway))
    private readonly gateway: FurnaceGateway,
  ) {}

  onModuleInit() {
    this.isActive = true;
    this.startPollingLoop();
  }

  onModuleDestroy() {
    this.isActive = false;
    if (this.throttleTimer) clearTimeout(this.throttleTimer);
  }

  // --- 串行轮询 Loop ---
  private async startPollingLoop() {
    this.logger.log('Furnace Serial Polling Loop Started.');
    while (this.isActive) {
      const start = Date.now();
      if (this.isConnected && this.shouldPoll) {
        await this.performOnePoll();
      }
      const elapsed = Date.now() - start;
      const delay = Math.max(100, this.UPDATE_INTERVAL - elapsed);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  private async performOnePoll() {
    try {
      const raw = await this.errorHandler.execute(() => this.device.status(), 'poll');
      if (raw) this.processStatusData(raw, true); // 正常轮询，强制更新
    } catch (e) { /* quiet */ }
  }

  // --- 状态拦截 & 节流 ---
  private interceptAndRecordStatus(rawResponse: any) {
    if (!rawResponse) return;
    let statusData: any = null;
    if (rawResponse.device_status) statusData = rawResponse.device_status;
    else if (typeof rawResponse.pv === 'number') statusData = rawResponse;

    if (statusData) this.processStatusData(statusData, false); // 拦截数据，走节流逻辑
  }

  private processStatusData(raw: any, forceUpdate: boolean) {
    const now = Date.now();
    this.pendingStatusData = raw;

    const timeSinceLast = now - this.lastUpdateTimestamp;

    if (forceUpdate || timeSinceLast >= this.UPDATE_INTERVAL) {
      this.flushPendingData();
    } else {
      if (!this.throttleTimer) {
        const delay = this.UPDATE_INTERVAL - timeSinceLast;
        this.throttleTimer = setTimeout(() => this.flushPendingData(), delay);
      }
    }
  }

  private flushPendingData() {
    if (this.throttleTimer) { clearTimeout(this.throttleTimer); this.throttleTimer = null; }
    if (!this.pendingStatusData) return;

    const raw = this.pendingStatusData;
    this.lastUpdateTimestamp = Date.now();

    const statusStr = this.mapStatusCodeToText(raw.status_code);
    const statusUpdate = {
      device_name: 'furnace',
      timestamp: new Date().toISOString(),
      status: {
        pv: raw.pv, sv: raw.sv, mv: raw.mv,
        status: statusStr,
        segment: raw.segment || 0,
        segment_time: raw.segment_time || 0,
        segment_time_set: raw.segment_time_set || 0
      },
      connection_state: { status: 'connected' as const }
    };

    // Push WebSocket
    const currentJson = JSON.stringify(statusUpdate.status);
    if (currentJson !== this.lastStatusJson) {
      this.gateway.sendFurnaceStatusUpdate(statusUpdate);
      this.lastStatusJson = currentJson;
    }

    // ✅ 状态变更检测：与上一次状态对比
    const currentStatusCode = raw.status_code;
    if (currentStatusCode !== this.lastStatusCode) {
      // 状态发生变更，记录事件
      this.dataService.addFurnaceEvent({
        timestamp: statusUpdate.timestamp,
        status_code: currentStatusCode,
        segment: raw.segment,
        segment_time_set: raw.segment_time_set
      });
      this.logger.log(`Status changed: ${this.lastStatusCode} → ${currentStatusCode}`);

      this.lastStatusCode = currentStatusCode;  // 更新缓存
    }

    // ✅ Save History：采样数据包含状态码
    this.dataService.addFurnaceSample({
      device_name: 'furnace',
      timestamp: statusUpdate.timestamp,
      temperature: raw.pv,
      sv: raw.sv,
      mv: raw.mv,
      status_code: currentStatusCode  // ✅ 新增：记录当前状态
    });
  }

  private mapStatusCodeToText(code: number): string {
    switch (code) {
      case 0: return 'run';
      case 4: return 'pause';
      case 12: return 'stop';
      default: return 'unknown';
    }
  }

  // --- 控制命令 (带拦截) ---
  private async executeCommand<T>(fn: () => Promise<T>, name: string): Promise<T> {
    if (!this.isConnected) throw new HttpException('Device disconnected', HttpStatus.SERVICE_UNAVAILABLE);
    const wasPolling = this.shouldPoll;
    this.shouldPoll = false;
    try {
      const result = await this.errorHandler.execute(fn, name);
      this.interceptAndRecordStatus(result);
      return result;
    } finally {
      if (wasPolling) this.shouldPoll = true;
    }
  }

  async connect(dto: any) {
    await this.errorHandler.execute(() => this.device.connect(dto), 'connect');
    this.isConnected = true;
    this.shouldPoll = true;
    this.gateway.sendFurnaceStatusUpdate({ connection_state: { status: 'connected' } } as any);
    return { success: true };
  }

  async disconnect() {
    this.shouldPoll = false;
    try { await this.device.disconnect(); } catch(e) {}
    this.isConnected = false;
    this.gateway.sendFurnaceStatusUpdate({ connection_state: { status: 'disconnected' } } as any);
    return { success: true };
  }

  async run() { return this.executeCommand(() => this.device.run(), 'run'); }
  async pause() { return this.executeCommand(() => this.device.pause(), 'pause'); }
  async stop() { return this.executeCommand(() => this.device.stop(), 'stop'); }
  async setSegment(seg: number) { return this.executeCommand(() => this.device.setSegment(seg), 'set_segment'); }
  
  async getSegment(id: number) {
      // 前端调用的单点接口
      const result: any = await this.executeCommand(
          () => this.device.getSegment(id), `read_segment_${id}`
      );
      return result.segment_data;
  }

  // Passthroughs
  async health() { return this.device.health(); }
  async ports() { return this.device.ports(); }
  async list_presets() { return this.dataService.listPresets(); }
  async create_preset(n: string, s: any[], d?: string) { return this.dataService.createPreset(n, s, d); }
  async get_preset(name: string) { return this.dataService.getPreset(name); }
  async update_preset(name: string, s: any[]) { return this.dataService.updatePreset(name, s); }
  async delete_preset(name: string) { return this.dataService.deletePreset(name); }
  async clone_preset(name: string, newName: string) { return this.dataService.clonePreset(name, newName); }
  async apply_preset(name: string): Promise<{ changed: boolean; steps: string[] }> {
    return this.dataService.applyPreset(name, () => this.get_program_segments(), (segs) => this.set_program_segments(segs));
  }
  async get_history_data(params: any) { return this.dataService.getHistoryData(params); }
  async subscribe_to_furnace_updates(id: string) {}
  async unsubscribe_from_furnace_updates(id: string) {}

  // 批量读取程序段（内部循环27次getSegment）
  async get_program_segments(): Promise<ProgramSegment[]> {
    const segments: ProgramSegment[] = [];

    for (let i = 1; i <= 27; i++) {
      const result: any = await this.executeCommand(
        () => this.device.getSegment(i),
        `read_segment_${i}`
      );
      segments.push(result.segment_data);

      // WebSocket进度推送
      this.gateway.send_read_progress({
        progress: Math.round((i / 27) * 100)
      });
    }

    return segments;
  }

  // 批量写入程序段（内部循环54次：27段×2参数）
  async set_program_segments(segments: ProgramSegment[]): Promise<void> {
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      // 写入温度
      await this.executeCommand(
        () => this.device.setParameter(0x1A + (segment.id - 1) * 2, segment.temperature),
        `write_temp_segment_${segment.id}`
      );

      // 写入时间
      await this.executeCommand(
        () => this.device.setParameter(0x1B + (segment.id - 1) * 2, segment.time),
        `write_time_segment_${segment.id}`
      );

      // WebSocket进度推送
      this.gateway.send_write_progress({
        progress: Math.round(((i + 1) / segments.length) * 100)
      });
    }
  }

  // ==================== 自动温度控制 ====================

  async autoTemperatureControl(
    params: {
      target_temperature: number;
      rate: number;
      current_temperature?: number;
      calculated_duration?: number;
      tolerance?: number;
      stabilization_time?: number;
    },
    nodeId?: string,
    executionId?: string
  ): Promise<{
    success: boolean;
    updated_parameters: any;
    error?: string;
  }> {
    try {
      if (!this.isConnected) throw new Error('设备未连接');

      const status = await this.device.status();
      const currentTemp = status.pv;  // Python API已转换为用户格式
      const targetTemp = params.target_temperature;  // 用户输入格式
      const ratePerMin = params.rate;  // 用户输入格式
      const tempDiff = Math.abs(targetTemp - currentTemp);  // 直接计算用户格式差值
      const calculatedDuration = Math.ceil(tempDiff / ratePerMin);

      // 移除×10转换，统一传递用户格式给Python层处理
      await this.device.setParameter(0x50, currentTemp);  // 段28温度（起始）
      await this.device.setParameter(0x51, calculatedDuration);  // 段28时间
      await this.device.setParameter(0x52, targetTemp);  // 段29温度（目标）
      await this.device.setParameter(0x53, 5001);  // 段29时间（5001分钟≈83小时）
      await this.device.setParameter(0x54, targetTemp);  // 段30温度（必须设置，避免5001分钟后降温到未知值）
      // 注意：段30时间（0x55）不需要设置，默认为0表示程序结束
      await this.device.setSegment(28);

      if (status.status !== 'running') {
        await this.run();
      }

      const waitMs = (calculatedDuration * 60 * 1000) + (params.stabilization_time || 30 * 1000);
      await new Promise(r => setTimeout(r, waitMs));

      return {
        success: true,
        updated_parameters: {
          ...params,
          current_temperature: currentTemp,
          calculated_duration: calculatedDuration,
          tolerance: 5,
          stabilization_time: params.stabilization_time || 30
        }
      };
    } catch (e: any) {
      return {
        success: false,
        updated_parameters: params,
        error: e.message
      };
    }
  }
}