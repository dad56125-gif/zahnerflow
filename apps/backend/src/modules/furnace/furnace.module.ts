import { Module } from '@nestjs/common';
import { FurnaceController } from './furnace.controller';
import { FurnaceService } from './furnace.service';
import { FurnaceDataService } from './furnace-data.service';
import { FurnaceErrorHandlerService } from './services/furnace-error-handler.service';
import { FurnaceDeviceService } from './furnaceDevice.service';
import { FurnaceGateway } from './furnaceGateway';
import { GatewaysModule } from '../shared/gateways.module';

@Module({
  imports: [GatewaysModule],
  controllers: [FurnaceController],
  providers: [
    FurnaceService,
    FurnaceDataService,
    FurnaceErrorHandlerService,
    FurnaceDeviceService,
    FurnaceGateway,
  ],
  exports: [
    FurnaceService,
    FurnaceDataService,
    FurnaceErrorHandlerService,
    FurnaceDeviceService,
    FurnaceGateway,
  ],
})
export class FurnaceModule {}