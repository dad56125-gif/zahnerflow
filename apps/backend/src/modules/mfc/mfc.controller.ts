import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { MfcService } from './mfc.service';
import { SamplingService } from '../sampling/sampling.service';

@Controller('/api/devices/mfc')
export class MfcController {
  constructor(private readonly svc: MfcService, private readonly sampling: SamplingService) {}

  @Post('scan') scan(@Body() body: { start?: number; end?: number }) { return this.svc.scan(body?.start, body?.end); }
  @Get('devices') devices() { return this.svc.getDevices(); }
  @Get('status') status(@Query('address') address?: string) { return this.svc.status(address != null ? Number(address) : undefined); }
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
    return this.sampling.queryMfc(address != null ? Number(address) : undefined, from, to, limit ? Number(limit) : undefined, downsample ? Number(downsample) : undefined);
  }
}
