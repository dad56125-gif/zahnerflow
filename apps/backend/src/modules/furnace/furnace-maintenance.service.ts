import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../../db/db.service';

/**
 * 后台维护服务
 * 在DelayNode执行期间，自动归档30天前的数据到archive表
 */
@Injectable()
export class FurnaceMaintenanceService {
  private readonly logger = new Logger(FurnaceMaintenanceService.name);

  constructor(private readonly db: DbService) {}

  /**
   * 执行后台维护会话
   * @param windowSeconds 可用时间窗口（秒）
   */
  async runSession(windowSeconds: number): Promise<void> {
    const startTime = Date.now();
    const endTime = startTime + (windowSeconds * 1000);

    this.logger.log(`[Maintenance] Starting session, window: ${windowSeconds}s`);

    let archivedDays = 0;

    // 在时间窗口内持续执行维护任务
    while (Date.now() < endTime) {
      const done = await this.performMaintenanceCycle(endTime);
      if (done) break; // 没有更多数据需要归档

      archivedDays++;

      // 让出I/O，避免阻塞主线程
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const elapsed = (Date.now() - startTime) / 1000;
    this.logger.log(`[Maintenance] Session completed in ${elapsed}s, archived ${archivedDays} days`);
  }

  /**
   * 执行一次维护周期（归档一天的数据）
   * @param deadline 截止时间戳
   * @returns true: 没有更多数据需要归档, false: 时间窗口耗尽
   */
  private async performMaintenanceCycle(deadline: number): Promise<boolean> {
    // 检查是否有30天前的数据
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);

    const oldData = this.db.prepare(`
      SELECT date(timestamp, 'unixepoch') as date_str
      FROM furnace_metrics_recent
      WHERE timestamp < ?
      GROUP BY date(timestamp, 'unixepoch')
      ORDER BY timestamp ASC
      LIMIT 1
    `).get(thirtyDaysAgo);

    if (!oldData) {
      this.logger.debug('[Maintenance] No old data to archive');
      return true; // 没有更多数据，结束维护
    }

    // 检查时间窗口是否耗尽
    if (Date.now() >= deadline) {
      this.logger.warn('[Maintenance] Time window exhausted');
      return false; // 时间耗尽，中断维护
    }

    // 归档一天的数据
    return this.archiveOneDay(oldData.date_str, deadline);
  }

  /**
   * 归档某一天的数据（10s → 1min聚合）
   * 使用事务确保迁移和删除一致
   * @param dateStr 日期字符串（如 '2024-01-15'）
   * @param deadline 截止时间戳
   * @returns true: 成功, false: 时间窗口耗尽
   */
  private async archiveOneDay(dateStr: string, deadline: number): Promise<boolean> {
    // 再次检查时间窗口
    if (Date.now() >= deadline) {
      this.logger.warn('[Maintenance] Time window exhausted before archiving');
      return false;
    }

    this.logger.debug(`[Maintenance] Archiving ${dateStr}`);

    try {
      // ✅ 使用事务：迁移 + 删除
      // TypeScript无法识别this.db.db，使用any绕过类型检查
      const db: any = this.db;

      const archive = db.db.transaction(() => {
        // 1. 聚合数据（10s → 1min），插入archive表
        // 注意：不保留sv, mv, status_code（归档数据只保留pv）
        this.db.prepare(`
          INSERT INTO furnace_metrics_archive (timestamp, pv, tier)
          SELECT
            (timestamp / 60) * 60,  -- 规整到1分钟
            ROUND(AVG(pv), 2),       -- 计算PV均值，保留2位小数
            1                         -- Tier 1（温数据）
          FROM furnace_metrics_recent
          WHERE date(timestamp, 'unixepoch') = ?
          GROUP BY (timestamp / 60) * 60
        `).run(dateStr);

        // 2. 删除recent表的源数据
        const result = this.db.prepare(`
          DELETE FROM furnace_metrics_recent
          WHERE date(timestamp, 'unixepoch') = ?
        `).run(dateStr);

        return result.changes; // 返回删除的行数
      });

      const deletedRows = archive();

      this.logger.log(`[Maintenance] Archived ${dateStr}, deleted ${deletedRows} rows from recent`);

      return true;
    } catch (error) {
      this.logger.error(`[Maintenance] Failed to archive ${dateStr}: ${error}`);
      return false; // 失败，下次重试
    }
  }
}
