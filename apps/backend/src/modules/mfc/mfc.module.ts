import { Module } from '@nestjs/common';
import { MfcController } from './mfc.controller';
import { MfcService } from './mfc.service';
import { MfcDataService } from './mfc-data.service';
import { MfcErrorHandlerService } from './services/mfc-error-handler.service';
import { MfcGateway } from '../../gateways/mfc.gateway';
import { MfcDeviceService } from '../../devices/mfc-device.service';

/**
 * MFC模块
 *
 * 提供质量流量控制器(MFC)的完整功能支持：
 * - 设备连接和控制
 * - 实时数据采集和推送
 * - 历史数据管理
 * - 错误处理和监控
 * - WebSocket实时通信
 */
@Module({
  imports: [],
  controllers: [MfcController],
  providers: [
    MfcService,
    MfcDataService,
    MfcErrorHandlerService,
    MfcGateway,
    MfcDeviceService,
  ],
  exports: [
    MfcService,
    MfcDataService,
    MfcErrorHandlerService,
    MfcGateway,
  ],
})
export class MfcModule {}

