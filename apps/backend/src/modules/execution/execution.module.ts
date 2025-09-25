import { Module, forwardRef } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import { ExecutionController } from './execution.controller';
import { ExecutionNotificationService } from './execution-notification.service';
import { ZahnerDeviceService } from '../../devices/zahner-device.service';
import { WorkflowModule } from '../workflow/workflow.module';
import { ZahnerZenniumModule } from '../zahner-zennium/zahner-zennium.module';
import { NotificationModule } from '../../notification/notification.module';
import { CommonModule } from '../../common/common.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    WorkflowModule,
    ZahnerZenniumModule,
    forwardRef(() => NotificationModule),
    CommonModule,
    HttpModule,
  ],
  controllers: [ExecutionController],
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