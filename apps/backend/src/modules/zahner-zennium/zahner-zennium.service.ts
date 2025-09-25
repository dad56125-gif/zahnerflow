import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DeviceStatus, CalibrationResult, ModuleStatus } from '../../interfaces/module-interfaces';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { SimpleEventBus } from '../../notification/simple-event-bus.service';
import { ZahnerDeviceService } from '../../devices/zahner-device.service';
import { ConsoleDisplayManager } from '../../common/console-display-manager.service';
import { MeasurementType } from '@zahnerflow/types';

@Injectable()
export class ZahnerZenniumService implements OnModuleInit, OnModuleDestroy {
  readonly name = 'zahner-zennium';
  readonly version = '2.4.0';
  readonly dependencies = ['HttpModule'];

  private readonly moduleName = 'ZahnerZenniumService';
  private deviceConnected: boolean = false;

  constructor(
    private readonly httpService: HttpService,
    private readonly eventBus: SimpleEventBus,
    private readonly zahnerDeviceService: ZahnerDeviceService,
    private readonly consoleDisplayManager: ConsoleDisplayManager,
  ) {}

  async onModuleInit() {
    if (this.consoleDisplayManager.shouldDisplayLog(this.moduleName, 'enableLog')) {
      this.consoleDisplayManager.log(this.moduleName, 'enableLog', 'ZahnerZenniumService 初始化...');
    }

    try {
      // 连接设备
      await this.zahnerDeviceService.connect();
      this.deviceConnected = true;

      if (this.consoleDisplayManager.shouldDisplayLog(this.moduleName, 'enableLog')) {
        this.consoleDisplayManager.log(this.moduleName, 'enableLog', 'Zahner设备连接成功');
      }
    } catch (error) {
      if (this.consoleDisplayManager.shouldDisplayLog(this.moduleName, 'enableError')) {
        this.consoleDisplayManager.log(this.moduleName, 'enableError', `Zahner设备连接失败: ${error.message}`);
      }
    }
  }

  async onModuleDestroy() {
    if (this.deviceConnected) {
      try {
        await this.zahnerDeviceService.disconnect();
        if (this.consoleDisplayManager.shouldDisplayLog(this.moduleName, 'enableLog')) {
          this.consoleDisplayManager.log(this.moduleName, 'enableLog', 'Zahner设备断开连接');
        }
      } catch (error) {
        if (this.consoleDisplayManager.shouldDisplayLog(this.moduleName, 'enableError')) {
          this.consoleDisplayManager.log(this.moduleName, 'enableError', `设备断开连接失败: ${error.message}`);
        }
      }
    }
  }

  // 获取设备状态
  async getDeviceStatus(): Promise<DeviceStatus> {
    if (!this.deviceConnected) {
      return {
        connected: false,
        busy: false,
        lastActivity: new Date(),
        capabilities: ['eis_measurement', 'potentiostatic', 'galvanostatic'],
        error: '设备未连接'
      };
    }

    await this.zahnerDeviceService.healthCheck();
    const deviceStatus = this.zahnerDeviceService.getStatus();

    return {
      connected: deviceStatus.connected,
      busy: deviceStatus.busy,
      lastActivity: deviceStatus.lastActivity,
      capabilities: ['eis_measurement', 'potentiostatic', 'galvanostatic'],
      error: deviceStatus.error
    };
  }

  // 连接设备（兼容接口）
  async connect(endpoint?: string): Promise<void> {
    // 如果已有活跃连接，先断开
    if (this.deviceConnected) {
      await this.zahnerDeviceService.disconnect();
    }

    try {
      await this.zahnerDeviceService.connect();
      this.deviceConnected = true;

      // 发送设备连接事件
      this.eventBus.emit('device.connected', {
        deviceType: 'zahner-zennium',
        endpoint: endpoint || process.env.ZAHNER_FASTAPI_URL || 'http://localhost:8000',
        timestamp: new Date(),
        context: { source: 'zahner-service' }
      });

      return;
    } catch (error) {
      this.consoleDisplayManager.log(this.moduleName, 'enableError', `设备连接失败: ${error.message}`);

      // 发送设备连接失败事件
      this.eventBus.emit('device.error', {
        deviceType: 'zahner-zennium',
        error: error.message,
        endpoint: endpoint || process.env.ZAHNER_FASTAPI_URL || 'http://localhost:8000',
        timestamp: new Date(),
        context: { source: 'zahner-service' }
      });

      throw error;
    }
  }

  // 断开设备（兼容接口）
  async disconnect(): Promise<void> {
    if (!this.deviceConnected) {
      return;
    }

    try {
      await this.zahnerDeviceService.disconnect();

      // 发送设备断开事件
      this.eventBus.emit('device.disconnected', {
        deviceType: 'zahner-zennium',
        endpoint: process.env.ZAHNER_FASTAPI_URL || 'http://localhost:8000',
        timestamp: new Date(),
        context: { source: 'zahner-service' }
      });

      this.deviceConnected = false;
      return;
    } catch (error) {
      this.consoleDisplayManager.log(this.moduleName, 'enableError', `设备断开失败: ${error.message}`);
      throw error;
    }
  }


  // 启动设备服务 - 连接到FastAPI设备
  async startup(parameters: Record<string, any> = {}): Promise<any> {
    try {
      if (this.consoleDisplayManager.shouldDisplayLog(this.moduleName, 'enableLog')) {
        this.consoleDisplayManager.log(this.moduleName, 'enableLog', '正在启动 Zahner 设备服务...');
      }

      const targetEndpoint = parameters.host || process.env.ZAHNER_FASTAPI_URL || 'http://localhost:8000';

      // 使用connect方法进行连接
      await this.connect(targetEndpoint);

      // 发送启动事件
      this.eventBus.emit('device.started', {
        parameters,
        timestamp: new Date(),
        context: { source: 'zahner-service' }
      });

      if (this.consoleDisplayManager.shouldDisplayLog(this.moduleName, 'enableLog')) {
        this.consoleDisplayManager.log(this.moduleName, 'enableLog', 'Zahner 设备服务启动成功');
      }

      return {
        status: 'success',
        message: '设备服务启动成功'
      };
    } catch (error) {
      if (this.consoleDisplayManager.shouldDisplayLog(this.moduleName, 'enableError')) {
        this.consoleDisplayManager.log(this.moduleName, 'enableError', `设备服务启动失败: ${error.message}`);
      }

      return {
        status: 'error',
        error: error.message
      };
    }
  }

  // 关闭设备服务 - 断开FastAPI设备连接
  async shutdown(): Promise<any> {
    try {
      if (this.consoleDisplayManager.shouldDisplayLog(this.moduleName, 'enableLog')) {
        this.consoleDisplayManager.log(this.moduleName, 'enableLog', '正在关闭 Zahner 设备服务...');
      }

      if (this.deviceConnected) {
        await this.zahnerDeviceService.disconnect();
        this.deviceConnected = false;
      }

      // 发送关闭事件
      this.eventBus.emit('device.stopped', {
        timestamp: new Date(),
        context: { source: 'zahner-service' }
      });

      if (this.consoleDisplayManager.shouldDisplayLog(this.moduleName, 'enableLog')) {
        this.consoleDisplayManager.log(this.moduleName, 'enableLog', 'Zahner 设备服务关闭成功');
      }

      return {
        status: 'success',
        message: '设备服务关闭成功'
      };
    } catch (error) {
      if (this.consoleDisplayManager.shouldDisplayLog(this.moduleName, 'enableError')) {
        this.consoleDisplayManager.log(this.moduleName, 'enableError', `设备服务关闭失败: ${error.message}`);
      }

      return {
        status: 'error',
        error: error.message
      };
    }
  }

  // 执行测量（纯设备操作，无通知）
  async performMeasurement(measurementType: string, parameters: Record<string, any>, nodeId?: string, executionId?: string): Promise<any> {
    if (!this.deviceConnected) {
      throw new Error('设备未连接');
    }

    // 发送测量开始事件
    this.eventBus.emit('measurement.started', {
      measurementType,
      parameters,
      nodeId,
      executionId,
      timestamp: new Date(),
      context: { source: 'zahner-service' }
    });

    try {
      // 调用设备服务执行测量
      const result = await this.zahnerDeviceService.executeMeasurement(
        measurementType,
        parameters
      );

      // 发送测量完成事件
      this.eventBus.emit('measurement.completed', {
        measurementType,
        result,
        parameters,
        nodeId,
        executionId,
        timestamp: new Date(),
        context: { source: 'zahner-service' }
      });

      return result;
    } catch (error) {
      // 发送测量失败事件
      this.eventBus.emit('measurement.failed', {
        measurementType,
        error: error.message,
        parameters,
        nodeId,
        executionId,
        timestamp: new Date(),
        context: { source: 'zahner-service' }
      });

      throw error;
    }
  }


  // 根据测量类型获取对应的API端点
  private getMeasurementEndpoint(measurementType: MeasurementType): string {
    const endpointMap = {
      [MeasurementType.EIS_POTENTIOSTATIC]: '/measure/eis/potentiostatic',
      [MeasurementType.EIS_GALVANOSTATIC]: '/measure/eis/galvanostatic',
      [MeasurementType.OCP]: '/measure/ocp',
      [MeasurementType.CHRONOAMPEROMETRY]: '/measure/chronoamperometry',
      [MeasurementType.CHRONOPOTENTIOMETRY]: '/measure/chronopotentiometry',
      [MeasurementType.VOLTAGE_RAMP]: '/measure/voltage/ramp',
      [MeasurementType.CURRENT_RAMP]: '/measure/current/ramp',
      [MeasurementType.LSV]: '/measure/lsv'
    };

    return endpointMap[measurementType] || '/measure';
  }

  
  async calibrate(): Promise<CalibrationResult> {
    const result = await this.performMeasurement('calibration', {}, 'calibration-node', 'calibration-execution');

    return {
      success: result.status === 'success',
      timestamp: new Date(result.timestamp),
      parameters: result.data || {}
    };
  }

  // 获取设备选项
  async getDeviceOptions(): Promise<any> {
    if (!this.deviceConnected) {
      throw new Error('设备未连接');
    }

    try {
      return await this.zahnerDeviceService.getDeviceOptions();
    } catch (error) {
      this.consoleDisplayManager.log(this.moduleName, 'enableWarn', `获取设备选项失败: ${error.message}`);
      return {
        potentiostat_modes: ['POTMODE_POTENTIOSTATIC', 'POTMODE_GALVANOSTATIC', 'POTMODE_PSEUDOGALVANOSTATIC'],
        scan_directions: ['START_TO_MAX', 'START_TO_MIN'],
        scan_strategies: ['SINGLE_SINE', 'MULTI_SINE'],
        supported_measurements: Object.values(MeasurementType)
      };
    }
  }

  // 检查连接状态
  async checkConnection(): Promise<boolean> {
    if (!this.deviceConnected) {
      return false;
    }

    try {
      return await this.zahnerDeviceService.healthCheck();
    } catch (error) {
      this.consoleDisplayManager.log(this.moduleName, 'enableError', `连接检查失败: ${error.message}`);
      return false;
    }
  }

  // 获取模块状态（兼容接口）
  async getModuleStatus(): Promise<ModuleStatus> {
    const deviceStatus = await this.getDeviceStatus();

    return {
      state: deviceStatus.connected ? 'running' : 'stopped',
      health: deviceStatus.connected ? 'healthy' : 'unhealthy',
      lastCheck: new Date(),
      error: deviceStatus.connected ? undefined : '设备未连接'
    };
  }


}