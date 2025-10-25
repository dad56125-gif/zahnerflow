import { Injectable, Logger, OnModuleInit, HttpException, HttpStatus, Inject, forwardRef } from '@nestjs/common';
import { FurnaceDeviceService } from '../../devices/furnace-device.service';
import { FurnaceErrorHandlerService } from './services/furnace-error-handler.service';
import { FurnaceDataService } from './furnace-data.service';
import { WorkflowGateway } from '../../gateways/workflow.gateway';
import type { FurnacePreset, ProgramSegment } from '@zahnerflow/types';

// 轮询状态更新接口
export interface FurnaceStatusUpdate {
  device_name: string;
  timestamp: string;
  status: {
    pv: number;
    sv: number;
    mv: number;
    status: string;
    segment: number;
    segment_time: number;
    segment_time_set: number;
  };
  connection_state: {
    status: 'connected' | 'disconnected';
    last_connected?: string;
    reconnect_attempts: number;
  };
  operation_state: 'idle' | 'running' | 'paused' | 'stopped';
  is_busy: boolean;
}

// 轮询采样数据接口
export interface FurnaceSamplingData {
  device_name: string;
  timestamp: string;
  temperature: number;
  sv: number;
  mv: number;
}

// 连接状态枚举
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

// 连接状态管理器
class ConnectionStateManager {
  private currentState: ConnectionState = ConnectionState.DISCONNECTED;
  private stateChangeListeners: Array<(state: ConnectionState) => void> = [];
  private connectionParams: any = null;
  private readonly logger = new Logger(ConnectionStateManager.name);

  getCurrentState(): ConnectionState {
    return this.currentState;
  }

  async connect(connectionParams: any): Promise<boolean> {
    if (this.currentState === ConnectionState.CONNECTED) {
      return true;
    }

    this.setState(ConnectionState.CONNECTING);
    this.connectionParams = connectionParams;

    try {
      // 尝试连接 - 这里会调用实际的设备连接逻辑
      const result = await this.attemptConnection(connectionParams);

      if (result.connected) {
        this.setState(ConnectionState.CONNECTED);
        return true;
      } else {
        this.setState(ConnectionState.ERROR);
        return false;
      }
    } catch (error) {
      this.setState(ConnectionState.ERROR);
      this.logger.error('Connection failed:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.setState(ConnectionState.DISCONNECTED);
    this.connectionParams = null;
  }

  async attemptReconnection(): Promise<boolean> {
    if (!this.connectionParams) {
      return false;
    }

    this.logger.log('Attempting to reconnect...');
    return this.connect(this.connectionParams);
  }

  // 设置状态方法 - 允许外部调用
  setState(newState: ConnectionState): void {
    const oldState = this.currentState;
    this.currentState = newState;

    this.logger.log(`Connection state changed: ${oldState} -> ${newState}`);

    // 通知所有监听器
    this.stateChangeListeners.forEach(listener => {
      listener(newState);
    });
  }

  onStateChange(listener: (state: ConnectionState) => void): void {
    this.stateChangeListeners.push(listener);
  }

  private async attemptConnection(params: any): Promise<any> {
    // 这里会调用实际的设备连接逻辑
    // 在实际实现中，这应该调用device service的connect方法
    return { connected: true };
  }
}

/**
 * 熔炉服务门面模式
 * 协调设备控制服务和数据管理服务，提供统一的API接口
 * 保持与现有Controller的兼容性
 */
@Injectable()
export class FurnaceService implements OnModuleInit {
  private readonly logger = new Logger(FurnaceService.name);

  // 延迟初始化相关
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  // 连接状态管理
  private connectionManager = new ConnectionStateManager();

  // 设备状态管理 - 从设备层转移过来
  private is_busy = false;
  private last_busy_time = 0;
  private readonly busy_cooldown_ms = 3000; // 3秒冷却时间
  private readonly normal_timeout = 1500;
  private readonly extended_timeout = 15000;

  // 轮询管理相关 - 从FurnacePollingManagerService迁移过来
  private readonly POLLING_INTERVAL = 2000; // 2秒轮询间隔
  private readonly SAMPLING_INTERVAL = 1000; // 1秒采样间隔
  private readonly RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAY = 1000;

  private polling_timer: NodeJS.Timeout | null = null;
  private sampling_timer: NodeJS.Timeout | null = null;
  private is_polling = false;
  private is_sampling = false;
  private is_polling_paused = false; // 轮询暂停状态
  private retry_count = 0;
  private last_status: FurnaceStatusUpdate | null = null;
  private readonly subscribers = new Set<string>(); // WebSocket客户端ID集合
  private operation_in_progress = false; // 当前是否有操作在进行

  constructor(
    private readonly device: FurnaceDeviceService,
    private readonly errorHandler: FurnaceErrorHandlerService,
    private readonly furnaceData: FurnaceDataService,
    @Inject(forwardRef(() => WorkflowGateway))
    private readonly workflowGateway: WorkflowGateway,
  ) {
    // 监听连接状态变化
    this.connectionManager.onStateChange(async (state) => {
      this.logger.log(`Furnace connection state: ${state}`);
      // 可以在这里添加更多状态变化的处理逻辑
    });
  }

  async onModuleInit(): Promise<void> {
    // 正确：模块初始化时不连接设备，只记录日志
    this.logger.log('FurnaceService module initialized (device not connected yet)');
  }

  // 延迟初始化方法
  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._performInitialization();
    return this.initializationPromise;
  }

  private async _performInitialization(): Promise<void> {
    try {
      // 1. 使用错误处理器检查FastAPI服务是否可用
      const health = await this.errorHandler.handleDeviceOperation(
        () => this.device.health(),
        { operation: 'health_check' }
      );
      this.logger.log(`Furnace FastAPI health check passed: ${JSON.stringify(health)}`);

      // 2. 使用错误处理器检查可用端口
      const ports = await this.errorHandler.handleDeviceOperation(
        () => this.device.ports(),
        { operation: 'list_ports' }
      );
      this.logger.log(`Available ports: ${ports.join(', ')}`);

      // 3. 标记初始化完成
      this.isInitialized = true;
      this.logger.log('FurnaceService initialized successfully');

    } catch (error: any) {
      this.logger.error(`FurnaceService initialization failed: ${error.message}`);
      this.initializationPromise = null; // 允许重试
      throw error;
    }
  }

  // ========== 门面模式方法 - 委托给相应服务 ==========

  // ---------- 连接状态管理 ----------
  // 获取当前连接状态
  get_connection_state(): ConnectionState {
    return this.connectionManager.getCurrentState();
  }

  /**
   * 获取连接状态详细信息（用于状态更新）
   */
  private async get_connection_state_details(): Promise<any> {
    try {
      // 这里应该从设备服务获取实际的连接状态
      // 暂时返回模拟状态
      return {
        status: 'connected',
        last_connected: new Date().toISOString(),
        reconnect_attempts: 0,
      };
    } catch {
      return {
        status: 'disconnected',
        reconnect_attempts: 0,
      };
    }
  }

  // 尝试重连方法
  async attempt_reconnection(): Promise<boolean> {
    return this.connectionManager.attemptReconnection();
  }

  // 检查设备是否已连接
  is_device_connected(): boolean {
    return this.connectionManager.getCurrentState() === ConnectionState.CONNECTED;
  }

  // ---------- Device passthrough ----------
  async passthrough(action: 'connect'|'disconnect'|'run'|'pause'|'stop', body?: any) {
    if (action === 'connect') return this.connect(body);
    if (action === 'disconnect') return this.disconnect();
    if (action === 'run') return this.run();
    if (action === 'pause') return this.pause();
    if (action === 'stop') return this.stop();
  }

  // ---------- 设备控制方法 ----------
  // 连接方法 - 包含初始化检查和状态管理
  async connect(connectionParams: {
    port: string;
    baudrate?: number;
    address?: number;
    stopbits?: number;
    timeout?: number
  }): Promise<any> {
    // 1. 确保服务已初始化
    await this.ensureInitialized();

    // 2. 通过连接管理器连接
    const connected = await this.connectionManager.connect(connectionParams);

    if (!connected) {
      throw new HttpException('Failed to connect to furnace', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    try {
      // 3. 使用错误处理器实际调用设备连接
      const result = await this.errorHandler.handleDeviceConnection(
        () => this.device.connect(connectionParams),
        {
          operation: 'connect',
          port: connectionParams.port,
          address: connectionParams.address
        }
      );

      if (!result.connected) {
        this.connectionManager.setState(ConnectionState.ERROR);
        throw new HttpException('Device connection failed', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return result;
    } catch (error: any) {
      this.connectionManager.setState(ConnectionState.ERROR);

      // 将原始错误转换为更友好的HTTP异常
      if (error.code === 'DEVICE_ERROR' || error.category === 'DEVICE') {
        throw new HttpException(
          `设备连接失败: ${error.message}`,
          HttpStatus.SERVICE_UNAVAILABLE
        );
      }

      if (error.code === 'TIMEOUT_ERROR' || error.category === 'TIMEOUT') {
        throw new HttpException(
          `设备连接超时: ${error.message}`,
          HttpStatus.REQUEST_TIMEOUT
        );
      }

      throw error;
    }
  }

  // 断开连接方法
  async disconnect(): Promise<any> {
    await this.connectionManager.disconnect();
    return this.device.disconnect();
  }

  // 运行方法 - 需要初始化检查和连接状态检查
  async run(): Promise<any> {
    await this.ensureInitialized();
    if (this.connectionManager.getCurrentState() !== ConnectionState.CONNECTED) {
      throw new HttpException('Device not connected', HttpStatus.SERVICE_UNAVAILABLE);
    }

    return this.errorHandler.handleDeviceOperation(
      () => this.device.run(),
      { operation: 'run_program' }
    );
  }

  // 暂停方法 - 需要初始化检查和连接状态检查
  async pause(): Promise<any> {
    await this.ensureInitialized();
    if (this.connectionManager.getCurrentState() !== ConnectionState.CONNECTED) {
      throw new HttpException('Device not connected', HttpStatus.SERVICE_UNAVAILABLE);
    }

    return this.errorHandler.handleDeviceOperation(
      () => this.device.pause(),
      { operation: 'pause_program' }
    );
  }

  // 停止方法 - 需要初始化检查和连接状态检查
  async stop(): Promise<any> {
    await this.ensureInitialized();
    if (this.connectionManager.getCurrentState() !== ConnectionState.CONNECTED) {
      throw new HttpException('Device not connected', HttpStatus.SERVICE_UNAVAILABLE);
    }

    return this.errorHandler.handleDeviceOperation(
      () => this.device.stop(),
      { operation: 'stop_program' }
    );
  }

  // 状态方法 - 需要初始化检查和连接状态检查
  async status(): Promise<any> {
    await this.ensureInitialized();
    if (this.connectionManager.getCurrentState() !== ConnectionState.CONNECTED) {
      throw new HttpException('Device not connected', HttpStatus.SERVICE_UNAVAILABLE);
    }

    return this.execute_device_operation(
      () => this.device.status(),
      'status_query'
    );
  }

  // 健康检查方法 - 只需要初始化检查
  async health(): Promise<any> {
    await this.ensureInitialized();
    return this.device.health();
  }

  // 端口方法 - 只需要初始化检查
  async ports(): Promise<string[]> {
    await this.ensureInitialized();
    return this.device.ports();
  }

  // 通信日志方法 - 只需要初始化检查
  async getCommLog(): Promise<any> {
    await this.ensureInitialized();
    return this.device.getCommLog();
  }

  // 设置SV方法 - 需要初始化检查和连接状态检查
  async setSv(sv: number): Promise<any> {
    await this.ensureInitialized();
    if (this.connectionManager.getCurrentState() !== ConnectionState.CONNECTED) {
      throw new HttpException('Device not connected', HttpStatus.SERVICE_UNAVAILABLE);
    }

    return this.errorHandler.handleDeviceOperation(
      () => this.device.setSv(sv),
      { operation: 'set_temperature', temperature: sv }
    );
  }

  // 设置程序段方法 - 需要初始化检查和连接状态检查
  async setSegment(segment: number): Promise<any> {
    await this.ensureInitialized();
    if (this.connectionManager.getCurrentState() !== ConnectionState.CONNECTED) {
      throw new HttpException('Device not connected', HttpStatus.SERVICE_UNAVAILABLE);
    }

    return this.errorHandler.handleDeviceOperation(
      () => this.device.setSegment(segment),
      { operation: 'set_segment', segment_id: segment }
    );
  }

  // 获取程序段方法 - 需要初始化检查和连接状态检查
  async getProgramSegments(): Promise<ProgramSegment[]> {
    await this.ensureInitialized();
    if (this.connectionManager.getCurrentState() !== ConnectionState.CONNECTED) {
      throw new HttpException('Device not connected', HttpStatus.SERVICE_UNAVAILABLE);
    }

    // 设置操作进行状态，自动暂停轮询
    this.set_operation_in_progress(true);

    try {
      return await this.execute_device_operation(
        () => this.device.getProgramSegments(),
        'read_program_segments',
        true // 使用扩展超时
      );
    } catch (error) {
      throw error;
    } finally {
      // 程序段读取完成后，立即恢复轮询
      this.set_operation_in_progress(false);
      this.logger.debug('程序段读取完成，恢复轮询');
    }
  }

  // 设置程序段方法 - 需要初始化检查和连接状态检查
  async setProgramSegments(segments: ProgramSegment[]): Promise<any> {
    await this.ensureInitialized();
    if (this.connectionManager.getCurrentState() !== ConnectionState.CONNECTED) {
      throw new HttpException('Device not connected', HttpStatus.SERVICE_UNAVAILABLE);
    }

    // 设置操作进行状态，自动暂停轮询
    this.set_operation_in_progress(true);

    try {
      return await this.execute_device_operation(
        () => this.device.setProgramSegments(segments as any),
        'write_program_segments',
        true // 使用扩展超时
      );
    } catch (error) {
      throw error;
    } finally {
      // 程序段写入完成后，立即恢复轮询
      this.set_operation_in_progress(false);
      this.logger.debug('程序段写入完成，恢复轮询');
    }
  }

  // 设备忙碌状态查询（用于API层节流）
  is_device_busy(): boolean {
    return this.is_busy || (Date.now() - this.last_busy_time < this.busy_cooldown_ms);
  }

  // ---------- 数据管理方法（委托给FurnaceDataService） ----------
  async list_presets(): Promise<Pick<FurnacePreset, 'name'|'createdAt'|'updatedAt'>[]> {
    return this.furnaceData.listPresets();
  }

  async get_preset(name: string): Promise<FurnacePreset> {
    return this.furnaceData.getPreset(name);
  }

  async create_preset(name: string, segments: ProgramSegment[], summary?: string): Promise<FurnacePreset> {
    return this.furnaceData.createPreset(name, segments, summary);
  }

  async update_preset(name: string, segments: ProgramSegment[]): Promise<FurnacePreset> {
    return this.furnaceData.updatePreset(name, segments);
  }

  async delete_preset(name: string): Promise<void> {
    return this.furnaceData.deletePreset(name);
  }

  async clone_preset(name: string, newName: string): Promise<FurnacePreset> {
    return this.furnaceData.clonePreset(name, newName);
  }

  // 历史数据管理
  async get_history_data(params: {
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    return this.furnaceData.getHistoryData(params);
  }

  async export_data(params: {
    start_date?: string;
    end_date?: string;
    format?: 'csv' | 'json' | 'excel';
  }): Promise<{ download_url: string; filename: string }> {
    return this.furnaceData.exportData(params);
  }

  async cleanup_data(olderThanDays: number = 30): Promise<{ deleted_count: number }> {
    return this.furnaceData.cleanupData(olderThanDays);
  }

  // 应用预设 - 需要协调设备控制和数据管理
  async apply_preset(name: string): Promise<{ changed: boolean; steps: string[] }> {
    return this.furnaceData.applyPreset(
      name,
      () => this.getProgramSegments(),
      (segments) => this.setProgramSegments(segments)
    );
  }

  /**
   * 智能超时策略执行设备操作
   */
  private async execute_device_operation<T>(
    operation: () => Promise<T>,
    operationName: string,
    useExtendedTimeout: boolean = false
  ): Promise<T> {
    // 检查是否需要使用扩展超时
    const needsExtendedTimeout = useExtendedTimeout || this.is_busy ||
      (Date.now() - this.last_busy_time < this.busy_cooldown_ms);

    try {
      // 使用设备层的executeWithTimeout方法
      const result = await this.device.executeWithTimeout(operation, needsExtendedTimeout);
      // 成功响应后，重置忙碌状态
      this.is_busy = false;
      return result;
    } catch (error: any) {
      // 如果是超时错误，标记为忙碌状态
      if (error.code === 'ECONNABORTED' && error.message.includes('timeout')) {
        this.is_busy = true;
        this.last_busy_time = Date.now();
        this.logger.warn(`设备操作 ${operationName} 响应超时，切换到扩展超时模式 (${this.extended_timeout}ms)`);
      }
      throw error;
    }
  }

  // ========== 轮询管理功能 - 从FurnacePollingManagerService迁移过来 ==========

  /**
   * 订阅熔炉状态更新
   */
  subscribe_to_furnace_updates(client_id: string): void {
    this.subscribers.add(client_id);
    this.logger.log(`Client ${client_id} subscribed to furnace updates`);

    // 如果还没有开始轮询，开始轮询
    if (!this.is_polling) {
      this.start_furnace_polling();
    }
  }

  /**
   * 取消订阅熔炉状态更新
   */
  unsubscribe_from_furnace_updates(client_id: string): void {
    this.subscribers.delete(client_id);
    this.logger.log(`Client ${client_id} unsubscribed from furnace updates`);

    // 如果没有订阅者了，停止轮询
    if (this.subscribers.size === 0) {
      this.stop_furnace_polling();
      this.stop_furnace_sampling();
    }
  }

  /**
   * 开始轮询熔炉状态
   */
  private start_furnace_polling(): void {
    if (this.is_polling) {
      return;
    }

    this.is_polling = true;
    this.retry_count = 0;
    this.logger.log('Starting furnace status polling');

    // 立即执行一次状态检查
    this.poll_furnace_status();

    // 设置定时轮询
    this.polling_timer = setInterval(() => {
      this.poll_furnace_status();
    }, this.POLLING_INTERVAL);
  }

  /**
   * 停止轮询熔炉状态
   */
  private stop_furnace_polling(): void {
    if (this.polling_timer) {
      clearInterval(this.polling_timer);
      this.polling_timer = null;
    }
    this.is_polling = false;
    this.logger.log('Stopped furnace status polling');
  }

  /**
   * 开始采样
   */
  private start_furnace_sampling(): void {
    if (this.is_sampling) {
      return;
    }

    this.is_sampling = true;
    this.logger.log('Starting furnace sampling');

    this.sampling_timer = setInterval(() => {
      this.sample_furnace_data();
    }, this.SAMPLING_INTERVAL);
  }

  /**
   * 停止采样
   */
  private stop_furnace_sampling(): void {
    if (this.sampling_timer) {
      clearInterval(this.sampling_timer);
      this.sampling_timer = null;
    }
    this.is_sampling = false;
    this.logger.log('Stopped furnace sampling');
  }

  /**
   * 轮询熔炉状态
   */
  private async poll_furnace_status(): Promise<void> {
    try {
      // 检查设备是否忙碌（轮询暂停状态）
      if (this.is_device_busy() || this.is_polling_paused) {
        this.logger.debug('设备轮询已暂停，跳过本次状态查询');
        return;
      }

      const status = await this.device.status();
      const connectionState = await this.get_connection_state_details();
      const operationState = this.derive_operation_state(status?.status);

      const status_update: FurnaceStatusUpdate = {
        device_name: 'furnace',
        timestamp: new Date().toISOString(),
        status: {
          pv: status?.pv ?? 0,
          sv: status?.sv ?? 0,
          mv: status?.mv ?? 0,
          status: this.normalize_status(status?.status),
          segment: status?.segment ?? 0,
          segment_time: status?.segment_time ?? 0,
          segment_time_set: status?.segment_time_set ?? 0,
        },
        connection_state: connectionState,
        operation_state: operationState,
        is_busy: this.is_device_busy(),
      };

      // 检查状态是否发生变化
      const hasChanged = this.has_status_changed(status_update);

      if (hasChanged || this.retry_count === 0) {
        // 发送状态更新到所有订阅者
        this.broadcast_status_update(status_update);
        this.last_status = { ...status_update };
        this.retry_count = 0;
      }

      // 标记设备活跃状态给数据管理服务
      // 不再需要，数据管理由furnace-data.service处理

    } catch (error) {
      this.logger.error(`Failed to poll furnace status: ${error.message}`);
      await this.handle_polling_error(error);
    }
  }

  /**
   * 采样熔炉数据
   */
  private async sample_furnace_data(): Promise<void> {
    try {
      // 只有在设备连接且不忙碌时才采样
      if (!await this.is_device_connected() || this.is_device_busy() || this.is_polling_paused) {
        return;
      }

      const status = await this.device.status();

      const sampling_data: FurnaceSamplingData = {
        device_name: 'furnace',
        timestamp: new Date().toISOString(),
        temperature: status?.pv ?? 0,
        sv: status?.sv ?? 0,
        mv: status?.mv ?? 0,
      };

      // 发送采样数据到数据管理服务
      await this.furnaceData.addFurnaceSample(sampling_data);

      // 广播采样数据到所有订阅者
      this.broadcast_sampling_data(sampling_data);

    } catch (error) {
      this.logger.warn(`Failed to sample furnace data: ${error.message}`);
      // 采样错误不影响轮询，静默处理
    }
  }

  /**
   * 广播状态更新到所有订阅者
   */
  private broadcast_status_update(status_update: FurnaceStatusUpdate): void {
    this.workflowGateway.sendDeviceStatusUpdate('furnace', status_update);
    // 改为info级别，减少debug日志噪音
    this.logger.debug(`Broadcasted furnace status update to ${this.subscribers.size} subscribers`);
  }

  /**
   * 广播采样数据到所有订阅者
   */
  private broadcast_sampling_data(sampling_data: FurnaceSamplingData): void {
    this.workflowGateway.broadcast('furnaceSamplingData', sampling_data);
    this.logger.debug(`Broadcasted furnace sampling data to ${this.subscribers.size} subscribers`);
  }

  
  /**
   * 根据状态字符串推断运行状态
   */
  private derive_operation_state(rawStatus: string): 'idle' | 'running' | 'paused' | 'stopped' {
    const status = String(rawStatus ?? '').toLowerCase();

    if (status === 'run' || status === 'running') {
      return 'running';
    } else if (status === 'pause' || status === 'paused' || status === 'hold') {
      return 'paused';
    } else if (status === 'stop' || status === 'stopped') {
      return 'stopped';
    } else {
      return 'idle';
    }
  }

  /**
   * 规范化状态字符串
   */
  private normalize_status(rawStatus: string): string {
    const status = String(rawStatus ?? '').toLowerCase();

    if (status === 'pause' || status === 'paused' || status === 'hold') {
      return 'hold';
    } else if (status === 'run' || status === 'running') {
      return 'run';
    } else if (status === 'stop' || status === 'stopped') {
      return 'stop';
    } else {
      return status || 'unknown';
    }
  }

  /**
   * 检查状态是否发生变化
   */
  private has_status_changed(current_status: FurnaceStatusUpdate): boolean {
    if (!this.last_status) {
      return true;
    }

    return (
      this.last_status.status.pv !== current_status.status.pv ||
      this.last_status.status.sv !== current_status.status.sv ||
      this.last_status.status.mv !== current_status.status.mv ||
      this.last_status.status.status !== current_status.status.status ||
      this.last_status.status.segment !== current_status.status.segment ||
      this.last_status.connection_state.status !== current_status.connection_state.status ||
      this.last_status.operation_state !== current_status.operation_state
    );
  }

  
  /**
   * 处理轮询错误
   */
  private async handle_polling_error(error: any): Promise<void> {
    this.retry_count++;

    if (this.retry_count <= this.RETRY_ATTEMPTS) {
      this.logger.warn(`Polling attempt ${this.retry_count} failed, retrying in ${this.RETRY_DELAY}ms`);

      // 发送错误状态到订阅者
      const error_status: FurnaceStatusUpdate = {
        device_name: 'furnace',
        timestamp: new Date().toISOString(),
        status: {
          pv: 0,
          sv: 0,
          mv: 0,
          status: 'error',
          segment: 0,
          segment_time: 0,
          segment_time_set: 0,
        },
        connection_state: {
          status: 'disconnected',
          reconnect_attempts: this.retry_count,
        },
        operation_state: 'idle',
        is_busy: false,
      };

      this.broadcast_status_update(error_status);

      // 延迟后重试
      setTimeout(() => {
        if (this.is_polling) {
          this.poll_furnace_status();
        }
      }, this.RETRY_DELAY * this.retry_count);
    } else {
      this.logger.error(`Polling failed after ${this.RETRY_ATTEMPTS} attempts, stopping polling`);

      // 停止轮询，但保留订阅关系，等待外部重新启动
      this.stop_furnace_polling();
      this.stop_furnace_sampling();

      // 发送最终错误状态
      const final_error_status: FurnaceStatusUpdate = {
        device_name: 'furnace',
        timestamp: new Date().toISOString(),
        status: {
          pv: 0,
          sv: 0,
          mv: 0,
          status: 'disconnected',
          segment: 0,
          segment_time: 0,
          segment_time_set: 0,
        },
        connection_state: {
          status: 'disconnected',
          reconnect_attempts: this.retry_count,
        },
        operation_state: 'idle',
        is_busy: false,
      };

      this.broadcast_status_update(final_error_status);
    }
  }

  /**
   * 获取轮询管理器状态
   */
  get_polling_status(): {
    is_polling: boolean;
    is_sampling: boolean;
    subscriber_count: number;
    retry_count: number;
    last_update?: string;
    is_polling_paused: boolean;
  } {
    return {
      is_polling: this.is_polling,
      is_sampling: this.is_sampling,
      subscriber_count: this.subscribers.size,
      retry_count: this.retry_count,
      last_update: this.last_status?.timestamp,
      is_polling_paused: this.is_polling_paused,
    };
  }

  /**
   * 暂停轮询 - 供业务层调用
   */
  pause_polling(): void {
    this.is_polling_paused = true;
    this.logger.debug('业务层请求暂停轮询');
  }

  /**
   * 恢复轮询 - 供业务层调用
   */
  resume_polling(): void {
    this.is_polling_paused = false;
    this.logger.debug('业务层请求恢复轮询');
  }

  /**
   * 检查轮询是否暂停
   */
  check_polling_paused(): boolean {
    return this.is_polling_paused;
  }

  /**
   * 设置操作进行状态
   */
  set_operation_in_progress(in_progress: boolean): void {
    this.operation_in_progress = in_progress;
    if (in_progress) {
      this.logger.debug('设备操作开始，暂停轮询');
      this.pause_polling();
    } else {
      this.logger.debug('设备操作完成，恢复轮询');
      this.resume_polling();
    }
  }

  /**
   * 检查是否有操作在进行
   */
  is_operation_in_progress(): boolean {
    return this.operation_in_progress;
  }
}
