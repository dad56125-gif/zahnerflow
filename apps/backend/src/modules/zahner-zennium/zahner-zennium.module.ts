import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ZahnerZenniumService } from './zahner-zennium.service';
import { ZahnerZenniumController } from './zahner-zennium.controller';
import { ZahnerDeviceService } from '../../devices/zahner-device.service';
import { NotificationModule } from '../../notification/notification.module';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [HttpModule, forwardRef(() => NotificationModule), CommonModule],
  controllers: [ZahnerZenniumController],
  providers: [ZahnerZenniumService, ZahnerDeviceService],
  exports: [ZahnerZenniumService, ZahnerDeviceService],
})
export class ZahnerZenniumModule {}