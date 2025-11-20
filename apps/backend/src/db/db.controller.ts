import { Controller, Get } from '@nestjs/common';
import { DbService } from './db.service';

@Controller('api/system')
export class SystemController {
  constructor(private db: DbService) {}

  @Get('stats')
  getDbStats() {
    // 比如返回数据库文件大小，或者简单的连通性测试
    return { status: 'ok', dbPath: 'data/app.db' };
  }
}