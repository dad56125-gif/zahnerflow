import { Module } from '@nestjs/common';
import { FurnaceController } from './furnace.controller';
import { FurnaceService } from './furnace.service';
import { FurnaceDataService } from './furnace-data.service';
import { FurnaceErrorHandlerService } from './services/furnace-error-handler.service';
import { FurnaceDeviceService } from '../../devices/furnace-device.service';
import { GatewaysModule } from '../shared/gateways.module';

@Module({
  imports: [GatewaysModule],
  controllers: [FurnaceController],
  providers: [
    FurnaceService,
    FurnaceDataService,
    FurnaceErrorHandlerService,
    FurnaceDeviceService,
    // NO FurnaceGateway here!
  ],
  exports: [FurnaceService, FurnaceDataService, FurnaceErrorHandlerService, FurnaceDeviceService],
})
export class FurnaceModule {}