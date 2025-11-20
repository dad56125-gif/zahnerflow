import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ZahnerZenniumService } from './zahner-zennium.service';
import { ZahnerZenniumController } from './zahner-zennium.controller';
import { NotificationModule } from '../../notification/notification.module';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [HttpModule, NotificationModule, CommonModule],
  controllers: [ZahnerZenniumController],
  providers: [ZahnerZenniumService], // ❌ 删除了 ZahnerDeviceService
  exports: [ZahnerZenniumService],    // ❌ 删除了 ZahnerDeviceService
})
export class ZahnerZenniumModule {}