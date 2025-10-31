import { Module } from '@nestjs/common';
import { DbService } from '../../db/db.service';

// 简化版本：只包含DbService，没有UsersService和UsersController
@Module({
  providers: [DbService],
  exports: [DbService],
})
export class SimpleUsersModule {}