import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ZahnerZenniumService } from './zahner-zennium.service';
import { DeviceStatus } from '../../interfaces/module-interfaces';
import { MeasurementType } from '@zahnerflow/types';

@Controller('api/devices/zahner-zennium')
export class ZahnerZenniumController {
  constructor(private readonly service: ZahnerZenniumService) {}

  @Get('health')
  async health() { return this.service.health(); }

  @Post('connect')
  @HttpCode(HttpStatus.OK)
  async connect() {
    await this.service.connect();
    return { message: 'Zahner ZENNIUM connected successfully' };
  }

  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  async disconnect() {
    await this.service.disconnect();
    return { message: 'Zahner ZENNIUM disconnected successfully' };
  }

  @Get('status')
  async getStatus(): Promise<DeviceStatus> {
    return this.service.getDeviceStatus();
  }

  // 通用测量入口
  @Post('measure')
  async executeMeasurement(@Body() measurement: any) {
    const type = measurement.measurement_type || MeasurementType.EIS_POTENTIOSTATIC;
    return this.runMeasurement(type, measurement);
  }

  // 快捷入口：EIS Potentiostatic
  @Post('measure/eis/potentiostatic')
  async measureEisPotentiostatic(@Body() b: any) { return this.runMeasurement(MeasurementType.EIS_POTENTIOSTATIC, b); }

  // 快捷入口：EIS Galvanostatic
  @Post('measure/eis/galvanostatic')
  async measureEisGalvanostatic(@Body() b: any) { return this.runMeasurement(MeasurementType.EIS_GALVANOSTATIC, b); }

  // 快捷入口：OCP
  @Post('measure/ocp')
  async measureOCP(@Body() b: any) { return this.runMeasurement(MeasurementType.OCP, b); }

  // 快捷入口：Chronoamperometry
  @Post('measure/chronoamperometry')
  async measureCA(@Body() b: any) { return this.runMeasurement(MeasurementType.CHRONOAMPEROMETRY, b); }

  // 快捷入口：Chronopotentiometry
  @Post('measure/chronopotentiometry')
  async measureCP(@Body() b: any) { return this.runMeasurement(MeasurementType.CHRONOPOTENTIOMETRY, b); }

  // 快捷入口：Voltage Ramp
  @Post('measure/voltage/ramp')
  async measureVR(@Body() b: any) { return this.runMeasurement(MeasurementType.VOLTAGE_RAMP, b); }

  // 快捷入口：Current Ramp
  @Post('measure/current/ramp')
  async measureCR(@Body() b: any) { return this.runMeasurement(MeasurementType.CURRENT_RAMP, b); }

  // 快捷入口：LSV
  @Post('measure/lsv')
  async measureLSV(@Body() b: any) { return this.runMeasurement(MeasurementType.LSV, b); }

  @Post('calibrate')
  async calibrate() { return this.service.calibrate(); }

  @Get('capabilities')
  async getCapabilities() {
    const status = await this.service.getDeviceStatus();
    return { capabilities: status.capabilities };
  }

  @Get('options')
  async getOptions() { return this.service.getDeviceOptions(); }

  // 私有辅助方法：统一处理返回格式
  private async runMeasurement(type: MeasurementType, body: any) {
    const payload = { ...body, measurement_type: type };
    // 注意：nodeId 和 executionId 在手动模式下是虚拟的
    const result = await this.service.performMeasurement(type, payload, 'manual-api-node', 'manual-api-exec');
    
    return {
      success: result.status === 'success',
      data: result.data,
      metadata: {
        startTime: new Date(result.timestamp || Date.now()),
        endTime: new Date(result.timestamp || Date.now()),
        duration: 0,
        device: 'ZENNIUM',
        measurement_type: type
      }
    };
  }
}