import { Module } from '@nestjs/common';
import { ExecutionModule } from './modules/execution/execution.module';
import { ZahnerZenniumModule } from './modules/zahner-zennium/zahner-zennium.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { NotificationModule } from './notification/notification.module';
import { FilesModule } from './modules/files/files.module';
import { GatewayModule } from './gateways/gateway.module';
import { CommonModule } from './common/common.module';
import { DbModule } from './db/db.module';
import { ConsoleModule } from './modules/console/console.module';
import { AppController } from './app.controller';
import { FurnaceModule } from './modules/furnace/furnace.module';
import { MfcModule } from './modules/mfc/mfc.module';
import { SamplingModule } from './modules/sampling/sampling.module';

/**
 * 应用主模块
 * 集成所有功能模块
 */
@Module({
  imports: [
    CommonModule,
    DbModule,
    GatewayModule,
    ExecutionModule,
    ZahnerZenniumModule,
    WorkflowModule,
    NotificationModule,
    FilesModule,
    ConsoleModule,
    FurnaceModule,
    MfcModule,
    SamplingModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
