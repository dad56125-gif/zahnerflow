import { Injectable, HttpException, HttpStatus, Logger, OnModuleInit } from '@nestjs/common';
import { FurnaceDeviceService } from '../../devices/furnace-device.service';
import { FurnaceErrorHandlerService } from './services/furnace-error-handler.service';
import type { ProgramSegment } from '@zahnerflow/types';

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
 * 熔炉设备控制服务
 * 负责所有设备控制相关逻辑：连接、运行控制、状态查询等
 */
@Injectable()
export class FurnaceControlService implements OnModuleInit {
  private readonly logger = new Logger(FurnaceControlService.name);

  // 延迟初始化相关
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  // 连接状态管理
  private connectionManager = new ConnectionStateManager();

  constructor(
    private readonly device: FurnaceDeviceService,
    private readonly errorHandler: FurnaceErrorHandlerService
  ) {
    // 监听连接状态变化
    this.connectionManager.onStateChange(async (state) => {
      this.logger.log(`Furnace connection state: ${state}`);
      // 可以在这里添加更多状态变化的处理逻辑
    });
  }

  async onModuleInit(): Promise<void> {
    // 正确：模块初始化时不连接设备，只记录日志
    this.logger.log('FurnaceControlService module initialized (device not connected yet)');
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
      this.logger.log('FurnaceControlService initialized successfully');

    } catch (error: any) {
      this.logger.error(`FurnaceControlService initialization failed: ${error.message}`);
      this.initializationPromise = null; // 允许重试
      throw error;
    }
  }

  // 获取当前连接状态
  getConnectionState(): ConnectionState {
    return this.connectionManager.getCurrentState();
  }

  // 尝试重连方法
  async attemptReconnection(): Promise<boolean> {
    return this.connectionManager.attemptReconnection();
  }

  // 检查设备是否已连接
  isDeviceConnected(): boolean {
    return this.connectionManager.getCurrentState() === ConnectionState.CONNECTED;
  }

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
  async getStatus(): Promise<any> {
    await this.ensureInitialized();
    if (this.connectionManager.getCurrentState() !== ConnectionState.CONNECTED) {
      throw new HttpException('Device not connected', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return this.device.status();
  }

  // 健康检查方法 - 只需要初始化检查
  async getHealth(): Promise<any> {
    await this.ensureInitialized();
    return this.device.health();
  }

  // 端口方法 - 只需要初始化检查
  async getPorts(): Promise<string[]> {
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

    return this.errorHandler.handleProgramSegmentsOperation(
      () => this.device.getProgramSegments(),
      { operation: 'read_program_segments' }
    );
  }

  // 设置程序段方法 - 需要初始化检查和连接状态检查
  async setProgramSegments(segments: ProgramSegment[]): Promise<any> {
    await this.ensureInitialized();
    if (this.connectionManager.getCurrentState() !== ConnectionState.CONNECTED) {
      throw new HttpException('Device not connected', HttpStatus.SERVICE_UNAVAILABLE);
    }

    return this.errorHandler.handleProgramSegmentsOperation(
      () => this.device.setProgramSegments(segments as any),
      { operation: 'write_program_segments' }
    );
  }

  // 设备忙碌状态查询（用于API层节流）
  isDeviceBusy(): boolean {
    // 当设备在进行程序段读/写等长耗时操作时，设备层会暂停轮询
    // 这里直接复用设备层暂停标志作为"忙碌"判定
    try {
      // 类型上为同步布尔值，无需等待
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return this.device.isPollingPausedState();
    } catch {
      return false;
    }
  }
}