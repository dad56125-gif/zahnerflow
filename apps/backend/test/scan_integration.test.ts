import { test, run } from './run-tests';
import { MfcService } from '../src/modules/mfc/mfc.service';

class MockMfcDevice {
  async scan_devices(params: any) {
    return {
      devices: [
        { address: 32, gas_type: 'N2', max_flow_sccm: 1000 },
        { address: 35, gas_type: 'O2', max_flow_sccm: 500 }
      ]
    };
  }
  async get_device_status(address?: number) {
    return address != null ?
      { address, flow_percent: 50, flow_sccm: 250, digital_setpoint_percent: 25, active_setpoint_percent: 25 } :
      [
        { address: 32, flow_percent: 50, flow_sccm: 500, digital_setpoint_percent: 50, active_setpoint_percent: 50 },
        { address: 35, flow_percent: 25, flow_sccm: 125, digital_setpoint_percent: 25, active_setpoint_percent: 25 }
      ];
  }
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

test('scan integration test - FastAPI interface', async () => {
  const svc = new MfcService(
    new MockMfcDevice() as any,
    new MockDataService() as any,
    new MockErrorHandler() as any,
    new MockGateway() as any
  );

  // Test scan method uses FastAPI scan_devices interface
  const devices = await svc.scan(32, 40);

  // Verify we got the expected devices from FastAPI response
  if (devices.length !== 2) throw new Error(`Expected 2 devices, got ${devices.length}`);

  // Verify device addresses match
  const device32 = devices.find(d => d.address === 32);
  const device35 = devices.find(d => d.address === 35);

  if (!device32) throw new Error('Device with address 32 not found');
  if (!device35) throw new Error('Device with address 35 not found');

  // Verify device properties
  if (device32.gas_type !== 'N2') throw new Error('Device 32 gas type incorrect');
  if (device32.max_flow_sccm !== 1000) throw new Error('Device 32 max flow incorrect');
  if (device35.gas_type !== 'O2') throw new Error('Device 35 gas type incorrect');
  if (device35.max_flow_sccm !== 500) throw new Error('Device 35 max flow incorrect');

  console.log('✓ Scan interface integration test passed');
});

test('status method unchanged', async () => {
  const svc = new MfcService(
    new MockMfcDevice() as any,
    new MockDataService() as any,
    new MockErrorHandler() as any,
    new MockGateway() as any
  );

  // Test that status method still works as before
  const status = await svc.status(32);

  if (!status || status.address !== 32) throw new Error('Status method not working correctly');
  if (status.flow_sccm !== 250) throw new Error('Status flow data incorrect');

  console.log('✓ Status method unchanged test passed');
});

if (require.main === module) run();