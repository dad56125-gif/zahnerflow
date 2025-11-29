import { Injectable, HttpException, HttpStatus, Logger, OnModuleInit } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import type { FurnacePreset, ProgramSegment, FurnaceSample } from '@zahnerflow/types';

// 保持原有的 Response 类，不需要改动
export class FurnaceResponse {
  static createFromParameterData(paramData: any, operationType: string = 'read'): any {
    if (!paramData) return { ok: false, error: '设备通信失败' };
    return {
      ok: true,
      data: {
        pv: paramData.pv || 0, sv: paramData.sv || 0, mv: paramData.mv || 0,
        status: paramData.status_a || paramData.status || 0,
        timestamp: paramData.timestamp || new Date().toISOString(),
        operation: operationType
      }
    };
  }
  static createErrorResponse(errorMsg: string): any { return { ok: false, error: errorMsg }; }
  static createFromDeviceStatus(deviceStatus: any, operationType: string = 'status'): any {
    if (!deviceStatus) return this.createErrorResponse('设备状态数据为空');
    return {
      ok: true,
      data: {
        pv: deviceStatus.pv || 0, sv: deviceStatus.sv || 0, mv: deviceStatus.mv || 0,
        status: deviceStatus.status || 0, segment: deviceStatus.segment || 0,
        segment_time: deviceStatus.segment_time || 0, segment_time_set: deviceStatus.segment_time_set || 0,
        timestamp: deviceStatus.timestamp || new Date().toISOString(),
        operation: operationType
      }
    };
  }
}

@Injectable()
export class FurnaceDataService implements OnModuleInit {
  private readonly logger = new Logger(FurnaceDataService.name);

  // ========== 批量写入缓冲区（阶段2.3） ==========
  private sampleBuffer: any[] = [];           // 样本缓冲区
  private readonly BATCH_SIZE = 10;           // 10条数据批量写入（约20秒）
  private lastFlushTime = Date.now();         // 上次刷新时间
  private readonly MAX_BUFFER_TIME = 10000;   // 最长缓冲时间（10秒）

  constructor(private readonly db: DbService) {}

  onModuleInit() {
    // 1. 初始化预设表 (JSON 存 segments)
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS furnace_presets (
        name TEXT PRIMARY KEY,
        segments_json TEXT,
        summary TEXT,
        created_at TEXT,
        updated_at TEXT
      )
    `).run();

    // 2. 初始化采样表 (符合新架构方案)
    // 删除旧表（开发环境）或重命名备份（生产环境）
    this.db.prepare(`DROP TABLE IF EXISTS furnace_samples`).run();

    // 创建新表：furnace_metrics_recent
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS furnace_metrics_recent (
        timestamp INTEGER PRIMARY KEY,  -- ✅ INTEGER Unix时间戳
        pv REAL, sv REAL, mv REAL,
        status_code INTEGER,            -- ✅ 新增：设备状态码
        segment INTEGER,
        segment_time REAL,
        segment_time_set REAL
      )
    `).run();

    // 3. 创建事件表（用于历史状态补全）
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS furnace_events (
        timestamp INTEGER PRIMARY KEY,
        status_code INTEGER,
        segment INTEGER,
        segment_time_set REAL
      )
    `).run();

    // 4. 创建归档表（用于长期存储）
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS furnace_metrics_archive (
        timestamp INTEGER PRIMARY KEY,
        pv REAL,
        tier INTEGER DEFAULT 1
      )
    `).run();

    // 5. 创建查询视图（统一recent和archive）
    this.db.prepare(`
      CREATE VIEW IF NOT EXISTS furnace_history_view AS
      SELECT timestamp, pv, sv, mv, status_code, 0 as tier
      FROM furnace_metrics_recent
      UNION ALL
      SELECT timestamp, pv, NULL, NULL, NULL, tier
      FROM furnace_metrics_archive
    `).run();

    // 6. 创建索引
    this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_furnace_recent_time
      ON furnace_metrics_recent(timestamp)
    `).run();

    this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_furnace_events_time
      ON furnace_events(timestamp)
    `).run();
  }

  // ========== Timestamp 转换函数（保持前端兼容性） ==========

  /**
   * 将 ISO 字符串转换为 Unix 时间戳（秒）
   * 用于数据库存储（INTEGER主键）
   */
  private toDbTimestamp(isoString: string): number {
    return Math.floor(new Date(isoString).getTime() / 1000);
  }

  /**
   * 将 Unix 时间戳（秒）转换为 ISO 字符串
   * 用于返回前端（保持接口兼容）
   */
  private fromDbTimestamp(timestamp: number): string {
    return new Date(timestamp * 1000).toISOString();
  }

  // ---------- 预设管理 (Presets) ----------

  async listPresets(): Promise<Pick<FurnacePreset, 'name' | 'createdAt' | 'updatedAt'>[]> {
    const rows = this.db.prepare(`
      SELECT name, created_at as createdAt, updated_at as updatedAt FROM furnace_presets
    `).all();
    return rows as any[];
  }

  async getPreset(name: string): Promise<FurnacePreset> {
    const row = this.db.prepare(`SELECT * FROM furnace_presets WHERE name = ?`).get(name) as any;
    if (!row) throw new HttpException('Preset not found', HttpStatus.NOT_FOUND);
    return {
      name: row.name,
      segments: JSON.parse(row.segments_json),
      summary: row.summary,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async createPreset(name: string, segments: ProgramSegment[], summary?: string): Promise<FurnacePreset> {
    const now = new Date().toISOString();
    try {
      this.db.prepare(`
        INSERT INTO furnace_presets (name, segments_json, summary, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(name, JSON.stringify(segments), summary || '', now, now);
      
      return { name, segments, summary, createdAt: now, updatedAt: now } as any;
    } catch (e: any) {
      if (e.message.includes('UNIQUE constraint')) throw new HttpException('Preset name already exists', HttpStatus.CONFLICT);
      throw e;
    }
  }

  async updatePreset(name: string, segments: ProgramSegment[]): Promise<FurnacePreset> {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      UPDATE furnace_presets 
      SET segments_json = ?, updated_at = ?
      WHERE name = ?
    `).run(JSON.stringify(segments), now, name);

    if (result.changes === 0) throw new HttpException('Preset not found', HttpStatus.NOT_FOUND);
    return this.getPreset(name);
  }

  async deletePreset(name: string): Promise<void> {
    this.db.prepare(`DELETE FROM furnace_presets WHERE name = ?`).run(name);
  }

  async clonePreset(name: string, newName: string): Promise<FurnacePreset> {
    const src = await this.getPreset(name);
    return this.createPreset(newName, src.segments, src.summary);
  }

  // 应用预设逻辑保留（纯逻辑，不涉及 DB，除了读取预设）
  async applyPreset(
    name: string,
    getDeviceSegments: () => Promise<ProgramSegment[]>,
    setDeviceSegments: (segments: ProgramSegment[]) => Promise<void>
  ): Promise<{ changed: boolean; steps: string[] }> {
    const preset = await this.getPreset(name);
    const before = await getDeviceSegments();
    const steps: string[] = [];

    try {
      if (this.segmentsEqual(before, preset.segments)) {
        steps.push('No change (idempotent).');
        return { changed: false, steps };
      }
      await setDeviceSegments(preset.segments);
      const after = await getDeviceSegments();
      if (!this.segmentsEqual(after, preset.segments)) throw new Error('Verification failed');
      steps.push('Applied preset and verified.');
      return { changed: true, steps };
    } catch (err: any) {
      this.logger.warn(`Apply failed, rolling back: ${err?.message}`);
      try { await setDeviceSegments(before); steps.push('Rolled back.'); } catch {}
      throw new HttpException({ message: 'Apply failed', steps }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private segmentsEqual(a: ProgramSegment[], b: ProgramSegment[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((x, i) => x.id === b[i].id && x.temperature === b[i].temperature && x.time === b[i].time);
  }

  // ---------- 采样数据管理 (Samples) ----------

  async addFurnaceSample(d: {
    device_name: string;
    timestamp: string;
    temperature: number;
    sv: number;
    mv: number;
    status_code?: number;  // ✅ 新增：设备状态码
  }): Promise<void> {
    // ✅ 改造：先缓冲，满足条件再批量写入（减少I/O）
    this.sampleBuffer.push({
      timestamp: this.toDbTimestamp(d.timestamp),
      pv: d.temperature,
      sv: d.sv,
      mv: d.mv,
      status_code: d.status_code || 0
    });

    // 检查是否需要刷新缓冲区（大小或时间）
    const now = Date.now();
    if (
      this.sampleBuffer.length >= this.BATCH_SIZE ||
      (now - this.lastFlushTime) >= this.MAX_BUFFER_TIME
    ) {
      this.flushBuffer();
    }

    this.logger.debug(`Buffered sample: ${d.temperature}°C, buffer size: ${this.sampleBuffer.length}`);
  }

  /**
   * 批量刷新缓冲区到数据库
   * 使用事务确保数据一致性
   */
  private flushBuffer(): void {
    if (this.sampleBuffer.length === 0) return;

    try {
      // ✅ 使用better-sqlite3的事务API（DbService.db 是 Database 实例）
      // TypeScript无法识别this.db.db，使用any绕过类型检查
      const db: any = this.db;
      const insertMany = db.db.transaction((samples: any[]) => {
        const stmt = this.db.prepare(`
          INSERT INTO furnace_metrics_recent
          (timestamp, pv, sv, mv, status_code, segment, segment_time, segment_time_set)
          VALUES (?, ?, ?, ?, ?, 0, 0, 0)
        `);

        for (const sample of samples) {
          stmt.run(
            sample.timestamp,
            sample.pv,
            sample.sv,
            sample.mv,
            sample.status_code
          );
        }
      });

      insertMany(this.sampleBuffer);  // ✅ 传入samples数组

      this.logger.debug(`Flushed ${this.sampleBuffer.length} samples to database`);

      // 清空缓冲区
      this.sampleBuffer = [];
      this.lastFlushTime = Date.now();
    } catch (error) {
      this.logger.error(`Failed to flush buffer: ${error}`);
      // 出错时不清空缓冲区，下次重试
    }
  }

  /**
   * 记录设备状态变更事件
   * 用于历史数据的状态补全
   */
  async addFurnaceEvent(d: {
    timestamp: string;
    status_code: number;
    segment?: number;
    segment_time_set?: number;
  }): Promise<void> {
    this.db.prepare(`
      INSERT INTO furnace_events
      (timestamp, status_code, segment, segment_time_set)
      VALUES (?, ?, ?, ?)
    `).run(
      this.toDbTimestamp(d.timestamp),  // ✅ string → INTEGER
      d.status_code,
      d.segment || 0,
      d.segment_time_set || 0
    );

    this.logger.debug(`Logged event: status=${d.status_code}, segment=${d.segment || 0}`);
  }

  /**
   * 查询历史数据
   * 改造：支持timestamp转换（INTEGER ↔ ISO字符串），添加status_code字段
   */
  async queryFurnace(from?: string, to?: string, limit?: number, downsample?: number) {
    let sql = `SELECT timestamp, pv, sv, mv, status_code FROM furnace_metrics_recent`;
    const params = [];

    // 1. 时间范围过滤（将ISO字符串转换为Unix时间戳）
    if (from && to) {
      sql += ` WHERE timestamp BETWEEN ? AND ?`;
      params.push(this.toDbTimestamp(from), this.toDbTimestamp(to));
    } else if (from) {
      sql += ` WHERE timestamp >= ?`;
      params.push(this.toDbTimestamp(from));
    } else if (to) {
      sql += ` WHERE timestamp <= ?`;
      params.push(this.toDbTimestamp(to));
    }

    sql += ` ORDER BY timestamp ASC`;

    // 2. Limit
    if (limit && limit > 0) {
      sql += ` LIMIT ?`;
      params.push(limit);
    }

    const rows = this.db.prepare(sql).all(...params);

    // 3. 将 timestamp INTEGER 转换回 ISO 字符串（保持前端兼容性）
    // 同时添加status_code字段
    const convertedRows = rows.map(row => ({
      timestamp: this.fromDbTimestamp(row.timestamp),  // ✅ INTEGER → ISO string
      pv: row.pv,
      sv: row.sv,
      mv: row.mv,
      status_code: row.status_code  // ✅ 新增字段
    }));

    // 4. 降采样 (依然在内存做，因为 SQL 很难做间隔取样)
    if (downsample && downsample > 1) {
      return convertedRows.filter((_, i) => i % downsample === 0);
    }
    return convertedRows;
  }

  // 兼容旧接口
  async getHistoryData(params: { start_date?: string; end_date?: string; limit?: number }) {
    const data = await this.queryFurnace(params.start_date, params.end_date, params.limit);
    return { data, total: data.length, params };
  }
  
  // 导出和清理逻辑暂时不做复杂实现，预留接口
  async exportData(params: any) { return { download_url: '', filename: 'not_implemented' }; }
  async cleanupData(olderThanDays: number = 30) {
    // 简单的 SQL 清理
    const date = new Date();
    date.setDate(date.getDate() - olderThanDays);
    const res = this.db.prepare(`DELETE FROM furnace_samples WHERE ts < ?`).run(date.toISOString());
    return { deleted_count: res.changes };
  }
}