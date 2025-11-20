// src/db/db.module.ts
import { Module, Global } from '@nestjs/common';
import { DbService } from './db.service';

@Global() // 重点：加上这个装饰器，让它成为全公司的基础设施
@Module({
  providers: [DbService],
  exports: [DbService], // 导出服务，让别人能用
})
export class DbModule {}