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
  ) { }

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
    try { await this.device.disconnect(); } catch (e) { }
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
  async subscribe_to_furnace_updates(id: string) { }
  async unsubscribe_from_furnace_updates(id: string) { }

  /** 获取轮询缓存的 Furnace 状态（无需额外查询） */
  getCachedStatus(): { pv?: number; sv?: number; status?: string; isConnected: boolean } {
    if (!this.isConnected || !this.pendingStatusData) {
      return { isConnected: false };
    }
    const raw = this.pendingStatusData;
    return {
      pv: raw.pv,
      sv: raw.sv,
      status: this.mapStatusCodeToText(raw.status_code),
      isConnected: true
    };
  }

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
  async set_program_segments(segments: ProgramSegment[]): Promise<{ success: boolean; count: number }> {
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

    return { success: true, count: segments.length };
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
    // 暂停正常轮询，防止并发访问设备
    const wasPolling = this.shouldPoll;
    this.shouldPoll = false;

    try {
      if (!this.isConnected) throw new Error('设备未连接');

      // ========== 第一步：获取当前温度（优先使用轮询缓存）==========
      const cachedStatus = this.pendingStatusData;
      let currentTemp: number;

      if (cachedStatus && cachedStatus.pv !== undefined) {
        currentTemp = cachedStatus.pv;
        this.logger.log(`[温度控制] 使用缓存温度: ${currentTemp}℃`);
      } else {
        const status = await this.device.status();
        currentTemp = status.pv;
      }

      const targetTemp = params.target_temperature;
      const ratePerMin = params.rate;
      const tolerance = params.tolerance ?? 5;
      const stabilizationTime = (params.stabilization_time ?? 30) * 1000;
      const tempDiff = Math.abs(targetTemp - currentTemp);
      const calculatedDuration = Math.ceil(tempDiff / ratePerMin);

      // ========== 第二步：设置参数（带重试，不做检查）==========

      this.logger.log(`[温度控制] 开始设置段 28 参数（最多3次）...`);

      let setupSuccess = false;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries && !setupSuccess) {
        retryCount++;
        this.logger.log(`[温度控制] 第 ${retryCount}/${maxRetries} 次尝试设置参数...`);

        try {
          // 设置温度程序参数
          await this.device.setParameter(0x50, Math.round(currentTemp));
          await this.device.setParameter(0x51, calculatedDuration);
          await this.device.setParameter(0x52, Math.round(targetTemp));
          await this.device.setParameter(0x53, 5001);
          await this.device.setParameter(0x54, Math.round(targetTemp));
          await this.device.setSegment(28);

          // 设置完成（不做额外检查）
          setupSuccess = true;
          this.logger.log(`[温度控制] 参数设置成功 (尝试 ${retryCount}/${maxRetries})`);
        } catch (error) {
          this.logger.warn(`[温度控制] 设置过程出错: ${error.message}，准备重试...`);
        }

        // 如果未成功且未达到最大重试次数，等待后重试
        if (!setupSuccess && retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // 3次尝试后仍失败，抛出错误
      if (!setupSuccess) {
        throw new Error(`参数设置失败（重试 ${maxRetries} 次后仍失败）`);
      }

      // ========== 第三步：启动程序（如果未运行）==========

      const status = await this.device.status();
      if (status.status !== 'running') {
        await this.device.run();
        this.logger.log(`[温度控制] 设备已启动`);
      }

      // 恢复轮询，让 startPollingLoop 继续更新缓存数据
      this.shouldPoll = wasPolling;

      // ========== 轮询验证温度（复用 startPollingLoop 的缓存数据）==========
      const maxWaitMs = (calculatedDuration * 60 * 1000) + stabilizationTime;
      const pollIntervalMs = 2000; // 每2秒检测一次（与 startPollingLoop 同步）
      const startTime = Date.now();

      this.logger.log(`[温度控制] 开始轮询验证 - 目标: ${targetTemp}℃, 容差: ±${tolerance}℃, 最大等待: ${Math.round(maxWaitMs / 1000)}s`);

      // 使用 startPollingLoop 维护的缓存数据，避免重复轮询导致连接冲突
      while (Date.now() - startTime < maxWaitMs) {
        // 等待 startPollingLoop 更新数据
        await new Promise(r => setTimeout(r, pollIntervalMs));

        // 从缓存读取最新状态（由 startPollingLoop 每 2 秒更新）
        const cachedStatus = this.pendingStatusData;
        if (!cachedStatus) {
          this.logger.warn('[温度控制] 无缓存状态数据，等待下一轮...');
          continue;
        }

        const currentPv = cachedStatus.pv;

        // 检查是否在容差范围内
        if (Math.abs(currentPv - targetTemp) <= tolerance) {
          this.logger.log(`[温度控制] 成功！当前: ${currentPv}℃, 目标: ${targetTemp}℃, 容差: ±${tolerance}℃`);
          return {
            success: true,
            updated_parameters: {
              ...params,
              current_temperature: currentPv,
              calculated_duration: calculatedDuration,
              tolerance,
              stabilization_time: params.stabilization_time ?? 30
            }
          };
        }
      }

      // 超时未达目标 - 也从缓存读取
      const finalTemp = this.pendingStatusData?.pv ?? currentTemp;
      const errorMsg = `温度控制超时：当前 ${finalTemp}℃，目标 ${targetTemp}℃，容差 ±${tolerance}℃`;
      this.logger.warn(`[温度控制] 失败！${errorMsg}`);

      return {
        success: false,
        updated_parameters: {
          ...params,
          current_temperature: finalTemp,
          calculated_duration: calculatedDuration,
          tolerance,
          stabilization_time: params.stabilization_time ?? 30
        },
        error: errorMsg
      };
    } catch (e: any) {
      // 确保轮询被恢复
      if (wasPolling) this.shouldPoll = true;
      return {
        success: false,
        updated_parameters: params,
        error: e.message
      };
    }
  }
}