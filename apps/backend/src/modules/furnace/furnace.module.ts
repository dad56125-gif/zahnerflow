import { Module } from '@nestjs/common';
import { FurnaceController } from './furnace.controller';
import { FurnaceService } from './furnace.service';
import { FurnaceDataService } from './furnace-data.service';
import { FurnaceErrorHandlerService } from './services/furnace-error-handler.service';
import { FurnaceDeviceService } from './furnaceDevice.service';
import { FurnaceGateway } from './furnaceGateway';
import { CommonModule } from '../../common/common.module';
import { DbModule } from '../../db/db.module'; // 导入这个

@Module({
  imports: [
    CommonModule,
    DbModule // 确保有地基
  ],
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