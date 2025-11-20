import { Injectable, OnModuleInit, ConflictException } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import { CreateUserDto } from './users.controller';

// 在这里定义 User 接口，实现自给自足
export interface User {
  id: string;
  user: string; // 对应数据库的 username 字段
  email: string | null;
  created_at: Date;
}

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(private readonly db: DbService) {}

  onModuleInit() {
    // 1. 初始化用户表
    // 使用 username 作为唯一键，防止重复创建
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        created_at TEXT NOT NULL
      )
    `).run();
  }

  /**
   * 创建用户
   */
  async createUser(dto: CreateUserDto): Promise<User> {
    const id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    try {
      this.db.prepare(`
        INSERT INTO users (id, username, email, created_at)
        VALUES (?, ?, ?, ?)
      `).run(id, dto.user, dto.email || null, now.toISOString());

      return {
        id,
        user: dto.user,
        email: dto.email || null,
        created_at: now,
      };
    } catch (error: any) {
      // SQLite 唯一约束冲突错误码通常是 SQLITE_CONSTRAINT
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        throw new ConflictException(`User '${dto.user}' already exists`);
      }
      throw error;
    }
  }

  /**
   * 获取所有用户
   */
  getUsers(): User[] {
    const rows = this.db.prepare(`
      SELECT id, username as user, email, created_at 
      FROM users 
      ORDER BY created_at DESC
    `).all() as any[];

    // 转换时间格式
    return rows.map(row => ({
      ...row,
      created_at: new Date(row.created_at)
    }));
  }

  /**
   * 删除用户
   */
  async deleteUser(username: string): Promise<boolean> {
    const result = this.db.prepare(`
      DELETE FROM users WHERE username = ?
    `).run(username);
    
    return result.changes > 0;
  }
}