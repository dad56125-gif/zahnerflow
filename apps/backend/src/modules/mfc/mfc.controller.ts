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

// 导入连接状态枚举 - 从MfcService导出
import { ConnectionState } from './mfc.service';

@Controller('/api/devices/mfc')
export class MfcController {
  constructor(
    private readonly mfcService: MfcService,
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
}
