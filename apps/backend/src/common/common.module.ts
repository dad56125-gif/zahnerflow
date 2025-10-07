import { Module } from '@nestjs/common';
import { ConsoleDisplayManager } from './console-display-manager.service';

@Module({
  providers: [ConsoleDisplayManager],
  exports: [ConsoleDisplayManager],
})
export class CommonModule {}
