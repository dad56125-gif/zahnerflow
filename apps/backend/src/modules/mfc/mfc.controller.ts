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
  Inject,
  forwardRef
} from '@nestjs/common';
import { MfcService } from './mfc.service';
import { MfcDataService } from './mfc-data.service';
import { MfcErrorHandlerService } from './services/mfc-error-handler.service';

// 导入连接状态枚举 - 从MfcService导出
import { ConnectionState, PollingStatus } from './mfc.service';

@Controller('/api/devices/mfc')
export class MfcController {
  constructor(
    private readonly mfcService: MfcService,
    private readonly mfcData: MfcDataService,
    private readonly errorHandler: MfcErrorHandlerService,
  ) {}

  // ==================== 设备控制接口 ====================

  /**
   * 连接MFC设备
   */
  @Post('connect')
  async connect(@Body() body: any) {
    const result = await this.mfcService.passthrough('connect', body);
    // 数据管理由MfcDataService自动处理
    return result;
  }

  /**
   * 断开MFC设备连接
   */
  @Post('disconnect')
  async disconnect() {
    try {
      return await this.mfcService.passthrough('disconnect');
    } finally {
      // 数据管理由MfcDataService自动处理
    }
  }

  /**
   * 扫描MFC设备地址
   */
  @Post('scan')
  async scan(@Body() body?: any) {
    return this.mfcService.passthrough('scan', body);
  }

  /**
   * 获取MFC设备状态
   */
  @Get('status')
  async status(@Query('address') address?: string) {
    // 数据管理由MfcDataService自动处理
    // API 层增加忙碌检查：当设备正在执行长耗时操作时，直接给出忙碌响应，避免产生冲突
    if (this.mfcService.is_device_busy()) {
      return {
        busy: true,
        message: 'device is busy with operation'
      };
    }
    return this.mfcService.passthrough('status', { address });
  }

  /**
   * 设置MFC流量设定点
   */
  @Post('setpoint')
  async setpoint(@Body() body: { address: number; sccm: number }) {
    return this.mfcService.passthrough('setpoint', body);
  }

  /**
   * 健康检查
   */
  @Get('health')
  async health() {
    return this.mfcService.passthrough('health');
  }

  /**
   * 获取可用串口列表
   */
  @Get('ports')
  async ports() {
    return this.mfcService.passthrough('ports');
  }

  // ==================== 数据查询接口 ====================

  /**
   * 查询历史流量数据
   */
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

  /**
   * 获取通信日志
   */
  @Get('comm-log')
  async getCommLog() {
    return this.mfcService.passthrough('comm-log');
  }

  /**
   * 获取连接信息
   */
  @Get('connection/info')
  async getConnectionInfo() {
    return this.mfcService.getConnectionStatus();
  }

  /**
   * 获取连接状态
   */
  @Get('connection/status')
  async getConnectionStatus() {
    return this.mfcService.getConnectionStatus();
  }

  /**
   * 清空通信日志
   */
  @Delete('comm-log')
  @HttpCode(HttpStatus.OK)
  async clearCommLog() {
    return this.mfcService.passthrough('clear-comm-log');
  }

  // ==================== 错误处理接口 ====================

  /**
   * 获取错误统计信息
   */
  @Get('error/stats')
  async getErrorStats() {
    return this.errorHandler.getErrorStats();
  }

  /**
   * 重置指定熔断器
   */
  @Post('error/circuit-breaker/:name/reset')
  async resetCircuitBreaker(@Param('name') name: string) {
    return this.errorHandler.resetCircuitBreaker(name);
  }

  /**
   * 重置所有熔断器
   */
  @Post('error/circuit-breakers/reset')
  async resetAllCircuitBreakers() {
    return this.errorHandler.resetAllCircuitBreakers();
  }

  /**
   * 获取最近的错误记录
   */
  @Get('error/recent')
  async getRecentErrors() {
    return this.errorHandler.getRecentErrors();
  }

  /**
   * 导出错误数据
   */
  @Get('error/export')
  async exportErrors() {
    return this.errorHandler.exportErrors();
  }

  /**
   * 清理错误日志
   */
  @Post('error/clear')
  async clearErrors() {
    return this.errorHandler.clearErrors();
  }
}
