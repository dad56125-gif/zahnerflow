import { Global, Module } from '@nestjs/common';
import { SamplingService } from './sampling.service';
import { FurnaceDeviceService } from '../../devices/furnace-device.service';
import { MfcDeviceService } from '../../devices/mfc-device.service';
import { MfcService } from '../mfc/mfc.service';

@Global()
@Module({
  providers: [SamplingService, FurnaceDeviceService, MfcDeviceService, MfcService],
  exports: [SamplingService, FurnaceDeviceService],
})
export class SamplingModule {}

