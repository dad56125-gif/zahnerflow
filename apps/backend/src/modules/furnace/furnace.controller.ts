import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { FurnaceService } from './furnace.service';
import { FurnacePollingManagerService } from './furnace-polling-manager.service';
import { SamplingService } from '../sampling/sampling.service';
import { FurnaceErrorHandlerService } from './services/furnace-error-handler.service';

// 导入连接状态枚举 - 从FurnaceService导出
import { ConnectionState } from './furnace.service';

@Controller('/api/devices/furnace')
export class FurnaceController {
  constructor(
    private readonly svc: FurnaceService,
    private readonly pollingManager: FurnacePollingManagerService,
    private readonly sampling: SamplingService,
    private readonly errorHandler: FurnaceErrorHandlerService,
  ) {}

  // Passthrough device controls
  @Post('connect')
  async connect(@Body() body: any) {
    const result = await this.svc.passthrough('connect', body);
    this.sampling.mark_device_activity('furnace');
    return result;
  }
  @Post('disconnect')
  async disconnect() {
    try {
      return await this.svc.passthrough('disconnect');
    } finally {
      this.sampling.mark_device_inactive('furnace');
    }
  }
  @Post('run') run() { return this.svc.passthrough('run'); }
  @Post('pause') pause() { return this.svc.passthrough('pause'); }
  @Post('stop') stop() { return this.svc.passthrough('stop'); }

  @Get('status')
  status() {
    this.sampling.mark_device_activity('furnace');
    // API 层增加忙碌检查：当设备正在执行长耗时操作时，直接给出忙碌响应，避免产生冲突
    if (this.svc.is_device_busy()) {
      return {
        busy: true,
        message: 'device is busy with program segments operation'
      };
    }
    return this.svc.status();
  }
  @Get('health') health() { return this.svc.health(); }
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

  // 连接状态
  @Get('connection/status')
  connectionStatus() {
    return {
      state: this.svc.getConnectionState(),
      connected: this.svc.isDeviceConnected()
    };
  }

  // 尝试重连
  @Post('connection/reconnect')
  async reconnect() {
    const success = await this.svc.attemptReconnection();
    return {
      success,
      state: this.svc.getConnectionState()
    };
  }

  // 轮询管理器状态
  @Get('polling/status')
  pollingStatus() {
    return this.pollingManager.getStatus();
  }

  // 错误处理统计信息
  @Get('error/stats')
  errorStats() {
    return this.errorHandler.getErrorStats();
  }

  // 重置指定熔断器
  @Post('error/circuit-breaker/:name/reset')
  resetCircuitBreaker(@Param('name') name: string) {
    const success = this.errorHandler.resetCircuitBreaker(name);
    return {
      success,
      name,
      message: success ? `Circuit breaker ${name} reset successfully` : `Circuit breaker ${name} not found`
    };
  }

  // 重置所有熔断器
  @Post('error/circuit-breakers/reset')
  resetAllCircuitBreakers() {
    this.errorHandler.resetAllCircuitBreakers();
    return {
      success: true,
      message: 'All circuit breakers reset successfully'
    };
  }

  // 获取最近的错误
  @Get('error/recent')
  getRecentErrors(@Query('minutes') minutes: string = '5') {
    const timeWindowMs = parseInt(minutes) * 60 * 1000;
    return {
      errors: this.errorHandler.getRecentErrors(timeWindowMs),
      timeWindow: `${minutes} minutes`,
      total: this.errorHandler.getRecentErrors(timeWindowMs).length
    };
  }

  // 导出错误数据
  @Get('error/export')
  exportErrors() {
    const errors = this.errorHandler.exportErrorData();
    return {
      errors,
      total: errors.length,
      exportTime: new Date().toISOString()
    };
  }

  // 清理错误日志
  @Post('error/clear')
  clearErrorLogs() {
    this.errorHandler.clearErrorLogs();
    return {
      success: true,
      message: 'Error logs cleared successfully'
    };
  }
}
