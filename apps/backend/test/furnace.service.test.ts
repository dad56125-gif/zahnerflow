import { test, run } from './run-tests';
import * as fs from 'fs';
import * as path from 'path';

function rimrafSync(p: string) {
  if (fs.existsSync(p)) {
    for (const entry of fs.readdirSync(p)) {
      const full = path.join(p, entry);
      const stat = fs.lstatSync(full);
      if (stat.isDirectory()) rimrafSync(full); else fs.unlinkSync(full);
    }
    fs.rmdirSync(p);
  }
}
import { FurnaceService } from '../src/modules/furnace/furnace.service';

class MockFurnaceDevice {
  public segments: Array<{ id: number; temperature: number; time: number }> = [
    { id: 1, temperature: 25, time: 60 },
    { id: 2, temperature: 30, time: 60 },
  ];
  public failOnSet = false;
  async status() { return { pv: 25, sv: 25, mv: 0 } as any; }
  async connect(_: any) { return { ok: true }; }
  async disconnect() { return { ok: true }; }
  async run() { return { ok: true }; }
  async pause() { return { ok: true }; }
  async stop() { return { ok: true }; }
  async setSv(_: number) { return { ok: true }; }
  async setSegment(_: number) { return { ok: true }; }
  async getProgramSegments() { return this.segments; }
  async setProgramSegments(segments: any) {
    if (this.failOnSet) throw new Error('mock set fail');
    this.segments = segments;
    return { ok: true };
  }
}

test('preset create -> uniqueness and clone', async () => {
  const dir = path.join(process.cwd(), 'apps','backend','data','test','furnace-1');
  rimrafSync(dir);
  const svc = new FurnaceService(new MockFurnaceDevice() as any, dir);
  const p1 = await svc.createPreset('A', [ { id: 1, temperature: 100, time: 60 } ]);
  if (!p1 || p1.name !== 'A') throw new Error('create preset failed');
  await new Promise(res => setTimeout(res, 5100));
  let dupErrCaught = false;
  try { await svc.createPreset('A', [ { id: 1, temperature: 200, time: 60 } ]); } catch { dupErrCaught = true; }
  if (!dupErrCaught) throw new Error('duplicate name should conflict');
  await new Promise(res => setTimeout(res, 5100));
  const clone = await svc.clonePreset('A', 'B');
  if (clone.name !== 'B' || clone.segments.length !== 1) throw new Error('clone failed');
});

test('preset write rate limit (5s)', async () => {
  const dir = path.join(process.cwd(), 'apps','backend','data','test','furnace-2');
  rimrafSync(dir);
  const svc = new FurnaceService(new MockFurnaceDevice() as any, dir);
  await svc.createPreset('A', [ { id: 1, temperature: 100, time: 60 } ]);
  let rateLimited = false;
  try {
    await svc.updatePreset('A', [ { id: 1, temperature: 120, time: 60 } ]);
  } catch (e: any) {
    rateLimited = (e?.status === 429 || e?.response?.status === 429 || e?.statusCode === 429);
  }
  if (!rateLimited) throw new Error('should be rate limited within 5 seconds');
});

test('apply preset idempotent and rollback', async () => {
  const dev = new MockFurnaceDevice();
  const dir = path.join(process.cwd(), 'apps','backend','data','test','furnace-3');
  rimrafSync(dir);
  const svc = new FurnaceService(dev as any, dir);
  await svc.createPreset('A', dev.segments);
  await new Promise(res => setTimeout(res, 5100));
  const r0 = await svc.applyPreset('A');
  if (r0.changed !== false) throw new Error('expected idempotent (no change)');

  // change preset, but simulate device write failure to trigger rollback
  await new Promise(res => setTimeout(res, 5100)); // avoid rate-limit
  await svc.updatePreset('A', [ { id: 1, temperature: 200, time: 60 }, { id: 2, temperature: 300, time: 60 } ]);
  await new Promise(res => setTimeout(res, 5100)); // avoid rate-limit
  dev.failOnSet = true;
  let rolledBack = false;
  try {
    await svc.applyPreset('A');
  } catch {
    rolledBack = true;
  }
  if (!rolledBack) throw new Error('apply should fail and rollback');
  // ensure segments unchanged (rolled back to original)
  const after = await dev.getProgramSegments();
  if (after[0].temperature !== 25 || after[1].temperature !== 30) {
    throw new Error('rollback not applied on device mock');
  }
});

if (require.main === module) run();
