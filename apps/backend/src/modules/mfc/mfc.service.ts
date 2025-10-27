import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { MfcDeviceService } from '../../devices/mfc-device.service';
import { MfcDataService, FlowHistoryQuery } from './mfc-data.service';
import { MfcErrorHandlerService } from './services/mfc-error-handler.service';
import { ErrorCategory } from '../../shared/utils/error-handler.util';
import { MfcGateway } from '../../gateways/mfc.gateway';
import type { MfcDeviceInfo, MfcSample } from '@zahnerflow/types';

/**
 * 连接状态枚举
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

/**
 * 设备状态信息
 */
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

/**
 * 轮询配置
 */
interface PollingConfig {
  enabled: boolean;
  interval: number; // 毫秒
  retry_attempts: number;
  retry_delay: number; // 毫秒
}

/**
 * 轮询状态
 */
export interface PollingStatus {
  is_running: boolean;
  last_poll: string;
  success_count: number;
  error_count: number;
  consecutive_errors: number;
}

@Injectable()
export class MfcService implements OnModuleInit, OnModuleDestroy {
  private discovered: MfcDeviceInfo[] = [];
  private readonly logger = new Logger(MfcService.name);

  // 连接和状态管理
  private connection_state: ConnectionState = ConnectionState.DISCONNECTED;
  private connection_info: any = null;
  private device_statuses = new Map<number, DeviceStatusInfo>();
  private polling_subscribers = new Set<string>();

  // 轮询管理
  private polling_timer: NodeJS.Timeout | null = null;
  private polling_config: PollingConfig = {
    enabled: true,
    interval: 2000, // 2秒
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

  // 设备忙状态管理
  private device_busy = false;
  private busy_operations = new Set<string>();

  constructor(
    private readonly device: MfcDeviceService,
    private readonly dataService: MfcDataService,
    private readonly errorHandler: MfcErrorHandlerService,
    private readonly gateway: MfcGateway,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const h = await this.device.health();
      this.logger.log(`MFC FastAPI health: ${JSON.stringify(h)}`);
    } catch (e: any) {
      this.logger.warn(`MFC FastAPI health check failed: ${e?.message || e}`);
    }

    // 启动轮询
    this.start_polling();
  }

  onModuleDestroy(): void {
    this.stop_polling();
  }

  // ==================== 设备发现和扫描 ====================

  /**
   * 扫描MFC设备 - 使用FastAPI /scan接口
   */
  async scan(start?: number, end?: number): Promise<MfcDeviceInfo[]> {
    return this.errorHandler.handleDeviceScan(
      async () => {
        this.set_device_busy('scan');

        // 设置默认扫描范围：32-80
        const scan_start = start ?? 32;
        const scan_end = end ?? 80;

        this.logger.log(`Starting MFC scan: addresses ${scan_start}-${scan_end}`);

        const found_devices: MfcDeviceInfo[] = [];

        try {
          // 调用FastAPI /scan接口，一次性扫描所有地址
          this.logger.debug(`Calling FastAPI /scan interface for addresses ${scan_start}-${scan_end}...`);
          const scan_result = await this.device.scan_devices({ start: scan_start, end: scan_end });

          if (scan_result && scan_result.devices && Array.isArray(scan_result.devices)) {
            // 处理扫描到的设备
            for (const device_status of scan_result.devices) {
              if (device_status.address !== undefined) {
                const device_info: MfcDeviceInfo = {
                  address: device_status.address,
                  gas_type: device_status.gas_type || 'Unknown',
                  max_flow_sccm: device_status.max_flow_sccm || 0
                };

                found_devices.push(device_info);
                this.logger.log(`Found MFC device at address ${device_status.address}: gas_type=${device_info.gas_type}, max_flow=${device_info.max_flow_sccm} SCCM`);

                // 初始化设备状态
                this.device_statuses.set(device_status.address, {
                  address: device_info.address,
                  connection_status: ConnectionState.CONNECTED,
                  last_communication: new Date().toISOString(),
                  gas_type: device_info.gas_type,
                  max_flow_sccm: device_info.max_flow_sccm,
                });
              }
            }
          }

          // 可选：调用status方法更新缓存
          try {
            this.logger.debug(`Updating device status cache after scan...`);
            await this.status();
          } catch (statusError) {
            this.logger.warn(`Failed to update status cache after scan: ${statusError}`);
            // 状态更新失败不影响扫描结果
          }

        } catch (error) {
          // 区分真正的扫描失败和单个地址超时
          const isTimeout = error.message?.toLowerCase().includes('timeout') ||
                           error.code === 'ECONNABORTED';

          if (isTimeout) {
            this.logger.warn(`FastAPI /scan interface timed out, but some devices may have been found: ${error.message}`);
            // 超时不抛出异常，允许返回已扫描到的设备
            // FastAPI /scan接口会正常处理单个地址超时并继续扫描
          } else {
            this.logger.error(`FastAPI /scan interface failed: ${error.message}`);
            throw error; // 只有非超时错误才抛出异常
          }
        }

        // 合并到缓存（按 address 去重）
        for (const device of found_devices) {
          const idx = this.discovered.findIndex((x) => x.address === device.address);
          if (idx >= 0) {
            this.discovered[idx] = device;
          } else {
            this.discovered.push(device);
          }
        }

        const scanned_address_count = scan_end - scan_start + 1;
        const timeout_addresses_count = scanned_address_count - found_devices.length;

        this.logger.log(`MFC scan completed: found ${found_devices.length} devices, ${timeout_addresses_count} addresses not found`);

        return this.discovered;
      },
      {
        operation: 'scan',
        start,
        end
      }
    ).finally(() => {
      this.clear_device_busy('scan');
    });
  }

  /**
   * 获取已发现的设备列表
   */
  getDevices(): MfcDeviceInfo[] {
    return [...this.discovered];
  }

  // ==================== 连接管理 ====================

  /**
   * 连接MFC设备
   */
  async connect(request_body: { port: string; baudrate?: number; timeout?: number }) {
    return this.errorHandler.handleDeviceConnection(
      async () => {
        this.set_device_busy('connect');
        this.connection_state = ConnectionState.CONNECTING;

        const result = await this.device.connect_device(request_body);

        if (result.ok) {
          this.connection_state = ConnectionState.CONNECTED;
          this.connection_info = result;
          this.logger.log(`MFC connected: ${JSON.stringify(result)}`);

          // 连接成功后自动扫描设备
          try {
            await this.scan();
            this.logger.log(`Auto-scan completed after connection, found ${this.discovered.length} devices`);
          } catch (scanError) {
            this.logger.warn(`Auto-scan failed after connection: ${scanError}`);
            // 扫描失败不影响连接状态
          }

          // 广播连接状态更新
          this.gateway.sendMfcConnectionUpdate({
            type: 'connection_update',
            data: {
              status: 'connected',
              device_count: this.discovered.length,
              connection_id: result.connection_id,
            },
            timestamp: new Date().toISOString(),
          });

          // 重启轮询
          if (this.polling_config.enabled) {
            this.start_polling();
          }
        } else {
          this.connection_state = ConnectionState.ERROR;
          throw new Error(result.error_message || 'Connection failed');
        }

        return result;
      },
      {
        operation: 'connect',
        port: request_body.port,
        baudrate: request_body.baudrate,
        timeout: request_body.timeout
      }
    ).catch(error => {
      this.connection_state = ConnectionState.ERROR;
      throw error;
    }).finally(() => {
      this.clear_device_busy('connect');
    });
  }

  /**
   * 断开MFC设备连接
   */
  async disconnect() {
    return this.errorHandler.handleDeviceConnection(
      async () => {
        this.set_device_busy('disconnect');

        const result = await this.device.disconnect_device();

        this.connection_state = ConnectionState.DISCONNECTED;
        this.connection_info = null;

        // 清除设备状态
        this.device_statuses.clear();

        this.logger.log('MFC disconnected');

        // 广播连接状态更新
        this.gateway.sendMfcConnectionUpdate({
          type: 'connection_update',
          data: {
            status: 'disconnected',
            device_count: 0,
          },
          timestamp: new Date().toISOString(),
        });

        // 停止轮询
        this.stop_polling();

        return result;
      },
      {
        operation: 'disconnect'
      }
    ).finally(() => {
      this.clear_device_busy('disconnect');
    });
  }

  /**
   * 获取连接信息
   */
  async get_connection_info() {
    try {
      if (this.connection_state === ConnectionState.CONNECTED && this.connection_info) {
        return this.connection_info;
      }

      const result = await this.device.get_connection_info();
      this.connection_info = result;
      return result;
    } catch (error) {
      this.errorHandler.handleError(error, ErrorCategory.DEVICE, { operation: 'get_connection_info' });
      throw error;
    }
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus(): {
    status: ConnectionState;
    connection_info?: any;
    device_count: number;
    polling_status: PollingStatus;
  } {
    return {
      status: this.connection_state,
      connection_info: this.connection_info,
      device_count: this.discovered.length,
      polling_status: this.polling_status,
    };
  }

  // ==================== 设备控制和状态 ====================

  /**
   * 获取设备状态
   */
  async status(address?: number) {
    try {
      // 检查熔断器状态
      const circuitBreaker = this.errorHandler.checkCircuitBreaker('device_communication');
      if (!circuitBreaker.allowed) {
        throw new Error(`Circuit breaker is open: ${circuitBreaker.state}`);
      }

      const result = await this.device.get_device_status(address);

      // 更新设备状态缓存
      if (result && Array.isArray(result)) {
        result.forEach((device_status: any) => {
          this.update_device_status(device_status);
        });
      } else if (result && result.address !== undefined) {
        this.update_device_status(result);
      }

      this.errorHandler.recordCircuitBreakerSuccess('device_communication');
      return result;
    } catch (error) {
      this.errorHandler.recordCircuitBreakerFailure('device_communication');
      this.errorHandler.handleError(error, ErrorCategory.DEVICE, { operation: 'status', address });
      throw error;
    }
  }

  /**
   * 设置流量设定点
   */
  async setpoint(address: number, sccm: number) {
    return this.errorHandler.handleFlowControl(
      async () => {
        this.set_device_busy(`setpoint_${address}`);

        // 获取当前设定值用于广播
        const current_device = this.device_statuses.get(address);
        const old_sccm = current_device?.setpoint_sccm || 0;

        const result = await this.device.set_device_flow({ address, sccm });

        if (result.ok) {
          // 更新设备状态
          if (current_device) {
            current_device.setpoint_sccm = sccm;
            current_device.last_communication = new Date().toISOString();
          }

          // 广播设定点变更
          this.gateway.broadcastFlowSetpointChange(address, old_sccm, sccm);

          this.logger.log(`Set flow setpoint: device ${address} = ${sccm} sccm`);
        }

        return result;
      },
      {
        operation: 'setpoint',
        address,
        sccm
      }
    ).finally(() => {
      this.clear_device_busy(`setpoint_${address}`);
    });
  }

  // ==================== 数据管理 ====================

  /**
   * 查询流量历史数据
   */
  async query_flow_history(query: FlowHistoryQuery) {
    try {
      return await this.dataService.queryFlowHistory(query);
    } catch (error) {
      this.errorHandler.handleError(error, ErrorCategory.SYSTEM, { operation: 'query_flow_history', ...query });
      throw error;
    }
  }

  /**
   * 获取通信日志
   */
  async get_communication_log() {
    try {
      return await this.device.get_communication_log();
    } catch (error) {
      this.errorHandler.handleError(error, ErrorCategory.SYSTEM, { operation: 'get_communication_log' });
      throw error;
    }
  }

  /**
   * 清空通信日志
   */
  async clear_communication_log() {
    try {
      const result = await this.device.clear_communication_log();
      this.dataService.clearCommunicationLog();
      return result;
    } catch (error) {
      this.errorHandler.handleError(error, ErrorCategory.SYSTEM, { operation: 'clear_communication_log' });
      throw error;
    }
  }

  // ==================== 轮询管理 ====================

  /**
   * 启动轮询
   */
  private start_polling(): void {
    if (this.polling_timer) {
      clearInterval(this.polling_timer);
    }

    if (this.connection_state !== ConnectionState.CONNECTED) {
      this.logger.warn('Cannot start polling: device not connected');
      return;
    }

    this.polling_status.is_running = true;
    this.polling_status.consecutive_errors = 0;

    this.polling_timer = setInterval(() => {
      this.perform_polling();
    }, this.polling_config.interval);

    this.logger.log(`Started MFC polling with interval ${this.polling_config.interval}ms`);
  }

  /**
   * 停止轮询
   */
  private stop_polling(): void {
    if (this.polling_timer) {
      clearInterval(this.polling_timer);
      this.polling_timer = null;
    }

    this.polling_status.is_running = false;
    this.logger.log('Stopped MFC polling');
  }

  /**
   * 执行轮询
   */
  private async perform_polling(): Promise<void> {
    if (this.device_busy || this.polling_subscribers.size === 0) {
      return;
    }

    try {
      await this.status(); // 获取状态数据，更新内部缓存
      const now = new Date().toISOString();

      this.polling_status.last_poll = now;
      this.polling_status.success_count++;
      this.polling_status.consecutive_errors = 0;

      // 准备状态更新消息
      const status_devices = this.device_statuses.size > 0 ?
        Array.from(this.device_statuses.values()).map(device => ({
          device_address: device.address,
          flow_sccm: device.flow_sccm || 0,
          setpoint_sccm: device.setpoint_sccm || 0,
          gas_type: device.gas_type,
          max_flow_sccm: device.max_flow_sccm,
          connection_status: (device.connection_status === ConnectionState.CONNECTED ? 'connected' : 'disconnected') as 'connected' | 'disconnected',
          last_communication: device.last_communication,
        })) : [];

      // 发送状态更新
      if (status_devices.length > 0) {
        this.gateway.sendMfcStatusUpdate({
          type: 'status_update',
          data: status_devices,
          timestamp: now,
        });

        // 添加采样数据
        status_devices.forEach(device => {
          const sample: MfcSample = {
            ts: now,
            address: device.device_address,
            flow_sccm: device.flow_sccm,
            flow_percent: (device.flow_sccm / (device.max_flow_sccm || 1)) * 100,
            digital_setpoint_percent: (device.setpoint_sccm / (device.max_flow_sccm || 1)) * 100,
            active_setpoint_percent: (device.setpoint_sccm / (device.max_flow_sccm || 1)) * 100,
          };
          this.dataService.addFlowSample(sample);
        });

        // 发送采样数据
        this.gateway.sendMfcSamplingData({
          type: 'sampling_data',
          data: status_devices.map(device => ({
            device_address: device.device_address,
            timestamp: now,
            flow_sccm: device.flow_sccm,
            setpoint_sccm: device.setpoint_sccm,
          })),
          timestamp: now,
        });
      }

      // 广播系统状态
      const system_overview = this.dataService.getSystemOverview();
      this.gateway.broadcastSystemStatus(system_overview);

    } catch (error) {
      this.polling_status.error_count++;
      this.polling_status.consecutive_errors++;

      this.errorHandler.handleError(error, ErrorCategory.TIMEOUT, { operation: 'polling' });

      // 如果连续错误过多，暂停轮询
      if (this.polling_status.consecutive_errors >= this.polling_config.retry_attempts) {
        this.logger.warn(`Too many consecutive polling errors (${this.polling_status.consecutive_errors}), pausing polling`);
        this.stop_polling();

        // 延迟后重启轮询
        setTimeout(() => {
          if (this.connection_state === ConnectionState.CONNECTED) {
            this.start_polling();
          }
        }, this.polling_config.retry_delay * this.polling_config.retry_attempts);
      }
    }
  }

  /**
   * 订阅MFC更新
   */
  subscribe_to_mfc_updates(client_id: string): void {
    this.polling_subscribers.add(client_id);
    this.logger.log(`Client ${client_id} subscribed to MFC updates`);

    // 确保轮询正在运行
    if (!this.polling_status.is_running && this.connection_state === ConnectionState.CONNECTED) {
      this.start_polling();
    }
  }

  /**
   * 取消订阅MFC更新
   */
  unsubscribe_from_mfc_updates(client_id: string): void {
    this.polling_subscribers.delete(client_id);
    this.logger.log(`Client ${client_id} unsubscribed from MFC updates`);

    // 如果没有订阅者，停止轮询
    if (this.polling_subscribers.size === 0) {
      this.stop_polling();
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 更新设备状态
   */
  private update_device_status(status_data: any): void {
    const device = this.device_statuses.get(status_data.address);
    if (device) {
      device.flow_sccm = status_data.flow_sccm;
      device.setpoint_sccm = status_data.setpoint_sccm || status_data.active_setpoint_percent * (device.max_flow_sccm || 1) / 100;
      device.connection_status = ConnectionState.CONNECTED;
      device.last_communication = new Date().toISOString();
      device.error_message = undefined;
    }
  }

  /**
   * 设置设备忙状态
   */
  private set_device_busy(operation: string): void {
    this.device_busy = true;
    this.busy_operations.add(operation);
  }

  /**
   * 清除设备忙状态
   */
  private clear_device_busy(operation: string): void {
    this.busy_operations.delete(operation);
    if (this.busy_operations.size === 0) {
      this.device_busy = false;
    }
  }

  /**
   * 检查设备是否忙碌
   */
  is_device_busy(): boolean {
    return this.device_busy;
  }

  // ==================== 兼容性方法 ====================

  /**
   * 通用透传方法 - 保持向后兼容
   */
  async passthrough(method: string, params?: any): Promise<any> {
    switch (method) {
      case 'health':
        return await this.device.health();
      case 'ports':
        return await this.device.get_available_ports();
      case 'connect':
        return await this.connect(params);
      case 'disconnect':
        return await this.disconnect();
      case 'scan':
        return await this.scan(params?.start, params?.end);
      case 'status':
        return await this.status(params?.address);
      case 'setpoint':
        return await this.setpoint(params.address, params.sccm);
      case 'comm-log':
        return await this.get_communication_log();
      case 'clear-comm-log':
        return await this.clear_communication_log();
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }
}
