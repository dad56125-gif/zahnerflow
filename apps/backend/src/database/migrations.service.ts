import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class MigrationsService implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    // 自动运行迁移（仅在开发环境）
    if (process.env.NODE_ENV === 'development' && process.env.DB_TYPE === 'sqlite') {
      await this.runMigrations();
    }
  }

  async runMigrations(): Promise<void> {
    try {
      const migrations = await this.dataSource.runMigrations();
      console.log(`Successfully ran ${migrations.length} migrations:`);
      migrations.forEach(m => console.log(`- ${m.name}`));
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }

  async revertLastMigration(): Promise<void> {
    try {
      await this.dataSource.undoLastMigration();
      console.log('Successfully reverted last migration');
    } catch (error) {
      console.error('Failed to revert migration:', error);
      throw error;
    }
  }

  async showMigrations(): Promise<void> {
    const migrations = await this.dataSource.showMigrations();
    console.log('Migrations:');
    migrations.forEach(m => {
      console.log(`${m.name} - ${m.timestamp} - ${m.executedAt ? 'Executed' : 'Pending'}`);
    });
  }

  async checkPendingMigrations(): Promise<boolean> {
    const pendingMigrations = await this.dataSource.query(
      `SELECT * FROM ${this.dataSource.options.migrationsTableName} WHERE name NOT IN (SELECT name FROM migrations)`
    );
    return pendingMigrations.length > 0;
  }
}