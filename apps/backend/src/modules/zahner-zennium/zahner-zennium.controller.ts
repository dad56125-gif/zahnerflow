import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ZahnerZenniumService } from './zahner-zennium.service';
import { CalibrationResult } from '../../interfaces/module-interfaces';
import { DeviceStatus } from '../../interfaces/module-interfaces';
import { MeasurementType } from '@zahnerflow/types';

@Controller('api/devices/zahner-zennium')
export class ZahnerZenniumController {
  constructor(private readonly zahnerZenniumService: ZahnerZenniumService) {}

  @Get('health')
  async health(): Promise<any> {
    return this.zahnerZenniumService.health();
  }

  @Post('connect')
  @HttpCode(HttpStatus.OK)
  async connect(): Promise<{ message: string }> {
    await this.zahnerZenniumService.connect();
    return { message: 'Zahner ZENNIUM connected successfully' };
  }

  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  async disconnect(): Promise<{ message: string }> {
    await this.zahnerZenniumService.disconnect();
    return { message: 'Zahner ZENNIUM disconnected successfully' };
  }

  @Get('status')
  async getStatus(): Promise<DeviceStatus> {
    return this.zahnerZenniumService.getDeviceStatus();
  }

  @Post('measure')
  async executeMeasurement(@Body() measurement: any): Promise<any> {
    const measurementType = measurement.measurement_type || 'impedance';
    const result = await this.zahnerZenniumService.performMeasurement(measurementType, measurement, 'api-call', 'api-execution');

    // 直接返回Python层的结构化结果，保持原有的返回格式
    return {
      success: result.status === 'success',
      data: result.data,
      metadata: {
        startTime: new Date(result.timestamp),
        endTime: new Date(result.timestamp),
        duration: 0,
        device: 'ZENNIUM',
        measurement_type: measurementType
      }
    };
  }

  // EIS测量端点
  @Post('measure/eis/potentiostatic')
  async measureEisPotentiostatic(@Body() measurement: any): Promise<any> {
    const measurementWithType = { ...measurement, measurement_type: MeasurementType.EIS_POTENTIOSTATIC };
    const result = await this.zahnerZenniumService.performMeasurement(MeasurementType.EIS_POTENTIOSTATIC, measurementWithType, 'api-eis-potentiostatic', 'api-execution');

    return {
      success: result.status === 'success',
      data: result.data,
      metadata: {
        startTime: new Date(result.timestamp),
        endTime: new Date(result.timestamp),
        duration: 0,
        device: 'ZENNIUM',
        measurement_type: MeasurementType.EIS_POTENTIOSTATIC
      }
    };
  }

  @Post('measure/eis/galvanostatic')
  async measureEisGalvanostatic(@Body() measurement: any): Promise<any> {
    const measurementWithType = { ...measurement, measurement_type: MeasurementType.EIS_GALVANOSTATIC };
    const result = await this.zahnerZenniumService.performMeasurement(MeasurementType.EIS_GALVANOSTATIC, measurementWithType);

    return {
      success: result.status === 'success',
      data: result.data,
      metadata: {
        startTime: new Date(result.timestamp),
        endTime: new Date(result.timestamp),
        duration: 0,
        device: 'ZENNIUM',
        measurement_type: MeasurementType.EIS_GALVANOSTATIC
      }
    };
  }

  // 开路电位测量端点
  @Post('measure/ocp')
  async measureOCP(@Body() measurement: any): Promise<any> {
    const measurementWithType = { ...measurement, measurement_type: MeasurementType.OCP };
    const result = await this.zahnerZenniumService.performMeasurement(MeasurementType.OCP, measurementWithType);

    return {
      success: result.status === 'success',
      data: result.data,
      metadata: {
        startTime: new Date(result.timestamp),
        endTime: new Date(result.timestamp),
        duration: 0,
        device: 'ZENNIUM',
        measurement_type: MeasurementType.OCP
      }
    };
  }

  // 计时安培法测量端点
  @Post('measure/chronoamperometry')
  async measureChronoamperometry(@Body() measurement: any): Promise<any> {
    const measurementWithType = { ...measurement, measurement_type: MeasurementType.CHRONOAMPEROMETRY };
    const result = await this.zahnerZenniumService.performMeasurement(MeasurementType.CHRONOAMPEROMETRY, measurementWithType);

    return {
      success: result.status === 'success',
      data: result.data,
      metadata: {
        startTime: new Date(result.timestamp),
        endTime: new Date(result.timestamp),
        duration: 0,
        device: 'ZENNIUM',
        measurement_type: MeasurementType.CHRONOAMPEROMETRY
      }
    };
  }

  // 计时电位法测量端点
  @Post('measure/chronopotentiometry')
  async measureChronopotentiometry(@Body() measurement: any): Promise<any> {
    const measurementWithType = { ...measurement, measurement_type: MeasurementType.CHRONOPOTENTIOMETRY };
    const result = await this.zahnerZenniumService.performMeasurement(MeasurementType.CHRONOPOTENTIOMETRY, measurementWithType);

    return {
      success: result.status === 'success',
      data: result.data,
      metadata: {
        startTime: new Date(result.timestamp),
        endTime: new Date(result.timestamp),
        duration: 0,
        device: 'ZENNIUM',
        measurement_type: MeasurementType.CHRONOPOTENTIOMETRY
      }
    };
  }

  // 电压斜坡测量端点
  @Post('measure/voltage/ramp')
  async measureVoltageRamp(@Body() measurement: any): Promise<any> {
    const measurementWithType = { ...measurement, measurement_type: MeasurementType.VOLTAGE_RAMP };
    const result = await this.zahnerZenniumService.performMeasurement(MeasurementType.VOLTAGE_RAMP, measurementWithType);

    return {
      success: result.status === 'success',
      data: result.data,
      metadata: {
        startTime: new Date(result.timestamp),
        endTime: new Date(result.timestamp),
        duration: 0,
        device: 'ZENNIUM',
        measurement_type: MeasurementType.VOLTAGE_RAMP
      }
    };
  }

  // 电流斜坡测量端点
  @Post('measure/current/ramp')
  async measureCurrentRamp(@Body() measurement: any): Promise<any> {
    const measurementWithType = { ...measurement, measurement_type: MeasurementType.CURRENT_RAMP };
    const result = await this.zahnerZenniumService.performMeasurement(MeasurementType.CURRENT_RAMP, measurementWithType);

    return {
      success: result.status === 'success',
      data: result.data,
      metadata: {
        startTime: new Date(result.timestamp),
        endTime: new Date(result.timestamp),
        duration: 0,
        device: 'ZENNIUM',
        measurement_type: MeasurementType.CURRENT_RAMP
      }
    };
  }

  // 线性扫描伏安法测量端点
  @Post('measure/lsv')
  async measureLSV(@Body() measurement: any): Promise<any> {
    const measurementWithType = { ...measurement, measurement_type: MeasurementType.LSV };
    const result = await this.zahnerZenniumService.performMeasurement(MeasurementType.LSV, measurementWithType);

    return {
      success: result.status === 'success',
      data: result.data,
      metadata: {
        startTime: new Date(result.timestamp),
        endTime: new Date(result.timestamp),
        duration: 0,
        device: 'ZENNIUM',
        measurement_type: MeasurementType.LSV
      }
    };
  }

  @Post('calibrate')
  async calibrate(): Promise<CalibrationResult> {
    return this.zahnerZenniumService.calibrate();
  }

  @Get('capabilities')
  async getCapabilities(): Promise<{ capabilities: string[] }> {
    const status = await this.zahnerZenniumService.getDeviceStatus();
    return { capabilities: status.capabilities };
  }

  // 获取设备选项
  @Get('options')
  async getOptions(): Promise<any> {
    try {
      // 从FastAPI服务获取设备选项
      return await this.zahnerZenniumService.getDeviceOptions();
    } catch (error) {
      // 如果FastAPI服务不可用，返回默认选项
      return {
        potentiostat_modes: ['POTMODE_POTENTIOSTATIC', 'POTMODE_GALVANOSTATIC', 'POTMODE_PSEUDOGALVANOSTATIC'],
        scan_directions: ['START_TO_MAX', 'START_TO_MIN'],
        scan_strategies: ['SINGLE_SINE', 'MULTI_SINE'],
        supported_measurements: Object.values(MeasurementType)
      };
    }
  }
}