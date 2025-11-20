import { Module } from '@nestjs/common';
import { ConsoleController } from './console.controller';
import { CommonModule } from '../../common/common.module'; // ✅ 导入来源模块

@Module({
  imports: [CommonModule], // ✅ 这一步至关重要！复用 CommonModule 里的实例
  controllers: [ConsoleController],
  // providers: [ConsoleDisplayManager], // ❌ 必须删掉！不要自己造实例
  // exports: [ConsoleDisplayManager],   // ❌ 也不需要导出，CommonModule 已经导出了
})
export class ConsoleModule {}