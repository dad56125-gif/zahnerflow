import { Module } from '@nestjs/common';
import { FurnaceController } from './furnace.controller';
import { FurnaceService } from './furnace.service';
import { FurnaceControlService } from './furnace-control.service';
import { FurnaceDataService } from './furnace-data.service';
import { FurnacePollingManagerService } from './furnace-polling-manager.service';
import { FurnaceErrorHandlerService } from './services/furnace-error-handler.service';
import { SamplingModule } from '../sampling/sampling.module';
import { GatewaysModule } from '../shared/gateways.module';
import { FurnaceGateway } from '../../gateways/furnace.gateway';

@Module({
  imports: [
    SamplingModule,
    GatewaysModule,
  ],
  controllers: [FurnaceController],
  providers: [
    FurnaceService,
    FurnaceControlService,
    FurnaceDataService,
    FurnacePollingManagerService,
    FurnaceErrorHandlerService,
    FurnaceGateway,
  ],
  exports: [
    FurnaceService,
    FurnaceControlService,
    FurnaceDataService,
    FurnacePollingManagerService,
    FurnaceErrorHandlerService,
    FurnaceGateway,
  ],
})
export class FurnaceModule {}

