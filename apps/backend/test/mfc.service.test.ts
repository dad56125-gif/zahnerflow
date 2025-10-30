import { test, run } from './run-tests';
import { MfcService } from '../src/modules/mfc/mfc.service';

class MockMfcDevice {
  async scan_devices(_: any) { return { devices: [ { address: 32, gas_type: 'N2', max_flow_sccm: 1000 }, { address: 33, gas_type: 'N2', max_flow_sccm: 500 } ] }; }
  async scan_single_address(address: number) { return { found: false }; }
  async get_device_status(address?: number) { return address != null ? { device_address: address, flow_percent: 0, flow_sccm: 0, digital_setpoint_percent: 0, active_setpoint_percent: 0 } : []; }
  async set_device_flow({ address, sccm }: { address: number; sccm: number }) { return { ok: true, address, sccm }; }
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
  handleFlowControl(fn: any, _: any) { return fn(); }
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
  sendMfcDeviceDiscovered(_: any) { return; }
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

test('setFlowRateControl success', async () => {
  const svc = new MfcService(
    new MockMfcDevice() as any,
    new MockDataService() as any,
    new MockErrorHandler() as any,
    new MockGateway() as any
  );

  // 手动设置连接状态和设备状态
  (svc as any).connection_state = 'connected';
  (svc as any).device_statuses = new Map([
    [1, {
      address: 1,
      connection_status: 'connected',
      last_communication: new Date().toISOString(),
      gas_type: 'N2',
      max_flow_sccm: 200,
      flow_sccm: 25.5,
      setpoint_sccm: 50.0
    }]
  ]);
  (svc as any).polling_status = { is_running: false };
  (svc as any).polling_subscribers = new Set();

  const result = await svc.setFlowRateControl({
    device_address: 1,
    gas_type: 'N2',
    target_flow_rate: 100.0,
    stabilization_time: 5
  }, 'test-node-1', 'test-execution-1');

  if (!result.success) throw new Error('Expected success but got failure');
  if (result.updated_parameters.device_address !== 1) throw new Error('Wrong device address');
  if (result.updated_parameters.gas_type !== 'N2') throw new Error('Wrong gas type');
  if (result.updated_parameters.target_flow_rate !== 100.0) throw new Error('Wrong target flow rate');
  if (result.updated_parameters.current_flow_rate !== 0) throw new Error('Wrong current flow rate');
  if (result.updated_parameters.max_flow_sccm !== 200) throw new Error('Wrong max flow');
  if (result.updated_parameters.stabilization_time !== 5) throw new Error('Wrong stabilization time');
});

test('setFlowRateControl device not connected', async () => {
  const svc = new MfcService(
    new MockMfcDevice() as any,
    new MockDataService() as any,
    new MockErrorHandler() as any,
    new MockGateway() as any
  );

  // 设置设备为未连接状态
  (svc as any).connection_state = 'disconnected';

  const result = await svc.setFlowRateControl({
    device_address: 1,
    gas_type: 'N2',
    target_flow_rate: 100.0
  }, 'test-node-1', 'test-execution-1');

  if (result.success) throw new Error('Expected failure but got success');
  if (!result.error?.includes('MFC设备未连接')) throw new Error('Wrong error message');
});

test('setFlowRateControl device not found', async () => {
  const svc = new MfcService(
    new MockMfcDevice() as any,
    new MockDataService() as any,
    new MockErrorHandler() as any,
    new MockGateway() as any
  );

  // 设置连接状态但没有设备
  (svc as any).connection_state = 'connected';
  (svc as any).device_statuses = new Map();

  const result = await svc.setFlowRateControl({
    device_address: 999,
    gas_type: 'N2',
    target_flow_rate: 100.0
  }, 'test-node-1', 'test-execution-1');

  if (result.success) throw new Error('Expected failure but got success');
  if (!result.error?.includes('设备地址 999 未找到')) throw new Error('Wrong error message');
});

test('setFlowRateControl negative flow rate', async () => {
  const svc = new MfcService(
    new MockMfcDevice() as any,
    new MockDataService() as any,
    new MockErrorHandler() as any,
    new MockGateway() as any
  );

  (svc as any).connection_state = 'connected';
  (svc as any).device_statuses = new Map([
    [1, {
      address: 1,
      connection_status: 'connected',
      last_communication: new Date().toISOString(),
      gas_type: 'N2',
      max_flow_sccm: 200,
      flow_sccm: 25.5,
      setpoint_sccm: 50.0
    }]
  ]);

  const result = await svc.setFlowRateControl({
    device_address: 1,
    gas_type: 'N2',
    target_flow_rate: -10.0
  }, 'test-node-1', 'test-execution-1');

  if (result.success) throw new Error('Expected failure but got success');
  if (!result.error?.includes('目标流量不能为负数')) throw new Error('Wrong error message');
});

test('setFlowRateControl flow rate exceeds max', async () => {
  const svc = new MfcService(
    new MockMfcDevice() as any,
    new MockDataService() as any,
    new MockErrorHandler() as any,
    new MockGateway() as any
  );

  (svc as any).connection_state = 'connected';
  (svc as any).device_statuses = new Map([
    [1, {
      address: 1,
      connection_status: 'connected',
      last_communication: new Date().toISOString(),
      gas_type: 'N2',
      max_flow_sccm: 200,
      flow_sccm: 25.5,
      setpoint_sccm: 50.0
    }]
  ]);

  const result = await svc.setFlowRateControl({
    device_address: 1,
    gas_type: 'N2',
    target_flow_rate: 300.0
  }, 'test-node-1', 'test-execution-1');

  if (result.success) throw new Error('Expected failure but got success');
  if (!result.error?.includes('目标流量超出设备最大限制')) throw new Error('Wrong error message');
});

if (require.main === module) run();

