import { Module, Global } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { EventBus } from './event-bus.service';
import { CommonModule } from '../common/common.module';
import { GatewayModule } from '../gateways/gateway.module';

// 扁平化引用：所有 Handler 都在同级目录下
import { NotificationEventHandler } from './notification.handler';
import { StateEventHandler } from './state.handler';
import { MetricsEventHandler } from './metrics.handler';

@Global() // 全局模块，方便其他地方注入 EventBus
@Module({
  imports: [
    GatewayModule, // 用于推送 WebSocket
    CommonModule,  // 用于打印日志
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,      // 内部发信服务
    EventBus,                 // 核心事件总线 (原 SimpleEventBus)
    NotificationEventHandler, // 负责推送通知给前端 (原名保持不变)
    StateEventHandler,        // 负责维护实时状态
    MetricsEventHandler,      // 负责统计数据
  ],
  exports: [
    NotificationService,
    EventBus,                 // 导出总线供其他模块使用
  ],
})
export class NotificationModule {}