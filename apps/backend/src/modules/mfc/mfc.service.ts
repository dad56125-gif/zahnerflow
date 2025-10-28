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

  // 扫描状态管理
  private scanning = false;
  private last_scan_time = 0;
  private readonly SCAN_COOLDOWN = 1000; // 1秒内不允许重复扫描

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

    // 不在模块初始化时启动轮询，只有在设备连接后才启动
    // this.start_polling(); // 移除自动轮询启动
  }

  onModuleDestroy(): void {
    this.stop_polling();
  }

  // ==================== 设备发现和扫描 ====================

  /**
   * 扫描MFC设备 - 支持实时设备发现
   */
  async scan(start?: number, end?: number): Promise<MfcDeviceInfo[]> {
    return this.errorHandler.handleDeviceScan(
      async () => {
        this.set_device_busy('scan');

        // 设置默认扫描范围：32-80
        const scan_start = start ?? 32;
        const scan_end = end ?? 80;

        this.logger.log(`Starting MFC scan with realtime discovery: addresses ${scan_start}-${scan_end}`);

        // 启动设备发现事件轮询 - 实现单地址发现即推送
        this.logger.log('Starting device discovery polling for real-time push');
        this.startDeviceDiscoveryPolling(100); // 100ms轮询间隔

        const found_devices: MfcDeviceInfo[] = [];

        try {
          // 调用FastAPI /scan接口，现在支持实时设备发现
          this.logger.debug(`Calling FastAPI /scan interface for addresses ${scan_start}-${scan_end}...`);
          const scan_result = await this.device.scan_devices({ start: scan_start, end: scan_end });

          if (scan_result && scan_result.devices && Array.isArray(scan_result.devices)) {
            // 处理扫描到的设备，发现立即推送
            for (const device_status of scan_result.devices) {
              if (device_status.device_address !== undefined) {
                const device_info: MfcDeviceInfo = {
                  address: device_status.device_address,
                  gas_type: device_status.gas_type || 'Unknown',
                  max_flow_sccm: device_status.max_flow_sccm || 0
                };

                found_devices.push(device_info);
                this.logger.log(`Found MFC device at address ${device_status.device_address}: gas_type=${device_info.gas_type}, max_flow=${device_info.max_flow_sccm} SCCM`);

                // 初始化设备状态
                this.device_statuses.set(device_status.device_address, {
                  address: device_info.address,
                  connection_status: ConnectionState.CONNECTED,
                  last_communication: new Date().toISOString(),
                  gas_type: device_info.gas_type,
                  max_flow_sccm: device_info.max_flow_sccm,
                });

                // 立即推送发现的设备给前端
                this.gateway.sendMfcDeviceDiscovered({
                  type: 'device_discovered',
                  data: {
                    device_address: device_info.address,
                    gas_type: device_info.gas_type,
                    max_flow_sccm: device_info.max_flow_sccm,
                    connection_status: 'connected',
                    last_communication: new Date().toISOString()
                  },
                  timestamp: new Date().toISOString(),
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

        this.logger.log(`MFC scan with realtime discovery completed: found ${found_devices.length} devices, ${timeout_addresses_count} addresses not found`);

        // 停止设备发现轮询
        this.logger.log('Stopping device discovery polling');
        this.stopDeviceDiscoveryPolling();

        return this.discovered;
      },
      {
        operation: 'scan',
        start,
        end
      }
    ).finally(() => {
      this.clear_device_busy('scan');
      // 确保轮询停止 - 防止异常情况下轮询继续运行
      this.stopDeviceDiscoveryPolling();
    });
  }

  /**
   * 启动实时扫描会话 - 单地址发现即推送
   */
  async startRealtimeScan(start?: number, end?: number): Promise<{session_id: string; status: string}> {
    return this.errorHandler.handleDeviceScan(
      async () => {
        this.set_device_busy('scan');

        const scan_start = start ?? 32;
        const scan_end = end ?? 80;

        this.logger.log(`Starting realtime scan session: addresses ${scan_start}-${scan_end}`);

        const result = await this.device.start_realtime_scan_session({ start: scan_start, end: scan_end });

        // 启动事件监听和推送
        this._startEventListeningForSession(result.session_id);

        return {
          session_id: result.session_id,
          status: result.status
        };
      },
      {
        operation: 'realtime-scan-start',
        start,
        end
      }
    ).finally(() => {
      this.clear_device_busy('scan');
    });
  }

  /**
   * 获取实时扫描状态
   */
  async getRealtimeScanStatus(sessionId: string): Promise<any> {
    try {
      return await this.device.get_realtime_scan_status(sessionId);
    } catch (error) {
      this.logger.error(`Failed to get realtime scan status for session ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取设备发现事件
   */
  async getDeviceDiscoveryEvents(): Promise<any> {
    try {
      const events = await this.device.get_device_discovery_events();

      // 立即推送到前端WebSocket
      if (events.events && events.events.length > 0) {
        for (const event of events.events) {
          if (event.type === 'mfc_device_discovered') {
            this.gateway.sendMfcDeviceDiscovered({
              type: 'device_discovered',
              data: event.data,
              timestamp: event.timestamp
            });
          }
        }
      }

      return events;
    } catch (error) {
      this.logger.error(`Failed to get device discovery events: ${error.message}`);
      throw error;
    }
  }

  /**
   * 取消实时扫描
   */
  async cancelRealtimeScan(sessionId: string): Promise<any> {
    try {
      return await this.device.cancel_realtime_scan(sessionId);
    } catch (error) {
      this.logger.error(`Failed to cancel realtime scan for session ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * 启动事件监听
   */
  private _startEventListeningForSession(sessionId: string): void {
    // 创建定时器轮询设备发现事件
    const pollInterval = setInterval(async () => {
      try {
        const events = await this.getDeviceDiscoveryEvents();

        // 检查扫描是否完成
        const status = await this.getRealtimeScanStatus(sessionId);
        if (status.completed) {
          clearInterval(pollInterval);
          this.logger.log(`Realtime scan session ${sessionId} completed, stopped polling`);
        }
      } catch (error) {
        this.logger.warn(`Error polling events for session ${sessionId}: ${error.message}`);
        clearInterval(pollInterval);
      }
    }, 100); // 每100ms轮询一次

    // 设置超时清理
    setTimeout(() => {
      clearInterval(pollInterval);
    }, 300000); // 5分钟后清理
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

          // 连接成功后，不再自动扫描，改为前端按需调用
          this.logger.log(`MFC connected successfully, ready for scanning on demand`);

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

          // 重启轮询 - 只有在有已知设备时才启动
          if (this.polling_config.enabled && this.device_statuses.size > 0) {
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
   * 仅更新已知设备状态（轮询专用，提高效率）
   */
  private async updateKnownDevicesStatus(): Promise<void> {
    if (this.device_statuses.size === 0) {
      this.logger.debug('No known devices to update');
      return;
    }

    // 再次检查连接状态，防止在没有连接时调用FastAPI
    if (this.connection_state !== ConnectionState.CONNECTED) {
      this.logger.debug('Device not connected, skipping status update');
      return;
    }

    try {
      // 并发查询所有已知设备的状态
      const device_addresses = Array.from(this.device_statuses.keys());
      const statusPromises = device_addresses.map(async (address) => {
        try {
          const result = await this.device.get_device_status(address);
          if (result && result.device_address !== undefined) {
            this.update_device_status(result);
          }
          return { address, success: true, result };
        } catch (error) {
          this.logger.warn(`Failed to get status for device ${address}: ${error.message}`);
          return { address, success: false, error };
        }
      });

      // 等待所有状态查询完成
      const results = await Promise.allSettled(statusPromises);

      // 统计结果
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failCount = results.length - successCount;

      if (failCount > 0) {
        this.logger.warn(`Device status update: ${successCount} success, ${failCount} failed`);
      } else {
        this.logger.debug(`Device status update: ${successCount} devices updated successfully`);
      }

    } catch (error) {
      this.logger.error(`Error updating known devices status: ${error.message}`);
    }
  }

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
      } else if (result && result.device_address !== undefined) {
        this.update_device_status(result);
      }

      this.errorHandler.recordCircuitBreakerSuccess('device_communication');

      // 确保总是返回数组格式，避免前端期望格式不一致
      if (result && !Array.isArray(result)) {
        return [result]; // 将单个对象包装为数组
      }

      return result || [];
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

    // 严格检查连接状态 - 只有设备真正连接时才能启动轮询
    if (this.connection_state !== ConnectionState.CONNECTED) {
      this.logger.warn(`Cannot start polling: device not connected (current state: ${this.connection_state})`);
      return;
    }

    // 确保有已知设备才进行轮询
    if (this.device_statuses.size === 0) {
      this.logger.warn('Cannot start polling: no known devices to poll');
      return;
    }

    this.polling_status.is_running = true;
    this.polling_status.consecutive_errors = 0;

    this.polling_timer = setInterval(() => {
      this.perform_polling();
    }, this.polling_config.interval);

    this.logger.log(`✅ Started MFC polling with interval ${this.polling_config.interval}ms for ${this.device_statuses.size} devices`);
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

    // 检查连接状态，只有在设备已连接时才进行轮询
    if (this.connection_state !== ConnectionState.CONNECTED) {
      this.logger.debug('Skipping polling: device not connected');
      return;
    }

    // 检查是否有已知设备，没有设备时跳过轮询
    if (this.device_statuses.size === 0) {
      this.logger.debug('Skipping polling: no known devices');
      return;
    }

    try {
      // 仅查询已发现的设备，提高效率
      await this.updateKnownDevicesStatus(); // 获取状态数据，更新内部缓存
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
        // 移除自动重启轮询机制 - 遵循KISS原则
      }
    }
  }

  /**
   * 订阅MFC更新
   */
  subscribe_to_mfc_updates(client_id: string): void {
    this.polling_subscribers.add(client_id);
    this.logger.log(`Client ${client_id} subscribed to MFC updates (total subscribers: ${this.polling_subscribers.size})`);

    // 移除WebSocket订阅自动启动轮询机制 - 遵循KISS原则
    this.logger.debug(`Polling not started automatically on subscription (manual control only)`);
    // 轮询应该通过手动接口或明确的设备扫描操作启动
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
    // 直接使用FastAPI返回的device_address字段
    const deviceAddress = status_data.device_address;
    const device = this.device_statuses.get(deviceAddress);
    if (device) {
      device.flow_sccm = status_data.flow_sccm;
      device.setpoint_sccm = status_data.setpoint_sccm || status_data.active_setpoint_percent * (device.max_flow_sccm || 1) / 100;
      device.connection_status = ConnectionState.CONNECTED;
      device.last_communication = new Date().toISOString();
      device.error_message = undefined;

      // 添加调试日志
      this.logger.debug(`Updated device ${deviceAddress}: flow=${device.flow_sccm} SCCM, setpoint=${device.setpoint_sccm} SCCM`);
    } else {
      this.logger.warn(`Device ${deviceAddress} not found in status cache for update`);
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

  // ==================== 实时扫描事件轮询 ====================

  /**
   * 轮询设备发现事件 - 支持单地址发现即推送
   */
  async startDeviceDiscoveryPolling(intervalMs: number = 100): Promise<void> {
    const pollEvents = async () => {
      try {
        // 调用FastAPI的新事件轮询端点
        const events_response = await this.device.http_request('GET', '/scan-events');

        if (events_response && events_response.events && Array.isArray(events_response.events)) {
          for (const event of events_response.events) {
            if (event.type === 'mfc_device_discovered' && event.data) {
              this.logger.log(`Real-time device discovered via polling: address ${event.data.device_address}`);

              // 立即通过WebSocket推送到前端
              this.gateway.sendMfcDeviceDiscovered({
                type: 'device_discovered',
                data: event.data,
                timestamp: event.timestamp || new Date().toISOString()
              });

              // 更新内部设备状态缓存
              this.device_statuses.set(event.data.device_address, {
                address: event.data.device_address,
                connection_status: ConnectionState.CONNECTED,
                last_communication: event.data.last_communication,
                gas_type: event.data.gas_type,
                max_flow_sccm: event.data.max_flow_sccm,
              });
            }
          }
        }
      } catch (error) {
        this.logger.warn(`Device discovery polling failed: ${error.message}`);
      }

      // 继续下一次轮询
      if (this.is_discovery_polling_active) {
        setTimeout(pollEvents, intervalMs);
      }
    };

    // 标记轮询为活跃状态并开始轮询
    this.is_discovery_polling_active = true;
    pollEvents();
  }

  /**
   * 停止设备发现轮询
   */
  stopDeviceDiscoveryPolling(): void {
    this.is_discovery_polling_active = false;
    this.logger.log('Device discovery polling stopped');
  }

  private is_discovery_polling_active: boolean = false;

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
