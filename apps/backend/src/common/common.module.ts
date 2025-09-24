import { Module } from '@nestjs/common';
import { ConsoleDisplayManager } from './console-display-manager.service';
import { ConsoleDisplayManagerController } from './console-display-manager.controller';

@Module({
  providers: [ConsoleDisplayManager],
  controllers: [ConsoleDisplayManagerController],
  exports: [ConsoleDisplayManager],
})
export class CommonModule {}