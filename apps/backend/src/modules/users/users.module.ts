import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { DbService } from '../../db/db.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, DbService],
  exports: [UsersService],
})
export class UsersModule {}