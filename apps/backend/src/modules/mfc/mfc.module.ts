import { Module } from '@nestjs/common';
import { MfcController } from './mfc.controller';
import { MfcService } from './mfc.service';
import { MfcDeviceService } from '../../devices/mfc-device.service';

@Module({
  imports: [],
  controllers: [MfcController],
  providers: [MfcService, MfcDeviceService],
})
export class MfcModule {}

