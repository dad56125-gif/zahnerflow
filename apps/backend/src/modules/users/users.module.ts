import { Module } from '@nestjs/common';
import { DbModule } from '../../db/db.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [DbModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}