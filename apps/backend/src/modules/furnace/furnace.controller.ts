import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { FurnaceService } from './furnace.service';
import { SamplingService } from '../sampling/sampling.service';

@Controller('/api/devices/furnace')
export class FurnaceController {
  constructor(private readonly svc: FurnaceService, private readonly sampling: SamplingService) {}

  // Passthrough device controls
  @Post('connect') connect(@Body() body: any) { return this.svc.passthrough('connect', body); }
  @Post('disconnect') disconnect() { return this.svc.passthrough('disconnect'); }
  @Post('run') run() { return this.svc.passthrough('run'); }
  @Post('pause') pause() { return this.svc.passthrough('pause'); }
  @Post('stop') stop() { return this.svc.passthrough('stop'); }

  @Get('status') status() { return this.svc.status(); }
  @Get('health') health() { return this.svc['device'].health(); }
  @Get('ports') ports() { return this.svc.ports(); }
  @Get('comm-log') getCommLog() { return this.svc.getCommLog(); }
  @Post('sv') sv(@Body() body: { sv: number }) { return this.svc.setSv(body.sv); }
  @Post('segment/set') segmentSet(@Body() body: { segment: number }) { return this.svc.setSegment(body.segment); }

  @Get('program/segments') getSegments() { return this.svc.getProgramSegments(); }
  @Post('program/segments') setSegments(@Body() segments: Array<{ id: number; temperature: number; time: number }>) { return this.svc.setProgramSegments(segments as any); }

  // Presets CRUD
  @Get('presets') list() { return this.svc.listPresets(); }
  @Post('presets') create(@Body() body: { name: string; segments: any[]; summary?: string }) { return this.svc.createPreset(body.name, body.segments as any, body.summary); }
  @Get('presets/:name') one(@Param('name') name: string) { return this.svc.getPreset(name); }
  @Put('presets/:name') update(@Param('name') name: string, @Body() body: { segments: any[] }) { return this.svc.updatePreset(name, body.segments as any); }
  @Delete('presets/:name') @HttpCode(204) remove(@Param('name') name: string) { return this.svc.deletePreset(name); }
  @Post('presets/:name/clone') clone(@Param('name') name: string, @Body() body: { newName: string }) { return this.svc.clonePreset(name, body.newName); }
  @Post('presets/:name/apply') apply(@Param('name') name: string) { return this.svc.applyPreset(name); }

  // History
  @Get('logs/temperature')
  logsTemperature(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('downsample') downsample?: string,
  ) {
    return this.sampling.queryFurnace(from, to, limit ? Number(limit) : undefined, downsample ? Number(downsample) : undefined);
  }
}
