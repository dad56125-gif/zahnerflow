import { Module } from '@nestjs/common';
import { FurnaceController } from './furnace.controller';
import { FurnaceService } from './furnace.service';
import { FurnaceDeviceService } from '../../devices/furnace-device.service';

@Module({
  imports: [],
  controllers: [FurnaceController],
  providers: [FurnaceService, FurnaceDeviceService],
})
export class FurnaceModule {}

