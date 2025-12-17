import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { MfcModule } from './modules/mfc/mfc.module';
import { FurnaceModule } from './modules/furnace/furnace.module';
import { UsersModule } from './modules/users/users.module';
import { join } from 'path';

/**
 * 应用主模块
 * 集成所有功能模块
 */
@Module({
  imports: [
    // 配置模块 - 加载项目根目录的 .env 文件
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(__dirname, '..', '..', '..', '.env'),  // 项目根目录
        join(__dirname, '..', '.env'),               // backend 目录
      ],
    }),
    CommonModule,
    DbModule,
    GatewayModule,
    ExecutionModule,
    ZahnerZenniumModule,
    WorkflowModule,
    NotificationModule,
    FilesModule,
    ConsoleModule,
    MfcModule,
    FurnaceModule,
    UsersModule,
  ],
  controllers: [AppController],
})
export class AppModule { }

