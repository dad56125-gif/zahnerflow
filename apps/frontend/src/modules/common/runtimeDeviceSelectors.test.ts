import { describe, expect, it } from 'vitest';

import { isFurnaceReady, isMfcReady } from './runtimeDeviceSelectors';

describe('runtime device readiness selectors', () => {
  it('requires both the Furnace connection and a hydrated status payload', () => {
    expect(isFurnaceReady({ connection_status: 'connected', device_status: null })).toBe(false);
    expect(isFurnaceReady({ connection_status: 'connected', device_status: { pv: 25 } })).toBe(true);
  });

  it('requires a connected MFC runtime with discovered devices', () => {
    expect(isMfcReady({ connection_status: 'connected', devices: [] })).toBe(false);
    expect(isMfcReady({ connection_status: 'connected', devices: [{ address: 32 }] })).toBe(true);
  });
});
