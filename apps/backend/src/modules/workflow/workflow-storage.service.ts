import { Injectable } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import { Workflow } from '../../interfaces/module-interfaces';

@Injectable()
export class WorkflowStorageService {
  constructor(private readonly dbService: DbService) {
    // 构造函数里什么都不做
  }

  /**
   * ✅ 改名为 ensureTables 并设为 public
   * 让 WorkflowService 可以显式调用它
   */
  public ensureTables() {
    // 1. 工作流主表
    this.dbService.prepare(`
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        json_data TEXT NOT NULL,  -- 存储完整的 Workflow 对象
        created_at TEXT,
        updated_at TEXT
      )
    `).run();

    // 2. 计数器表 (替代原来的 .txt 文件)
    this.dbService.prepare(`
      CREATE TABLE IF NOT EXISTS counters (
        key TEXT PRIMARY KEY,
        value INTEGER
      )
    `).run();
  }

  /**
   * 获取下一个计数器值 (原子操作)
   * 替代了原来的 fs.readFileSync + fs.writeFileSync
   * @param key 计数器名称，如 'workflow' 或 'node'
   */
  getNextCounter(key: string): number {
    // 1. 尝试插入初始值 (如果不存在)
    this.dbService.prepare(`
      INSERT OR IGNORE INTO counters (key, value) VALUES (?, 0)
    `).run(key);

    // 2. 原子更新 +1 并返回新值 (利用 SQLite 的 RETURNING 语法)
    const result = this.dbService.prepare(`
      UPDATE counters 
      SET value = value + 1 
      WHERE key = ? 
      RETURNING value
    `).get(key) as { value: number };

    return result.value;
  }

  /**
   * 保存工作流 (UPSERT: 插入或更新)
   */
  async saveWorkflow(workflow: Workflow): Promise<void> {
    const jsonData = JSON.stringify(workflow);
    const now = new Date().toISOString();

    this.dbService.prepare(`
      INSERT INTO workflows (id, json_data, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET 
        json_data = excluded.json_data,
        updated_at = excluded.updated_at
    `).run(
      workflow.id, 
      jsonData, 
      workflow.createdAt.toISOString(), 
      now
    );
  }

  /**
   * 更新工作流 (其实和保存逻辑一样，为了兼容接口保留)
   */
  async updateWorkflow(id: string, workflow: Workflow): Promise<void> {
    return this.saveWorkflow(workflow);
  }

  /**
   * 获取单个工作流
   */
  async getWorkflow(id: string): Promise<Workflow | null> {
    const row = this.dbService.prepare(`
      SELECT json_data FROM workflows WHERE id = ?
    `).get(id) as { json_data: string } | undefined;

    if (!row) return null;

    return this.deserialize(row.json_data);
  }

  /**
   * 加载所有工作流
   */
  async loadAllWorkflows(): Promise<Map<string, Workflow>> {
    const rows = this.dbService.prepare(`
      SELECT id, json_data FROM workflows
    `).all() as { id: string; json_data: string }[];

    const map = new Map<string, Workflow>();
    for (const row of rows) {
      try {
        const wf = this.deserialize(row.json_data);
        map.set(row.id, wf);
      } catch (e) {
        console.error(`Failed to parse workflow ${row.id}`, e);
      }
    }
    return map;
  }

  /**
   * 删除工作流
   */
  async deleteWorkflow(id: string): Promise<void> {
    this.dbService.prepare(`DELETE FROM workflows WHERE id = ?`).run(id);
  }

  /**
   * 检查是否存在
   */
  async workflowExists(id: string): Promise<boolean> {
    const row = this.dbService.prepare(`
      SELECT 1 FROM workflows WHERE id = ?
    `).get(id);
    return !!row;
  }

  /**
   * 列表查询 (供 Controller 直接调用)
   */
  async listWorkflows(): Promise<Workflow[]> {
    const map = await this.loadAllWorkflows();
    return Array.from(map.values());
  }

  /**
   * 辅助函数：处理从 DB 读出来的 JSON
   * 主要负责把字符串时间转回 Date 对象
   */
  private deserialize(jsonStr: string): Workflow {
    const wf = JSON.parse(jsonStr);
    // 恢复 Date 对象
    wf.createdAt = new Date(wf.createdAt);
    wf.updatedAt = new Date(wf.updatedAt);
    return wf;
  }
}