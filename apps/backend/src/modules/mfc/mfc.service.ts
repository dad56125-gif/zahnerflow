import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { MfcDeviceService } from './mfcDevice.service';
import { MfcDataService, FlowHistoryQuery } from './mfc-data.service';
import { MfcErrorHandlerService } from './services/mfc-error-handler.service';
import { ErrorCategory } from '../../shared/utils/error-handler.util';
import { MfcGateway } from './mfcGateway';
import type { MfcDeviceInfo, MfcSample } from '@zahnerflow/types';

// ==================== 接口定义 ====================

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

export interface DeviceStatusInfo {
  address: number;
  connection_status: ConnectionState;
  last_communication: string;
  flow_sccm?: number;
  setpoint_sccm?: number;
  gas_type?: string;
  max_flow_sccm?: number;
  error_message?: string;
}

export interface GasNameResponse {
  ok: boolean;
  device_address: number;
  gas_name: string;
  connection_status: string;
  timestamp: string;
}

export interface ActiveSetpointResponse {
  ok: boolean;
  device_address: number;
  active_setpoint_percent: number;
  active_setpoint_sccm: number;
  connection_status: string;
  timestamp: string;
}

export interface PollingStatus {
  is_running: boolean;
  last_poll: string;
  success_count: number;
  error_count: number;
  consecutive_errors: number;
}

interface PollingConfig {
  enabled: boolean;
  interval: number;
  retry_attempts: number;
  retry_delay: number;
}

@Injectable()
export class MfcService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MfcService.name);

  // 状态管理
  private discovered: MfcDeviceInfo[] = [];
  private connection_state: ConnectionState = ConnectionState.DISCONNECTED;
  private connection_info: any = null;
  private device_statuses = new Map<number, DeviceStatusInfo>();

  // 轮询管理
  private polling_subscribers = new Set<string>();
  private polling_timer: NodeJS.Timeout | null = null;
  private is_polling_busy = false;
  private polling_config: PollingConfig = {
    enabled: true,
    interval: 1000,
    retry_attempts: 3,
    retry_delay: 1000,
  };
  private polling_status: PollingStatus = {
    is_running: false,
    last_poll: '',
    success_count: 0,
    error_count: 0,
    consecutive_errors: 0,
  };

  // 并发控制
  private device_busy = false;
  private busy_operations = new Set<string>();

  constructor(
    private readonly device: MfcDeviceService,
    private readonly dataService: MfcDataService,
    private readonly errorHandler: MfcErrorHandlerService,
    private readonly gateway: MfcGateway,
  ) { }

  async onModuleInit(): Promise<void> {
    try {
      await this.device.health().catch(() => { });
    } catch (e) {
      // 忽略初始化错误
    }
  }

  onModuleDestroy(): void {
    this.stop_polling();
  }

  // ==================== 具体功能方法 (替代 Passthrough) ====================

  async health() {
    return await this.device.health();
  }

  async get_available_ports() {
    return await this.device.get_available_ports();
  }

  async get_communication_log() {
    return await this.device.get_communication_log();
  }

  async clear_communication_log() {
    const result = await this.device.clear_communication_log();
    this.dataService.clearCommunicationLog();
    return result;
  }

  async read_gas_name(address: number): Promise<GasNameResponse> {
    return this.errorHandler.handleDeviceOperation(async () => {
      // @ts-ignore: 调用底层服务
      const result = await this.device.read_gas_name(address);
      const device = this.device_statuses.get(address);
      if (device && result.gas_name) {
        device.gas_type = result.gas_name;
        device.last_communication = new Date().toISOString();
      }
      return result;
    }, { operation: 'read_gas_name', address });
  }

  async read_active_setpoint(address: number): Promise<ActiveSetpointResponse> {
    return this.errorHandler.handleDeviceOperation(async () => {
      // @ts-ignore: 调用底层服务
      const result = await this.device.read_active_setpoint(address);
      const device = this.device_statuses.get(address);
      if (device) {
        device.setpoint_sccm = result.active_setpoint_sccm;
        device.last_communication = new Date().toISOString();
      }
      return result;
    }, { operation: 'read_active_setpoint', address });
  }

  // ==================== 核心业务逻辑 ====================

  /**
   * 扫描设备：异步执行，实时推送
   */
  async scan(start: number = 32, end: number = 80): Promise<MfcDeviceInfo[]> {
    return this.errorHandler.handleDeviceScan(async () => {
      this.set_device_busy('scan');
      this.logger.log(`Starting scan: ${start}-${end}`);

      // 异步执行扫描逻辑
      this._performAsyncScan(start, end).catch(e =>
        this.logger.error(`Scan failed: ${e.message}`)
      );

      // 立即返回当前列表
      return [...this.discovered];
    }, { operation: 'scan', start, end });
  }

  private async _performAsyncScan(start: number, end: number): Promise<void> {
    const total = end - start + 1;
    try {
      for (let address = start; address <= end; address++) {
        // 广播扫描进度
        const percent = Math.round(((address - start + 1) / total) * 100);
        this.gateway.sendMfcScanProgress({
          type: 'scan_progress',
          data: {
            current: address,
            start,
            end,
            percent,
            found_count: this.discovered.length
          },
          timestamp: new Date().toISOString()
        });

        try {
          const result = await this.device.scan_single_address(address);
          if (result?.found && result.device) {
            const info = this._cacheDiscoveredDevice(result.device);
            // 实时推送发现事件
            this.gateway.sendMfcDeviceDiscovered({
              type: 'device_discovered',
              data: {
                device_address: info.address,
                gas_type: info.gas_type,
                max_flow_sccm: info.max_flow_sccm,
                connection_status: 'connected',
                last_communication: new Date().toISOString()
              },
              timestamp: new Date().toISOString(),
            });

            // 发现设备后立即轮询获取状态
            try {
              const status = await this.device.get_device_status(info.address);
              if (status?.device_address !== undefined) {
                this.update_device_status(status);
                this.idle_last_poll.set(info.address, Date.now());
              }
            } catch (e) { /* 忽略状态获取错误 */ }
          }
        } catch (e) { /* 忽略单地址错误 */ }

        await new Promise(r => setTimeout(r, 200));
      }

      // 扫描完成，广播100%
      this.gateway.sendMfcScanProgress({
        type: 'scan_progress',
        data: { current: end, start, end, percent: 100, found_count: this.discovered.length },
        timestamp: new Date().toISOString()
      });

      if (this.device_statuses.size > 0) {
        this.start_polling();
      }
    } finally {
      this.clear_device_busy('scan');
    }
  }

  private _cacheDiscoveredDevice(device_data: any): MfcDeviceInfo {
    const info: MfcDeviceInfo = {
      address: device_data.device_address,
      gas_type: device_data.gas_type || 'Unknown',
      max_flow_sccm: device_data.max_flow_sccm || 0
    };

    const idx = this.discovered.findIndex(d => d.address === info.address);
    if (idx >= 0) this.discovered[idx] = info;
    else this.discovered.push(info);

    this.device_statuses.set(info.address, {
      address: info.address,
      connection_status: ConnectionState.CONNECTED,
      last_communication: new Date().toISOString(),
      gas_type: info.gas_type,
      max_flow_sccm: info.max_flow_sccm,
    });

    return info;
  }

  async connect(params: { port: string; baudrate?: number; timeout?: number }) {
    return this.errorHandler.handleDeviceConnection(async () => {
      this.set_device_busy('connect');
      this.connection_state = ConnectionState.CONNECTING;

      const result = await this.device.connect_device(params);

      if (result.ok) {
        this.connection_state = ConnectionState.CONNECTED;
        this.connection_info = result;
        this.gateway.sendMfcConnectionUpdate({
          type: 'connection_update',
          data: { status: 'connected', device_count: this.discovered.length, connection_id: result.connection_id },
          timestamp: new Date().toISOString(),
        });

        if (this.polling_config.enabled && this.device_statuses.size > 0) {
          this.start_polling();
        }
      } else {
        this.connection_state = ConnectionState.ERROR;
        throw new Error(result.error_message || 'Connection failed');
      }
      return result;
    }, { operation: 'connect', ...params }).finally(() => this.clear_device_busy('connect'));
  }

  async disconnect() {
    return this.errorHandler.handleDeviceConnection(async () => {
      this.set_device_busy('disconnect');
      this.stop_polling();

      const result = await this.device.disconnect_device();
      this.connection_state = ConnectionState.DISCONNECTED;
      this.connection_info = null;
      this.device_statuses.clear();
      this.discovered = [];

      this.gateway.sendMfcConnectionUpdate({
        type: 'connection_update',
        data: { status: 'disconnected', device_count: 0 },
        timestamp: new Date().toISOString(),
      });
      return result;
    }, { operation: 'disconnect' }).finally(() => this.clear_device_busy('disconnect'));
  }

  async status(address?: number) {
    return this.errorHandler.handleDeviceOperation(async () => {
      const result = await this.device.get_device_status(address);
      if (result) {
        const updates = Array.isArray(result) ? result : [result];
        updates.forEach(u => {
          if (u.device_address !== undefined) this.update_device_status(u);
        });
        return updates;
      }
      return [];
    }, { operation: 'status', address });
  }

  async setpoint(address: number, sccm: number) {
    return this.errorHandler.handleFlowControl(async () => {
      this.set_device_busy(`setpoint_${address}`);
      const result = await this.device.set_device_flow({ address, sccm });

      if (result.ok) {
        const device = this.device_statuses.get(address);
        const old = device?.setpoint_sccm || 0;
        if (device) {
          device.setpoint_sccm = sccm;
          device.last_communication = new Date().toISOString();
        }
        this.gateway.broadcastFlowSetpointChange(address, old, sccm);
      }
      return result;
    }, { operation: 'setpoint', address, sccm }).finally(() => this.clear_device_busy(`setpoint_${address}`));
  }

  // ==================== 复杂业务逻辑 (Change Gas Flow Node) ====================

  async setFlowRateControl(
    params: {
      device_address: number;
      gas_type: string;
      target_flow_rate: number;
      current_flow_rate?: number;
      stabilization_time?: number
    },
    nodeId?: string,
    executionId?: string
  ): Promise<{
    success: boolean;
    updated_parameters: any;
    error?: string; // 显式声明可能包含 error
  }> {
    const context = { operation: 'setFlowRateControl', ...params, nodeId };

    try {
      return await this.errorHandler.handleFlowControl(async () => {
        if (this.connection_state !== ConnectionState.CONNECTED) throw new Error(`MFC未连接`);
        const device = this.device_statuses.get(params.device_address);
        if (!device) throw new Error(`设备 ${params.device_address} 未找到`);

        this.logger.log(`[${nodeId}] 流量控制: ${params.target_flow_rate} sccm`);

        // 1. 执行设定
        const setRes = await this.setpoint(params.device_address, params.target_flow_rate);
        if (!setRes.ok) throw new Error(setRes.error_message || '设置失败');

        // 2. 临时启动轮询监控
        const subId = `temp_${nodeId}`;
        if (!this.polling_status.is_running) {
          this.subscribe_to_mfc_updates(subId);
        }

        // 3. 每秒轮询检查流量，容差内算通过，最多等待 stabilization_time 秒
        const maxWaitTime = params.stabilization_time || 10;
        const tolerance = 0.05; // 5% 容差
        const targetFlow = params.target_flow_rate;
        let finalFlow = targetFlow;
        let stabilized = false;

        // 特殊情况：目标为0时的容差范围（控制器无法精确控制接近0的流量）
        const ZERO_TARGET_MIN = -10;  // sccm
        const ZERO_TARGET_MAX = 4;    // sccm

        this.logger.log(`[${nodeId}] 等待流量稳定: 目标 ${targetFlow} sccm, 容差 ${tolerance * 100}%, 最大等待 ${maxWaitTime}s`);

        for (let elapsed = 0; elapsed < maxWaitTime; elapsed++) {
          await new Promise(r => setTimeout(r, 1000));

          try {
            const status = await this.device.get_device_status(params.device_address);
            if (status?.flow_sccm !== undefined) {
              finalFlow = status.flow_sccm;

              let isStable = false;
              let errorPercent = 0;

              if (targetFlow === 0) {
                // 目标为0：实际流量在 -10 到 4 sccm 范围内视为稳定
                isStable = finalFlow >= ZERO_TARGET_MIN && finalFlow <= ZERO_TARGET_MAX;
                errorPercent = isStable ? 0 : 100;
              } else {
                // 目标非0：使用百分比容差
                errorPercent = Math.abs(finalFlow - targetFlow) / targetFlow * 100;
                isStable = errorPercent <= tolerance * 100;
              }

              if (isStable) {
                this.logger.log(`[${nodeId}] 流量稳定: ${finalFlow.toFixed(1)} sccm (误差 ${errorPercent.toFixed(1)}%)`);
                stabilized = true;
                break;
              }
              this.logger.log(`[${nodeId}] 等待中: ${finalFlow.toFixed(1)} / ${targetFlow} sccm (误差 ${errorPercent.toFixed(1)}%)`);
            }
          } catch (e) { /* 忽略单次查询错误 */ }
        }

        // 清理临时订阅
        if (!this.polling_status.is_running) {
          setTimeout(() => this.unsubscribe_from_mfc_updates(subId), 2000);
        }

        if (!stabilized) {
          this.logger.warn(`[${nodeId}] 流量在 ${maxWaitTime}s 内未稳定，最终流量: ${finalFlow.toFixed(1)} sccm`);
        }

        return {
          success: true,
          updated_parameters: { ...params, final_flow_rate: finalFlow, stabilized, execution_timestamp: new Date().toISOString() }
        };
      }, context);
    } catch (error) {
      // 修复：捕获错误并返回对象，而不是抛出异常
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${nodeId}] 流量控制失败: ${errorMessage}`);
      return {
        success: false,
        updated_parameters: params,
        error: errorMessage
      };
    }
  }

  // ==================== 轮询引擎 ====================

  private start_polling(): void {
    if (this.polling_timer) clearInterval(this.polling_timer);

    if (this.connection_state !== ConnectionState.CONNECTED ||
      this.device_statuses.size === 0 ||
      this.polling_subscribers.size === 0) {
      return;
    }

    this.polling_status.is_running = true;
    this.polling_timer = setInterval(() => {
      if (!this.is_polling_busy) {
        this.perform_polling().catch(e => this.logger.error(`Polling error: ${e.message}`));
      }
    }, this.polling_config.interval);

    this.logger.log(`Started polling: ${this.device_statuses.size} devices`);
  }

  private stop_polling(): void {
    if (this.polling_timer) {
      clearInterval(this.polling_timer);
      this.polling_timer = null;
    }
    this.polling_status.is_running = false;
    this.logger.log('Stopped polling');
  }

  // 空闲设备上次轮询时间记录
  private idle_last_poll = new Map<number, number>();
  private IDLE_POLL_INTERVAL = 60000; // 空闲设备60秒轮询一次

  private async perform_polling(): Promise<void> {
    if (this.device_busy) return;
    this.is_polling_busy = true;

    try {
      const now = Date.now();
      const addresses = Array.from(this.device_statuses.keys());

      for (const addr of addresses) {
        try {
          const device = this.device_statuses.get(addr);
          const isActive = device && (device.setpoint_sccm || 0) > 0;

          // 空闲设备检查是否到达轮询间隔
          if (!isActive) {
            const lastPoll = this.idle_last_poll.get(addr) || 0;
            const elapsed = now - lastPoll;
            if (elapsed < this.IDLE_POLL_INTERVAL) {
              continue; // 跳过此设备，未到轮询时间
            }
            this.logger.log(`[${addr}] 空闲设备轮询, 已过 ${Math.round(elapsed / 1000)}s`);
            this.idle_last_poll.set(addr, now);
          }

          const res = await this.device.get_device_status(addr);
          if (res?.device_address !== undefined) this.update_device_status(res);
          if (addresses.indexOf(addr) < addresses.length - 1) await new Promise(r => setTimeout(r, 100));
        } catch (e) { }
      }

      // 广播数据
      const timestamp = new Date().toISOString();
      const devices = Array.from(this.device_statuses.values());

      if (devices.length > 0) {
        // 状态更新
        this.gateway.sendMfcStatusUpdate({
          type: 'status_update',
          data: devices.map(d => ({
            device_address: d.address,
            flow_sccm: d.flow_sccm || 0,
            setpoint_sccm: d.setpoint_sccm || 0,
            gas_type: d.gas_type,
            max_flow_sccm: d.max_flow_sccm,
            connection_status: d.connection_status === ConnectionState.CONNECTED ? 'connected' : 'disconnected',
            last_communication: d.last_communication
          })),
          timestamp
        });

        // 采样记录 (保留 DataService 调用)
        devices.forEach(d => {
          this.dataService.addFlowSample({
            ts: timestamp,
            address: d.address,
            flow_sccm: d.flow_sccm || 0,
            flow_percent: 0,
            digital_setpoint_percent: 0,
            active_setpoint_percent: 0
          });
        });
      }

      this.gateway.broadcastSystemStatus(this.dataService.getSystemOverview());

    } catch (error) {
      this.polling_status.error_count++;
      if (++this.polling_status.consecutive_errors >= 5) {
        this.stop_polling();
      }
    } finally {
      this.is_polling_busy = false;
    }
  }

  // ==================== 辅助与状态管理 ====================

  subscribe_to_mfc_updates(client_id: string): void {
    this.polling_subscribers.add(client_id);
    if (!this.polling_status.is_running) this.start_polling();
  }

  unsubscribe_from_mfc_updates(client_id: string): void {
    this.polling_subscribers.delete(client_id);
    if (this.polling_subscribers.size === 0) this.stop_polling();
  }

  private update_device_status(data: any): void {
    const device = this.device_statuses.get(data.device_address);
    if (device) {
      device.flow_sccm = data.flow_sccm;
      device.setpoint_sccm = data.setpoint_sccm;
      device.last_communication = new Date().toISOString();
    }
  }

  private set_device_busy(op: string) { this.device_busy = true; this.busy_operations.add(op); }
  private clear_device_busy(op: string) {
    this.busy_operations.delete(op);
    if (this.busy_operations.size === 0) this.device_busy = false;
  }

  is_device_busy(): boolean { return this.device_busy; }
  getDevices(): MfcDeviceInfo[] { return [...this.discovered]; }

  /** 获取轮询缓存的设备状态（无需额外查询） */
  getCachedDeviceStatuses(): DeviceStatusInfo[] { return Array.from(this.device_statuses.values()); }
  getConnectionStatus() { return { status: this.connection_state, connection_info: this.connection_info, device_count: this.discovered.length, polling_status: this.polling_status }; }
  async get_connection_info() { return this.connection_info || await this.device.get_connection_info(); }
  async query_flow_history(q: FlowHistoryQuery) { return this.dataService.queryFlowHistory(q); }
}