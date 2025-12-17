import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserSettingsService } from './user-settings.service';
import { UsersController } from './users.controller';

@Module({
  imports: [], // 如果 DbModule 是全局的，这里留空；否则写 [DbModule]
  controllers: [UsersController],
  providers: [UsersService, UserSettingsService],
  exports: [UsersService, UserSettingsService],
})
export class UsersModule { }
