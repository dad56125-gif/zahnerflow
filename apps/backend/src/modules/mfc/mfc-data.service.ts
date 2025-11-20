import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import { MfcSample } from '@zahnerflow/types';

export interface FlowHistoryQuery {
  device_address?: number;
  from?: Date;
  to?: Date;
  limit?: number;
  downsample?: number;
}

export interface CommunicationLogEntry {
  timestamp: string;
  direction: 'TX' | 'RX' | 'ERROR';
  data: string;
  connection_id?: string;
  error?: string;
  error_category?: string;
}

@Injectable()
export class MfcDataService implements OnModuleInit {
  private readonly logger = new Logger(MfcDataService.name);

  constructor(private readonly db: DbService) {}

  onModuleInit() {
    // 1. 初始化 MFC 采样表
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS mfc_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        address INTEGER NOT NULL,
        flow_sccm REAL,
        flow_percent REAL,
        setpoint REAL,
        active_setpoint REAL
      )
    `).run();
    
    // 建立索引加速查询
    this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_mfc_ts ON mfc_samples(ts)`).run();
    this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_mfc_addr ON mfc_samples(address)`).run();

    // 2. 初始化通信日志表
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS mfc_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        direction TEXT,
        data TEXT,
        error_category TEXT
      )
    `).run();
  }

  // ==================== 流量数据管理 ====================

  addFlowSample(sample: MfcSample): void {
    this.db.prepare(`
      INSERT INTO mfc_samples (ts, address, flow_sccm, flow_percent, setpoint, active_setpoint)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      sample.ts,
      sample.address,
      sample.flow_sccm,
      sample.flow_percent || 0,
      sample.digital_setpoint_percent || 0,
      sample.active_setpoint_percent || 0
    );
  }

  async queryFlowHistory(query: FlowHistoryQuery): Promise<{
    samples: MfcSample[];
    total: number;
    query_info: FlowHistoryQuery;
  }> {
    let sql = `SELECT ts, address, flow_sccm, flow_percent, setpoint as digital_setpoint_percent, active_setpoint as active_setpoint_percent FROM mfc_samples`;
    const conditions: string[] = [];
    const params: any[] = [];

    if (query.device_address !== undefined) {
      conditions.push(`address = ?`);
      params.push(query.device_address);
    }

    if (query.from) {
      conditions.push(`ts >= ?`);
      params.push(query.from.toISOString());
    }

    if (query.to) {
      conditions.push(`ts <= ?`);
      params.push(query.to.toISOString());
    }

    if (conditions.length > 0) {
      sql += ` WHERE ` + conditions.join(' AND ');
    }

    sql += ` ORDER BY ts ASC`;

    if (query.limit && query.limit > 0) {
      sql += ` LIMIT ?`;
      params.push(query.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as any[];
    
    // 简单降采样 (内存中处理)
    let result = rows;
    if (query.downsample && query.downsample > 1) {
      result = rows.filter((_, i) => i % query.downsample! === 0);
    }

    return {
      samples: result,
      total: rows.length, // 注意：这里返回的是查出来的数量，不是全表总量
      query_info: query,
    };
  }

  // ==================== 通信日志管理 ====================

  addCommunicationLog(entry: Omit<CommunicationLogEntry, 'timestamp'>): void {
    this.db.prepare(`
      INSERT INTO mfc_logs (ts, direction, data, error_category)
      VALUES (?, ?, ?, ?)
    `).run(
      new Date().toISOString(),
      entry.direction,
      entry.data,
      entry.error_category || null
    );
  }

  getCommunicationLog(limit: number = 100): CommunicationLogEntry[] {
    const rows = this.db.prepare(`
      SELECT ts as timestamp, direction, data, error_category 
      FROM mfc_logs 
      ORDER BY id DESC 
      LIMIT ?
    `).all(limit) as CommunicationLogEntry[];
    
    return rows;
  }

  clearCommunicationLog(): { ok: boolean; cleared_count: number } {
    const res = this.db.prepare(`DELETE FROM mfc_logs`).run();
    return { ok: true, cleared_count: res.changes };
  }

  // ==================== 统计信息 (基于 SQL 实时计算) ====================

  getSystemOverview() {
    // 计算最近5分钟的错误数
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    const errorCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM mfc_logs 
      WHERE direction = 'ERROR' AND ts > ?
    `).get(fiveMinAgo) as { count: number };

    // 统计总样本数
    const sampleCount = this.db.prepare(`SELECT COUNT(*) as count FROM mfc_samples`).get() as { count: number };

    // 活跃设备数 (最近1分钟)
    const oneMinAgo = new Date(Date.now() - 60000).toISOString();
    const activeDevices = this.db.prepare(`
      SELECT COUNT(DISTINCT address) as count FROM mfc_samples WHERE ts > ?
    `).get(oneMinAgo) as { count: number };

    return {
      total_devices: activeDevices.count, // 简化处理，近似值
      active_devices: activeDevices.count,
      total_samples: sampleCount.count,
      total_errors: errorCount.count,
      system_status: errorCount.count > 10 ? 'error' : (errorCount.count > 0 ? 'warning' : 'healthy'),
      last_update: new Date().toISOString(),
    };
  }

  // 为了兼容旧接口保留空实现或简化实现
  getErrorStats() { return { total_errors: 0, recent_errors_5min: 0, error_categories: {}, last_error_time: '' }; }
  getDeviceStatistics() { return { total_samples: 0, device_status: 'active' }; }
}