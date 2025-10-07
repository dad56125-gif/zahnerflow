import { Module, Global } from '@nestjs/common';
import { DbService } from './db.service';
import { DbController } from './db.controller';
import { DbUiController } from './db.ui.controller';

@Global()
@Module({
  providers: [DbService],
  controllers: [DbController, DbUiController],
  exports: [DbService],
})
export class DbModule {}
