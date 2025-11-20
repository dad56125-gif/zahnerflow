import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
const Database = require('better-sqlite3'); // 需要安装: npm install better-sqlite3

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  // 这是数据库的实体实例
  public db: any;

  onModuleInit() {
    // 1. 确定数据库文件路径
    // 建议：直接定死在 data/app.db，简单明了
    const dbFolder = path.join(process.cwd(), 'data');
    const dbPath = path.join(dbFolder, 'app.db');

    // 确保文件夹存在
    if (!fs.existsSync(dbFolder)) {
      fs.mkdirSync(dbFolder, { recursive: true });
    }

    // 2. 连接数据库 (如果文件不存在，better-sqlite3 会自动创建它)
    this.db = new Database(dbPath); // 默认就是静音模式

    // 3. 开启 WAL 模式 (Write-Ahead Logging)
    // 这行代码能显著提升并发读写性能，也是防止数据库锁死的关键
    this.db.pragma('journal_mode = WAL');
    
    console.log(`数据库已连接: ${dbPath}`);
  }

  onModuleDestroy() {
    // 程序关闭时，优雅断开连接
    if (this.db) {
      this.db.close();
    }
  }

  /**
   * 核心方法：给其他模块提供“预编译”工具
   * @param sql SQL 语句，例如 "SELECT * FROM workflows WHERE id = ?"
   * @returns Statement 对象
   */
  prepare(sql: string) {
    return this.db.prepare(sql);
  }

  /**
   * 辅助方法：直接执行一段 SQL（通常用于建表）
   * @param sql SQL 语句
   */
  exec(sql: string) {
    return this.db.exec(sql);
  }
}