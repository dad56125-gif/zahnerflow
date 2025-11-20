import { Module } from '@nestjs/common';
import { MfcController } from './mfc.controller';
import { MfcService } from './mfc.service';
import { MfcDataService } from './mfc-data.service';
import { MfcErrorHandlerService } from './services/mfc-error-handler.service';
import { MfcGateway } from './mfcGateway';
import { MfcDeviceService } from './mfcDevice.service';
import { DbModule } from '../../db/db.module'; // 引入地基

@Module({
  imports: [DbModule], // 确保注入
  controllers: [MfcController],
  providers: [
    MfcService,
    MfcDataService,
    MfcErrorHandlerService,
    MfcGateway,
    MfcDeviceService,
  ],
  exports: [
    MfcService,
    MfcDataService,
    MfcErrorHandlerService,
    MfcGateway,
  ],
})
export class MfcModule {}