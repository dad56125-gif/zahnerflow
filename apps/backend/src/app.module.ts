import { Module } from '@nestjs/common';
import { ExecutionModule } from './modules/execution/execution.module';
import { ZahnerZenniumModule } from './modules/zahner-zennium/zahner-zennium.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { NotificationModule } from './notification/notification.module';
import { GatewayModule } from './gateways/gateway.module';
import { CommonModule } from './common/common.module';
import { ConsoleModule } from './modules/console/console.module';
import { AppController } from './app.controller';

/**
 * 应用主模块
 * 集成所有功能模块
 */
@Module({
  imports: [
    CommonModule,
    GatewayModule,
    ExecutionModule,
    ZahnerZenniumModule,
    WorkflowModule,
    NotificationModule,
    ConsoleModule,
  ],
  controllers: [AppController],
})
export class AppModule {}