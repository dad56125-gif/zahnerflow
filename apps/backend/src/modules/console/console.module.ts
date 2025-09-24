import { Module } from '@nestjs/common';
import { ConsoleController } from './console.controller';
import { ConsoleDisplayManager } from '../../common/console-display-manager.service';

@Module({
  controllers: [ConsoleController],
  providers: [ConsoleDisplayManager],
  exports: [ConsoleDisplayManager],
})
export class ConsoleModule {}