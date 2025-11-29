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

  // ========== 新架构查询接口 ==========

  /**
   * 查询采样数据（支持新架构的status_code字段）
   * 用于RecordingTab实时表格
   */
  @Get('samples')
  querySamples(@Query() q: any) {
    return this.data.queryFurnace(q.from, q.to, q.limit, q.downsample);
  }

  /**
   * 查询事件数据（用于状态补全）
   */
  @Get('events')
  queryEvents(@Query() q: any) {
    // 从furnace_events表查询事件
    const sql = `SELECT timestamp, status_code, segment, segment_time_set FROM furnace_events
                 WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp ASC`;

    const fromTs = q.from ? Math.floor(new Date(q.from).getTime() / 1000) : 0;
    const toTs = q.to ? Math.floor(new Date(q.to).getTime() / 1000) : Math.floor(Date.now() / 1000);

    const rows = this.data['db'].prepare(sql).all(fromTs, toTs);

    // 转换回ISO字符串
    return rows.map((row: any) => ({
      timestamp: new Date(row.timestamp * 1000).toISOString(),
      status_code: row.status_code,
      segment: row.segment,
      segment_time_set: row.segment_time_set
    }));
  }

  @Get('error/stats') stats() { return {}; }
}