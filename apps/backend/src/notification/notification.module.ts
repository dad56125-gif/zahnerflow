import { Module, forwardRef } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { SimpleEventBus } from './simple-event-bus.service';
import { NotificationEventHandler } from './event-handlers/notification.handler';
import { StateEventHandler } from './event-handlers/state.handler';
import { MetricsEventHandler } from './event-handlers/metrics.handler';
import { HookDbBridgeHandler } from './event-handlers/hook-db-bridge.handler';
import { GatewaysModule } from '../modules/shared/gateways.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [GatewaysModule, CommonModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    SimpleEventBus,               // 事件总线
    NotificationEventHandler,      // 通知事件处理器
    StateEventHandler,            // 状态事件处理器
    MetricsEventHandler,           // 指标事件处理器
    HookDbBridgeHandler,           // Hook 事件桥接到 DbService.emit
  ],
  exports: [
    NotificationService,
    SimpleEventBus,               // 导出事件总线，供其他模块使用
  ],
})
export class NotificationModule {}
