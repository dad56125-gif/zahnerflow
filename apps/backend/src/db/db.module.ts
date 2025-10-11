import { Module, Global } from '@nestjs/common';
import { DbService } from './db.service';
import { DbController } from './db.controller';
import { DbUiController } from './db.ui.controller';
import { NotificationModule } from '../notification/notification.module';

@Global()
@Module({
  imports: [NotificationModule],
  providers: [DbService],
  controllers: [DbController, DbUiController],
  exports: [DbService],
})
export class DbModule {}
