import { test, run } from './run-tests';
import { SamplingService } from '../src/modules/sampling/sampling.service';
import * as path from 'path';
import * as fs from 'fs';

class MockFurnaceDev { async status() { return { pv: 100, sv: 100, mv: 50, segment: 1, segmentTime: 10, segmentTimeSet: 60 }; } }
class MockMfcDev { async status() { return [ { address: 32, flowSccm: 10, flowPercent: 1, digitalSetpointPercent: 1, activeSetpointPercent: 1 } ]; } }
class MockMfcService {}

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

test('sampling tick writes memory and files; history query works', async () => {
  const base = path.join(process.cwd(), 'apps','backend','data','test','samples-1');
  rimrafSync(base);
  const svc = new SamplingService(new MockFurnaceDev() as any, new MockMfcDev() as any, new MockMfcService() as any, base);
  // call private tick via any for test purpose
  await (svc as any).tick();

  const from = new Date(Date.now() - 5_000).toISOString();
  const to = new Date(Date.now() + 5_000).toISOString();
  const furnace = await svc.queryFurnace(from, to, 1000, 1);
  if (!Array.isArray(furnace) || furnace.length < 1) throw new Error('no furnace samples');
  const mfc = await svc.queryMfc(32, from, to, 1000, 1);
  if (!Array.isArray(mfc) || mfc.length < 1) throw new Error('no mfc samples');
});

if (require.main === module) run();

