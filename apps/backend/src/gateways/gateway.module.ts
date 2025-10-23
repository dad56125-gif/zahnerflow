import { Module } from '@nestjs/common';
import { GatewaysModule } from '../modules/shared/gateways.module';
import { FurnaceModule } from '../modules/furnace/furnace.module';

@Module({
  imports: [
    GatewaysModule,
    FurnaceModule,
  ],
})
export class GatewayModule {}