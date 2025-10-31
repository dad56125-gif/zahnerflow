import { Injectable, OnModuleInit } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { Workflow } from '../interfaces/module-interfaces';
import { Subject, Observable } from 'rxjs';

export interface User {
  id: string;
  user: string;
  email: string | null;
  created_at: string;
}

export interface WorkflowEnhanced {
  id: string;
  user: string;
  project_name: string;
  title: string;
  description: string | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

export interface DataFilePath {
  id: string;
  user: string;
  project_name: string;
  individual_name: string;
  test_type: string;
  base_path: string;
  dir_path: string;
  created_at: string;
}

type DbJson = {
  workflow: Array<{
    id: string;
    owner_name: string | null;
    individual_name: string | null;
    title: string;
    description: string | null;
    tags: string | null;
    created_at: string;
    updated_at: string;
  }>;
  node: Array<{
    id: string;
    workflow_id: string;
    node_key: string;
    node_type: string | null;
    display_name: string | null;
    sort_order: number;
    enabled: number;
    position_json: string | null;
  }>;
  node_param: Array<{
    id: string;
    node_id: string;
    key: string;
    value_text: string | null;
    value_num: number | null;
    value_json: string | null;
    value_type: string;
    updated_at: string;
  }>;
  data_file: Array<{
    id: string;
    owner_name: string;
    individual_name: string;
    test_type: string;
    prefix: string;
    cycle: number;
    ts: string;
    filename: string;
    rel_path: string;
    size: number | null;
    sha256: string | null;
    workflow_id: string | null;
    node_id: string | null;
  }>;
};

@Injectable()
export class DbService implements OnModuleInit {
  private dbPath = this.resolveDbPath();
  private db: DbJson = { workflow: [], node: [], node_param: [], data_file: [] };
  private events$ = new Subject<{ type: string; payload: any; ts: string }>();
  private recentEvents: Array<{ type: string; payload: any; ts: string }> = [];
  private readonly eventBufferSize = 200;

  // New in-memory arrays for enhanced schema
  private users: User[] = [];
  private workflows: WorkflowEnhanced[] = [];
  private dataFilePaths: DataFilePath[] = [];

  async onModuleInit(): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.dbPath), { recursive: true });
    await this.load();
  }

  private resolveDbPath(): string {
    const p = process.env.DB_JSON_PATH;
    if (p && p.trim()) {
      return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
    }
    return path.join(process.cwd(), 'data', 'app.db.json');
  }

  private async load(): Promise<void> {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = await fs.promises.readFile(this.dbPath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.db = {
          workflow: Array.isArray(parsed.workflow) ? parsed.workflow : [],
          node: Array.isArray(parsed.node) ? parsed.node : [],
          node_param: Array.isArray(parsed.node_param) ? parsed.node_param : [],
          data_file: Array.isArray(parsed.data_file) ? parsed.data_file : [],
        };
      } else {
        await this.save();
      }
    } catch {
      // 若损坏则备份并重建
      try { await fs.promises.copyFile(this.dbPath, this.dbPath + '.bak'); } catch {}
      this.db = { workflow: [], node: [], node_param: [], data_file: [] };
      await this.save();
    }
  }

  private async save(): Promise<void> {
    const tmp = this.dbPath + '.tmp';
    await fs.promises.writeFile(tmp, JSON.stringify(this.db, null, 2), 'utf-8');
    await fs.promises.rename(tmp, this.dbPath);
  }

  getEvents(): Observable<{ type: string; payload: any; ts: string }> {
    return this.events$.asObservable();
  }

  // 对外事件接口：统一由此发出到 SSE（包装内部 pushEvent）。
  emit(type: string, payload: any): void {
    this.pushEvent(type, payload);
  }

  private pushEvent(type: string, payload: any): void {
    const evt = { type, payload, ts: new Date().toISOString() };
    this.events$.next(evt);
    this.recentEvents.push(evt);
    if (this.recentEvents.length > this.eventBufferSize) this.recentEvents.shift();
  }

  getRecentEvents(limit = 50): Array<{ type: string; payload: any; ts: string }> {
    if (limit <= 0) return [];
    return this.recentEvents.slice(-limit);
  }

  private upsert<T extends { id: string }>(arr: T[], row: T, by?: (x: T) => boolean): void {
    const idx = by ? arr.findIndex(by) : arr.findIndex((x) => x.id === row.id);
    if (idx >= 0) arr[idx] = row; else arr.push(row);
  }

  async upsertWorkflow(wf: Workflow & { tags?: string[] }): Promise<void> {
    const tagStr = Array.isArray((wf as any).tags) ? JSON.stringify((wf as any).tags) : null;
    this.upsert(this.db.workflow, {
      id: wf.id,
      owner_name: wf.ownerName || null,
      individual_name: wf.individualName || null,
      title: wf.name,
      description: (wf as any).description ?? null,
      tags: tagStr,
      created_at: wf.createdAt.toISOString(),
      updated_at: wf.updatedAt.toISOString(),
    });

    const nodes = (wf.definition?.nodes as any[]) || [];
    let order = 0;
    for (const n of nodes) {
      const nodeId = `node_${n.id}`;
      const nodeRow = {
        id: nodeId,
        workflow_id: wf.id,
        node_key: n.id,
        node_type: n.type || null,
        display_name: n.name || null,
        sort_order: order++,
        enabled: 1,
        position_json: n.position ? JSON.stringify(n.position) : null,
      } as DbJson['node'][number];

      const nodeBy = (x: DbJson['node'][number]) => x.workflow_id === wf.id && x.node_key === n.id;
      const idx = this.db.node.findIndex(nodeBy);
      if (idx >= 0) this.db.node[idx] = { ...this.db.node[idx], ...nodeRow };
      else this.db.node.push(nodeRow);

      const cfg = n.config || {};
      for (const k of Object.keys(cfg)) {
        const v = (cfg as any)[k];
        let value_text: string | null = null;
        let value_num: number | null = null;
        let value_json: string | null = null;
        let value_type: string = typeof v;
        if (v == null) {
          value_text = null; value_type = 'null';
        } else if (typeof v === 'number') {
          value_num = v;
        } else if (typeof v === 'string') {
          value_text = v;
        } else {
          value_json = JSON.stringify(v); value_type = 'json';
        }
        const row = {
          id: `${nodeId}:${k}`,
          node_id: nodeId,
          key: k,
          value_text,
          value_num,
          value_json,
          value_type,
          updated_at: new Date().toISOString(),
        } as DbJson['node_param'][number];
        const npIdx = this.db.node_param.findIndex((x) => x.node_id === nodeId && x.key === k);
        if (npIdx >= 0) this.db.node_param[npIdx] = row; else this.db.node_param.push(row);
      }
    }

    await this.save();
    this.pushEvent('workflow_upsert', {
      id: wf.id,
      owner_name: wf.ownerName || null,
      individual_name: wf.individualName || null,
      title: wf.name,
      nodes: nodes.length,
      updated_at: wf.updatedAt.toISOString(),
    });
  }

  async insertDataFile(row: {
    id: string;
    owner_name: string;
    individual_name: string;
    test_type: string;
    prefix: string;
    cycle: number;
    ts: string;
    filename: string;
    rel_path: string;
    size?: number;
    sha256?: string;
    workflow_id?: string | null;
    node_id?: string | null;
  }): Promise<void> {
    const exists = this.db.data_file.some(
      (x) => x.owner_name === row.owner_name && x.individual_name === row.individual_name && x.test_type === row.test_type && x.filename === row.filename,
    );
    if (!exists) {
      this.db.data_file.push({
        id: row.id,
        owner_name: row.owner_name,
        individual_name: row.individual_name,
        test_type: row.test_type,
        prefix: row.prefix,
        cycle: row.cycle,
        ts: row.ts,
        filename: row.filename,
        rel_path: row.rel_path,
        size: row.size ?? null,
        sha256: row.sha256 ?? null,
        workflow_id: row.workflow_id ?? null,
        node_id: row.node_id ?? null,
      });
      await this.save();
      this.pushEvent('data_file_insert', row);
    }
  }

  async getStats(): Promise<Record<string, number>> {
    return {
      workflow: this.db.workflow.length,
      node: this.db.node.length,
      node_param: this.db.node_param.length,
      data_file: this.db.data_file.length,
    };
  }

  async queryWorkflows(params: {
    owner_name?: string;
    individual_name?: string;
    title?: string;
    keyword?: string; // search in title/description
    created_from?: string; // ISO
    created_to?: string;   // ISO
    sortBy?: 'created_at' | 'updated_at' | 'title';
    order?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }): Promise<{ items: DbJson['workflow']; total: number }> {
    const {
      owner_name,
      individual_name,
      title,
      keyword,
      created_from,
      created_to,
      sortBy = 'updated_at',
      order = 'desc',
      page = 1,
      limit = 20,
    } = params || {};
    let arr = [...this.db.workflow];
    if (owner_name) arr = arr.filter((x) => (x.owner_name || '').toLowerCase() === owner_name.toLowerCase());
    if (individual_name) arr = arr.filter((x) => (x.individual_name || '').toLowerCase() === individual_name.toLowerCase());
    if (title) arr = arr.filter((x) => (x.title || '').toLowerCase().includes(title.toLowerCase()));
    if (keyword) {
      const kw = keyword.toLowerCase();
      arr = arr.filter((x) => (x.title || '').toLowerCase().includes(kw) || (x.description || '').toLowerCase().includes(kw));
    }
    if (created_from) {
      const d = new Date(created_from).getTime();
      arr = arr.filter((x) => new Date(x.created_at).getTime() >= d);
    }
    if (created_to) {
      const d = new Date(created_to).getTime();
      arr = arr.filter((x) => new Date(x.created_at).getTime() <= d);
    }

    arr.sort((a, b) => {
      const dir = order === 'asc' ? 1 : -1;
      if (sortBy === 'title') return ((a.title || '').localeCompare(b.title || '')) * dir;
      if (sortBy === 'created_at') return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
      return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir;
    });
    const total = arr.length;
    const start = Math.max(0, (page - 1) * limit);
    const items = arr.slice(start, start + limit);
    return { items, total };
  }

  async queryDataFiles(params: {
    owner_name?: string;
    individual_name?: string;
    test_type?: string;
    prefix?: string;
    cycle?: number;
    filename_contains?: string;
    ts_from?: string;
    ts_to?: string;
    sortBy?: 'ts' | 'filename';
    order?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }): Promise<{ items: DbJson['data_file']; total: number }> {
    const {
      owner_name,
      individual_name,
      test_type,
      prefix,
      cycle,
      filename_contains,
      ts_from,
      ts_to,
      sortBy = 'ts',
      order = 'desc',
      page = 1,
      limit = 20,
    } = params || {};
    let arr = [...this.db.data_file];
    if (owner_name) arr = arr.filter((x) => x.owner_name.toLowerCase() === owner_name.toLowerCase());
    if (individual_name) arr = arr.filter((x) => x.individual_name.toLowerCase() === individual_name.toLowerCase());
    if (test_type) arr = arr.filter((x) => x.test_type.toLowerCase() === test_type.toLowerCase());
    if (prefix) arr = arr.filter((x) => (x.prefix || '').toLowerCase() === prefix.toLowerCase());
    if (typeof cycle === 'number' && !Number.isNaN(cycle)) arr = arr.filter((x) => x.cycle === cycle);
    if (filename_contains) arr = arr.filter((x) => x.filename.toLowerCase().includes(filename_contains.toLowerCase()));
    if (ts_from) { const t = new Date(ts_from).getTime(); arr = arr.filter((x) => new Date(x.ts).getTime() >= t); }
    if (ts_to) { const t = new Date(ts_to).getTime(); arr = arr.filter((x) => new Date(x.ts).getTime() <= t); }

    arr.sort((a, b) => {
      const dir = order === 'asc' ? 1 : -1;
      if (sortBy === 'filename') return a.filename.localeCompare(b.filename) * dir;
      return (new Date(a.ts).getTime() - new Date(b.ts).getTime()) * dir;
    });
    const total = arr.length;
    const start = Math.max(0, (page - 1) * limit);
    const items = arr.slice(start, start + limit);
    return { items, total };
  }

  async queryNodes(params: {
    workflow_id?: string;
    node_type?: string;
    node_key?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: DbJson['node']; total: number }> {
    const { workflow_id, node_type, node_key, page = 1, limit = 50 } = params || {};
    let arr = [...this.db.node];
    if (workflow_id) arr = arr.filter((x) => x.workflow_id === workflow_id);
    if (node_type) arr = arr.filter((x) => (x.node_type || '').toLowerCase() === node_type.toLowerCase());
    if (node_key) arr = arr.filter((x) => x.node_key === node_key);
    const total = arr.length;
    const start = Math.max(0, (page - 1) * limit);
    const items = arr.slice(start, start + limit);
    return { items, total };
  }

  async queryNodeParams(params: {
    node_id?: string;
    key?: string;
    value_contains?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: DbJson['node_param']; total: number }> {
    const { node_id, key, value_contains, page = 1, limit = 100 } = params || {};
    let arr = [...this.db.node_param];
    if (node_id) arr = arr.filter((x) => x.node_id === node_id);
    if (key) arr = arr.filter((x) => x.key === key);
    if (value_contains) {
      const kw = value_contains.toLowerCase();
      arr = arr.filter((x) =>
        (x.value_text && x.value_text.toLowerCase().includes(kw)) ||
        (x.value_json && x.value_json.toLowerCase().includes(kw)),
      );
    }
    const total = arr.length;
    const start = Math.max(0, (page - 1) * limit);
    const items = arr.slice(start, start + limit);
    return { items, total };
  }

  // User management methods
  createUser(userData: { user: string; email?: string }): User {
    const existingUser = this.users.find(u => u.user === userData.user);
    if (existingUser) {
      throw new Error(`User ${userData.user} already exists`);
    }

    const user: User = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      user: userData.user,
      email: userData.email || null,
      created_at: new Date().toISOString()
    };

    this.users.push(user);
    return user;
  }

  getUsers(): User[] {
    return this.users;
  }

  deleteUser(user: string): boolean {
    const index = this.users.findIndex(u => u.user === user);
    if (index === -1) return false;

    this.users.splice(index, 1);
    return true;
  }

  // Updated workflow methods
  createWorkflow(workflowData: {
    user: string;
    project_name: string;
    title: string;
    description?: string;
    tags?: string;
  }): WorkflowEnhanced {
    const workflow: WorkflowEnhanced = {
      id: `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      user: workflowData.user,
      project_name: workflowData.project_name,
      title: workflowData.title,
      description: workflowData.description || null,
      tags: workflowData.tags || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.workflows.push(workflow);
    return workflow;
  }

  // Data file path management
  createDataFilePath(pathData: {
    user: string;
    project_name: string;
    individual_name: string;
    test_type: string;
    base_path: string;
  }): DataFilePath {
    // Normalize Windows path
    const normalizedPath = pathData.base_path.replace(/\//g, '\\');
    const dirPath = path.join(
      normalizedPath,
      pathData.project_name,
      pathData.individual_name,
      pathData.test_type
    );

    const record: DataFilePath = {
      id: `path_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      user: pathData.user,
      project_name: pathData.project_name,
      individual_name: pathData.individual_name,
      test_type: pathData.test_type,
      base_path: normalizedPath,
      dir_path: dirPath,
      created_at: new Date().toISOString()
    };

    this.dataFilePaths.push(record);
    return record;
  }

  getDataFilePaths(user?: string): DataFilePath[] {
    if (user) {
      return this.dataFilePaths.filter(p => p.user === user);
    }
    return this.dataFilePaths;
  }

  getProjects(user: string): string[] {
    const projects = new Set<string>();
    this.dataFilePaths
      .filter(p => p.user === user)
      .forEach(p => projects.add(p.project_name));
    return Array.from(projects);
  }
}
