import type { DeviceConnectionStatus } from '@zahnerflow/types';

type FurnaceRuntimeState = {
  connection_status: DeviceConnectionStatus;
  device_status: unknown | null;
};

type MfcRuntimeState = {
  connection_status: DeviceConnectionStatus;
  devices: unknown[];
};

export const isFurnaceReady = (state: FurnaceRuntimeState): boolean => (
  state.connection_status === 'connected' && state.device_status !== null
);

export const isMfcReady = (state: MfcRuntimeState): boolean => (
  state.connection_status === 'connected' && state.devices.length > 0
);

export const isDeviceConnected = (status: DeviceConnectionStatus): boolean => status === 'connected';
