import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DbService } from '../../../apps/backend/src/db/db.service';

function tmpPath(name: string) {
  const p = path.join(process.cwd(), 'data', 'test');
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return path.join(p, name);
}

describe('DbService (JSON index)', () => {
  const dbFile = tmpPath('db.service.test.json');
  let svc: DbService;

  beforeAll(async () => {
    process.env.DB_JSON_PATH = dbFile;
    try { fs.unlinkSync(dbFile); } catch {}
    svc = new DbService();
    await svc.onModuleInit();
  });

  afterAll(async () => {
    try { fs.unlinkSync(dbFile); } catch {}
  });

  it('upserts workflow and emits event', async () => {
    const wf: any = {
      id: 'workflow_1',
      name: 'EIS Sweep',
      description: 'desc',
      ownerName: 'alice',
      individualName: 'Cell-01',
      definition: {
        nodes: [
          { id: 'n1', type: 'eis', name: 'EIS', config: { gain: 5, mode: 'std' }, position: { x: 0, y: 0 } },
        ],
        edges: [],
        version: 1,
      },
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    let gotWorkflowEvent = false;
    const sub = svc.getEvents().subscribe((e) => {
      if (e.type === 'workflow_upsert' && e.payload?.id === 'workflow_1') gotWorkflowEvent = true;
    });
    await svc.upsertWorkflow(wf);
    sub.unsubscribe();

    const stats = await svc.getStats();
    expect(stats.workflow).toBeGreaterThan(0);
    expect(stats.node).toBe(1);
    expect(stats.node_param).toBeGreaterThanOrEqual(2);
    expect(gotWorkflowEvent).toBe(true);
  });

  it('inserts data_file and supports queries', async () => {
    const ts = new Date().toISOString();
    await svc.insertDataFile({
      id: 'file_1', owner_name: 'alice', individual_name: 'Cell-01', test_type: 'eis',
      prefix: 'expA', cycle: 1, ts, filename: 'expA-001-xxx.dat', rel_path: 'alice/Cell-01/eis',
    });

    const { items, total } = await svc.queryDataFiles({ owner_name: 'alice', test_type: 'eis' });
    expect(total).toBeGreaterThan(0);
    expect(items[0].filename).toContain('expA');

    const recent = svc.getRecentEvents(10);
    expect(recent.find((e) => e.type === 'data_file_insert')).toBeTruthy();
  });

  it('queries workflows with filters', async () => {
    const res = await svc.queryWorkflows({ owner_name: 'alice', keyword: 'eis' });
    expect(res.total).toBeGreaterThan(0);
  });
});

