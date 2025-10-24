import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { MfcService } from './mfc.service';

@Controller('/api/devices/mfc')
export class MfcController {
  constructor(private readonly svc: MfcService) {}

  @Post('scan') scan(@Body() body: { start?: number; end?: number }) { return this.svc.scan(body?.start, body?.end); }
  @Get('devices') devices() { return this.svc.getDevices(); }
  @Post('connect')
  async connect(@Body() body: { port?: string; baudrate?: number; timeout?: number }) {
    const connect_payload: { port: string; baudrate?: number; timeout?: number } = {
      port: body?.port ?? 'COM1',
      baudrate: body?.baudrate,
      timeout: body?.timeout,
    };
    const result = await this.svc.connect(connect_payload);
    // 数据管理移除，MFC现在自管理
    return result;
  }
  @Post('disconnect')
  async disconnect() {
    try {
      return await this.svc.disconnect();
    } finally {
      // 数据管理移除，MFC现在自管理
    }
  }
  @Get('status') status(@Query('address') address?: string) {
    // 数据管理移除，MFC现在自管理
    return this.svc.status(address != null ? Number(address) : undefined);
  }
  @Get('health') health() { return (this as any).svc['device'].health(); }
  @Post('setpoint') setpoint(@Body() body: { address: number; sccm: number }) { return this.svc.setpoint(body.address, body.sccm); }

  @Get('logs/flow')
  logsFlow(
    @Query('address') address?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('downsample') downsample?: string,
  ) {
    // 数据查询移除，MFC现在自管理
    return {
      data: [],
      message: 'MFC data logging has been removed'
    };
  }
}
