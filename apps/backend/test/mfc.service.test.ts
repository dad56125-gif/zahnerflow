import { test, run } from './run-tests';
import { MfcService } from '../src/modules/mfc/mfc.service';

class MockMfcDevice {
  async scan_devices(_: any) { return { devices: [ { address: 32, gas_type: 'N2', max_flow_sccm: 1000 }, { address: 33, gas_type: 'N2', max_flow_sccm: 500 } ] }; }
  async get_device_status(address?: number) { return address != null ? { address, flow_percent: 0, flow_sccm: 0, digital_setpoint_percent: 0, active_setpoint_percent: 0 } : []; }
  async set_device_flow({ address, sccm }: { address: number; sccm: number }) { return { address, sccm }; }
  async health() { return { status: 'ok' }; }
  async connect_device() { return { ok: true, connection_id: 'test-connection' }; }
  async disconnect_device() { return { ok: true }; }
  async get_connection_info() { return { connection_id: 'test-connection' }; }
  async get_communication_log() { return { log: [] }; }
  async clear_communication_log() { return { ok: true }; }
}

class MockDataService {
  async addFlowSample(_: any) { return; }
  async clearCommunicationLog() { return; }
  async queryFlowHistory(_: any) { return []; }
  async getSystemOverview() { return { total_devices: 0, active_devices: 0 }; }
}

class MockErrorHandler {
  handleDeviceScan(fn: any, _: any) { return fn(); }
  handleError(_: any, __: any, ___: any) { return; }
  checkCircuitBreaker(_: any) { return { allowed: true }; }
  recordCircuitBreakerSuccess(_: any) { return; }
  recordCircuitBreakerFailure(_: any) { return; }
}

class MockGateway {
  sendMfcConnectionUpdate(_: any) { return; }
  broadcastFlowSetpointChange(_: any, __: any, ___: any) { return; }
  sendMfcStatusUpdate(_: any) { return; }
  sendMfcSamplingData(_: any) { return; }
  broadcastSystemStatus(_: any) { return; }
}

test('mfc scan merges cache', async () => {
  const svc = new MfcService(
    new MockMfcDevice() as any,
    new MockDataService() as any,
    new MockErrorHandler() as any,
    new MockGateway() as any
  );
  const first = await svc.scan(32, 40);
  if (first.length !== 2) throw new Error('scan initial failed');
  const again = await svc.scan(32, 40);
  if (again.length !== 2) throw new Error('scan merge failed');
  const devices = svc.getDevices();
  if (!devices.find(d => d.address === 33)) throw new Error('device not cached');
});

if (require.main === module) run();

