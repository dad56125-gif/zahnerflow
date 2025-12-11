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
          }
        } catch (e) { /* 忽略单地址错误 */ }

        await new Promise(r => setTimeout(r, 500));
      }

      // 扫描完成，广播100%
      this.gateway.sendMfcScanProgress({
        type: 'scan_progress',
        data: { current: end, start, end, percent: 100, found_count: this.discovered.length },
        timestamp: new Date().toISOString()
      });

      if (this.device_statuses.size > 0 && this.polling_subscribers.size > 0) {
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
          setTimeout(() => this.unsubscribe_from_mfc_updates(subId), (params.stabilization_time || 10) * 1000 + 5000);
        }

        // 3. 等待稳定
        const waitTime = params.stabilization_time || 10;
        await new Promise(r => setTimeout(r, waitTime * 1000));

        // 4. 验证结果
        let finalFlow = params.target_flow_rate;
        try {
          const status = await this.device.get_device_status(params.device_address);
          if (status?.flow_sccm !== undefined) finalFlow = status.flow_sccm;
        } catch (e) { }

        return {
          success: true,
          updated_parameters: { ...params, final_flow_rate: finalFlow, execution_timestamp: new Date().toISOString() }
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

  private async perform_polling(): Promise<void> {
    if (this.device_busy) return;
    this.is_polling_busy = true;

    try {
      // 串行轮询所有设备
      const addresses = Array.from(this.device_statuses.keys());
      for (const addr of addresses) {
        try {
          const res = await this.device.get_device_status(addr);
          if (res?.device_address !== undefined) this.update_device_status(res);
          if (addresses.indexOf(addr) < addresses.length - 1) await new Promise(r => setTimeout(r, 100));
        } catch (e) { }
      }

      // 广播数据
      const now = new Date().toISOString();
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
          timestamp: now
        });

        // 采样记录 (保留 DataService 调用)
        devices.forEach(d => {
          this.dataService.addFlowSample({
            ts: now,
            address: d.address,
            flow_sccm: d.flow_sccm || 0,
            flow_percent: 0, // 简化计算
            digital_setpoint_percent: 0,
            active_setpoint_percent: 0
          });
        });
      }

      this.gateway.broadcastSystemStatus(this.dataService.getSystemOverview());

    } catch (error) {
      this.polling_status.error_count++;
      if (++this.polling_status.consecutive_errors >= 5) {
        this.stop_polling(); // 错误过多自动停止
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
  getConnectionStatus() { return { status: this.connection_state, connection_info: this.connection_info, device_count: this.discovered.length, polling_status: this.polling_status }; }
  async get_connection_info() { return this.connection_info || await this.device.get_connection_info(); }
  async query_flow_history(q: FlowHistoryQuery) { return this.dataService.queryFlowHistory(q); }
}