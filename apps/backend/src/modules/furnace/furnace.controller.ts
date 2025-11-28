import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { FurnaceService } from './furnace.service';
import { FurnaceDataService } from './furnace-data.service';

@Controller('/api/devices/furnace')
export class FurnaceController {
  constructor(
    private readonly svc: FurnaceService,
    private readonly data: FurnaceDataService,
  ) {}

  @Post('connect') async connect(@Body() b: any) { return this.svc.connect(b); }
  @Post('disconnect') async disconnect() { return this.svc.disconnect(); }
  @Post('run') run() { return this.svc.run(); }
  @Post('pause') pause() { return this.svc.pause(); }
  @Post('stop') stop() { return this.svc.stop(); }
  @Get('status') status() { return { message: "Use WebSocket" }; }
  @Get('health') health() { return this.svc.health(); }
  @Get('ports') ports() { return this.svc.ports(); }

  @Post('segment/set') segmentSet(@Body() b: { segment: number }) { return this.svc.setSegment(b.segment); }

  // 批量读取程序段
  @Get('program/segments')
  getProgramSegments() {
    return this.svc.get_program_segments();
  }

  // 批量写入程序段
  @Post('program/segments')
  setProgramSegments(@Body() body: { segments: any[] }) {
    return this.svc.set_program_segments(body.segments);
  }

  // Presets & History
  @Get('presets') list() { return this.data.listPresets(); }
  @Post('presets') create(@Body() b: any) { return this.data.createPreset(b.name, b.segments, b.summary); }
  @Get('presets/:name') one(@Param('name') n: string) { return this.data.getPreset(n); }
  @Put('presets/:name') update(@Param('name') n: string, @Body() b: any) { return this.data.updatePreset(n, b.segments); }
  @Delete('presets/:name') @HttpCode(204) remove(@Param('name') n: string) { return this.data.deletePreset(n); }
  @Post('presets/:name/clone') clone(@Param('name') n: string, @Body() b: any) { return this.data.clonePreset(n, b.newName); }
  @Post('presets/:name/apply') apply(@Param('name') n: string) { return this.svc.apply_preset(n); }
  
  @Get('logs/temperature') logs(@Query() q: any) { return this.data.queryFurnace(q.from, q.to, q.limit, q.downsample); }
  @Get('error/stats') stats() { return {}; }
}