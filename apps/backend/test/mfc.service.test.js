"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const run_tests_1 = require("./run-tests");
const mfc_service_1 = require("../src/modules/mfc/mfc.service");
class MockMfcDevice {
    async scan(_) { return [{ address: 32, gasType: 'N2', maxFlowSccm: 1000 }, { address: 33, gasType: 'N2', maxFlowSccm: 500 }]; }
    async status(address) { return address != null ? { address, flowPercent: 0, flowSccm: 0, digitalSetpointPercent: 0, activeSetpointPercent: 0 } : []; }
    async setpoint(address, sccm) { return { address, sccm }; }
}
(0, run_tests_1.test)('mfc scan merges cache', async () => {
    const svc = new mfc_service_1.MfcService(new MockMfcDevice());
    const first = await svc.scan(32, 40);
    if (first.length !== 2)
        throw new Error('scan initial failed');
    const again = await svc.scan(32, 40);
    if (again.length !== 2)
        throw new Error('scan merge failed');
    const devices = svc.getDevices();
    if (!devices.find(d => d.address === 33))
        throw new Error('device not cached');
});
if (require.main === module)
    (0, run_tests_1.run)();
//# sourceMappingURL=mfc.service.test.js.map