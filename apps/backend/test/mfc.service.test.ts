import { test, run } from './run-tests';
import { MfcService } from '../src/modules/mfc/mfc.service';

class MockMfcDevice {
  async scan(_: any) { return [ { address: 32, gasType: 'N2', maxFlowSccm: 1000 }, { address: 33, gasType: 'N2', maxFlowSccm: 500 } ]; }
  async status(address?: number) { return address != null ? { address, flowPercent: 0, flowSccm: 0, digitalSetpointPercent: 0, activeSetpointPercent: 0 } : []; }
  async setpoint(address: number, sccm: number) { return { address, sccm }; }
}

test('mfc scan merges cache', async () => {
  const svc = new MfcService(new MockMfcDevice() as any);
  const first = await svc.scan(32, 40);
  if (first.length !== 2) throw new Error('scan initial failed');
  const again = await svc.scan(32, 40);
  if (again.length !== 2) throw new Error('scan merge failed');
  const devices = svc.getDevices();
  if (!devices.find(d => d.address === 33)) throw new Error('device not cached');
});

if (require.main === module) run();

