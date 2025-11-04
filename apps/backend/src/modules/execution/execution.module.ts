import { Module, forwardRef } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import { ExecutionController } from './execution.controller';
import { HooksController } from './hooks.controller';
import { ExecutionNotificationService } from './execution-notification.service';
import { ZahnerDeviceService } from '../../devices/zahner-device.service';
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
    ZahnerZenniumModule,
    FurnaceModule,
    MfcModule,
    FilesModule,
    forwardRef(() => NotificationModule),
    CommonModule,
    HttpModule,
    DbModule,
  ],
  controllers: [ExecutionController, HooksController],
  providers: [
    ExecutionService,
    ExecutionNotificationService,
    ZahnerDeviceService,
  ],
  exports: [
    ExecutionService,
    ExecutionNotificationService,
    ZahnerDeviceService,
  ],
})
export class ExecutionModule {}
