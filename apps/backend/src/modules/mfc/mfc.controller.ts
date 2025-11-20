import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Delete,
  HttpCode,
  Param,
  HttpStatus,
} from '@nestjs/common';
import { MfcService } from './mfc.service';
import { MfcDataService } from './mfc-data.service';
import { MfcErrorHandlerService } from './services/mfc-error-handler.service';

@Controller('/api/devices/mfc')
export class MfcController {
  constructor(
    private readonly mfcService: MfcService,
    private readonly mfcData: MfcDataService,
    private readonly errorHandler: MfcErrorHandlerService,
  ) {}

  // ==================== 核心控制接口 ====================

  /**
   * 连接MFC设备
   */
  @Post('connect')
  async connect(@Body() body: { port: string; baudrate?: number; timeout?: number; connection_id?: string }) {
    return this.errorHandler.handleDeviceConnection(
      async () => {
        return await this.mfcService.connect({
          port: body.port,
          baudrate: body.baudrate,
          timeout: body.timeout
        });
      },
      { operation: 'connect', port: body?.port }
    );
  }

  /**
   * 断开MFC设备连接
   */
  @Post('disconnect')
  async disconnect() {
    return this.errorHandler.handleDeviceConnection(
      async () => {
        return await this.mfcService.disconnect();
      },
      { operation: 'disconnect' }
    );
  }

  /**
   * 扫描设备 (普通模式，已包含实时推送)
   */
  @Post('scan')
  async scan(@Body() body?: { start?: number; end?: number }) {
    return this.errorHandler.handleDeviceScan(
      async () => {
        return this.mfcService.scan(body?.start, body?.end);
      },
      { operation: 'scan', start: body?.start, end: body?.end }
    );
  }

  /**
   * 获取/更新设备状态
   */
  @Get('status')
  async status(@Query('address') address?: string) {
    return this.errorHandler.handleDeviceOperation(
      async () => {
        if (this.mfcService.is_device_busy()) {
          return { busy: true, message: 'device is busy' };
        }
        return this.mfcService.status(address ? parseInt(address) : undefined);
      },
      { operation: 'status', address: address ? parseInt(address) : undefined }
    );
  }

  /**
   * 设置流量
   */
  @Post('setpoint')
  async setpoint(@Body() body: { address: number; sccm: number }) {
    return this.errorHandler.handleFlowControl(
      async () => {
        return this.mfcService.setpoint(body.address, body.sccm);
      },
      { operation: 'setpoint', address: body.address, sccm: body.sccm }
    );
  }

  // ==================== 辅助信息接口 ====================

  @Get('health')
  async health() {
    return this.errorHandler.handleDeviceOperation(
      async () => { return this.mfcService.health(); },
      { operation: 'health' }
    );
  }

  @Get('ports')
  async ports() {
    return this.errorHandler.handleDeviceOperation(
      async () => { return this.mfcService.get_available_ports(); },
      { operation: 'ports' }
    );
  }

  @Get('connection/info')
  async getConnectionInfo() {
    return this.mfcService.get_connection_info();
  }

  @Get('connection/status')
  async getConnectionStatus() {
    return this.mfcService.getConnectionStatus();
  }

  @Get('devices')
  async getDevices() {
    return this.mfcService.getDevices();
  }

  @Get('gas-name')
  async getGasName(@Query('address') address: number) {
    return this.errorHandler.handleDeviceOperation(
      async () => { return this.mfcService.read_gas_name(address); },
      { operation: 'read_gas_name', device_address: address }
    );
  }

  @Get('active-setpoint')
  async getActiveSetpoint(@Query('address') address: number) {
    return this.errorHandler.handleDeviceOperation(
      async () => { return this.mfcService.read_active_setpoint(address); },
      { operation: 'read_active_setpoint', device_address: address }
    );
  }

  // ==================== 日志与数据接口 ====================

  @Get('comm-log')
  async getCommLog() {
    return this.errorHandler.handleDeviceOperation(
      async () => { return this.mfcService.get_communication_log(); },
      { operation: 'comm-log' }
    );
  }

  @Delete('comm-log')
  @HttpCode(HttpStatus.OK)
  async clearCommLog() {
    return this.errorHandler.handleDeviceOperation(
      async () => { return this.mfcService.clear_communication_log(); },
      { operation: 'clear-comm-log' }
    );
  }

  @Get('logs/flow')
  async getFlowLogs(
    @Query('address') address?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('downsample') downsample?: string,
  ) {
    return this.mfcData.queryFlowHistory({
      device_address: address ? parseInt(address) : undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      downsample: downsample ? parseInt(downsample) : undefined,
    });
  }

  // ==================== 错误处理接口 (保留) ====================

  @Get('error/stats')
  async getErrorStats() { return this.errorHandler.getErrorStats(); }

  @Post('error/circuit-breaker/:name/reset')
  async resetCircuitBreaker(@Param('name') name: string) {
    return this.errorHandler.resetCircuitBreaker(name);
  }

  @Post('error/circuit-breakers/reset')
  async resetAllCircuitBreakers() { return this.errorHandler.resetAllCircuitBreakers(); }

  @Get('error/recent')
  async getRecentErrors() { return this.errorHandler.getRecentErrors(); }

  @Get('error/export')
  async exportErrors() { return this.errorHandler.exportErrorData(); }

  @Post('error/clear')
  async clearErrors() {
    this.errorHandler.clearErrorLogs();
    return { success: true };
  }
}