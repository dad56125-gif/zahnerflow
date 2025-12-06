import { Module } from '@nestjs/common';
import { ConsoleController } from './console.controller';
import { CommonModule } from '../../common/common.module'; // ✅ 导入来源模块

@Module({
  imports: [CommonModule], // ✅ 这一步至关重要！复用 CommonModule 里的实例
  controllers: [ConsoleController],
})
export class ConsoleModule {}