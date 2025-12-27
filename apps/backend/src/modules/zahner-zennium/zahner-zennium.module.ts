import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import * as http from 'http';
import { ZahnerZenniumService } from './zahner-zennium.service';
import { ZahnerZenniumController } from './zahner-zennium.controller';
import { NotificationModule } from '../../notification/notification.module';
import { CommonModule } from '../../common/common.module';

// 🔧 Keep-Alive 连接池，复用 TCP 连接
const keepAliveAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 5,
});

@Module({
  imports: [
    HttpModule.register({
      httpAgent: keepAliveAgent,
      timeout: 10000,
    }),
    NotificationModule,
    CommonModule
  ],
  controllers: [ZahnerZenniumController],
  providers: [ZahnerZenniumService],
  exports: [ZahnerZenniumService],
})
export class ZahnerZenniumModule { }