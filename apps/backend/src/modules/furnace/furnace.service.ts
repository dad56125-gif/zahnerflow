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

  // 节流控制
  private lastUpdateTimestamp = 0;
  private readonly UPDATE_INTERVAL = 1000; // 1s 周期
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

    // Save History
    this.dataService.addFurnaceSample({
      device_name: 'furnace',
      timestamp: statusUpdate.timestamp,
      temperature: raw.pv, sv: raw.sv, mv: raw.mv
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

  async setProgramSegments(segs: ProgramSegment[]) {
    // 后端/自动化调用的批量接口
    return this.executeCommand(() => this.device.setProgramSegments(segs as any), 'set_program');
  }
  
  // Passthroughs
  async health() { return this.device.health(); }
  async ports() { return this.device.ports(); }
  async getProgramSegments() { return this.device.getProgramSegments(); } // 批量读
  async list_presets() { return this.dataService.listPresets(); }
  async create_preset(n: string, s: any[], d?: string) { return this.dataService.createPreset(n, s, d); }
  async get_preset(name: string) { return this.dataService.getPreset(name); }
  async update_preset(name: string, s: any[]) { return this.dataService.updatePreset(name, s); }
  async delete_preset(name: string) { return this.dataService.deletePreset(name); }
  async clone_preset(name: string, newName: string) { return this.dataService.clonePreset(name, newName); }
  async apply_preset(name: string) { return this.dataService.applyPreset(name, () => this.getProgramSegments(), (segs) => this.setProgramSegments(segs)); }
  async get_history_data(params: any) { return this.dataService.getHistoryData(params); }
  async subscribe_to_furnace_updates(id: string) {}
  async unsubscribe_from_furnace_updates(id: string) {}

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
      const currentTemp = Math.round(status.pv * 10);
      const targetTemp = params.target_temperature;
      const ratePerMin = params.rate / 10;
      const tempDiff = Math.abs(targetTemp - currentTemp) / 10;
      const calculatedDuration = Math.ceil(tempDiff / ratePerMin);

      await this.device.setParameter(0x50, currentTemp);
      await this.device.setParameter(0x51, calculatedDuration);
      await this.device.setParameter(0x52, targetTemp);
      await this.device.setParameter(0x53, 5001);
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