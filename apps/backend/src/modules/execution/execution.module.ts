import { Module, forwardRef } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import { ExecutionController } from './execution.controller';
import { WorkflowModule } from '../workflow/workflow.module';
import { ZahnerZenniumModule } from '../zahner-zennium/zahner-zennium.module';
import { FurnaceModule } from '../furnace/furnace.module';
import { MfcModule } from '../mfc/mfc.module';
import { NotificationModule } from '../../notification/notification.module';
import { CommonModule } from '../../common/common.module';
import { HttpModule } from '@nestjs/axios';
import { DbModule } from '../../db/db.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [
    WorkflowModule,
    ZahnerZenniumModule, // ✅ 这里已经导出了 ZahnerZenniumService，这就够了
    FurnaceModule,
    MfcModule,
    FilesModule,
    forwardRef(() => NotificationModule),
    CommonModule,
    HttpModule,
    DbModule,
  ],
  controllers: [ExecutionController],
  providers: [
    ExecutionService,
    // ❌ 删除: ZahnerDeviceService
  ],
  exports: [
    ExecutionService,
    // ❌ 删除: ZahnerDeviceService
  ],
})
export class ExecutionModule {}