import { beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DbService } from '../../../apps/backend/src/db/db.service';
import { DbController } from '../../../apps/backend/src/db/db.controller';

function tmpPath(name: string) {
  const p = path.join(process.cwd(), 'data', 'test');
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return path.join(p, name);
}

describe('DbController', () => {
  const dbFile = tmpPath('db.controller.test.json');
  let db: DbService;
  let ctrl: DbController;

  beforeAll(async () => {
    process.env.DB_JSON_PATH = dbFile;
    try { fs.unlinkSync(dbFile); } catch {}
    db = new DbService();
    await db.onModuleInit();
    ctrl = new DbController(db);

    // seed one workflow + one data file
    const wf: any = {
      id: 'wf_c1', name: 'CycleTest', description: 'for ctrl test', ownerName: 'bob', individualName: 'Cell-02',
      definition: { nodes: [{ id: 'n1', type: 'eis', name: 'EIS', config: { gain: 2 }, position: { x: 0, y: 0 } }], edges: [], version: 1 },
      version: 1, createdAt: new Date(), updatedAt: new Date(),
    };
    await db.upsertWorkflow(wf);
    await db.insertDataFile({ id: 'f_c1', owner_name: 'bob', individual_name: 'Cell-02', test_type: 'eis', prefix: 'expB', cycle: 2, ts: new Date().toISOString(), filename: 'expB-002-xxx.dat', rel_path: 'bob/Cell-02/eis' });
  });

  it('workflows query returns items', async () => {
    const res = await ctrl.queryWorkflows('bob', 'Cell-02', undefined, undefined, undefined, undefined, 'updated_at', 'desc', 1 as any, 10 as any);
    expect(res.items.length).toBeGreaterThan(0);
  });

  it('data-files query returns items', async () => {
    const res = await ctrl.queryDataFiles('bob', 'Cell-02', 'eis', undefined, undefined, 'expB', undefined, undefined, 'ts', 'desc', 1 as any, 10 as any);
    expect(res.items.length).toBeGreaterThan(0);
  });

  it('nodes and node-params queries work', async () => {
    const nodes = await ctrl.queryNodes('wf_c1', 'eis', undefined, 1 as any, 50 as any);
    expect(nodes.items.length).toBe(1);
    const np = await ctrl.queryNodeParams(nodes.items[0].id, 'gain', undefined, 1 as any, 100 as any);
    expect(np.total).toBeGreaterThan(0);
  });
});
