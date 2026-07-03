export type SimulatorDevice = 'furnace' | 'mfc' | 'zahner';

export type FurnaceSimulatorProfile = 'normal' | 'timeout' | 'invalid-response' | 'disconnect';
export type MfcSimulatorProfile = 'normal' | 'timeout' | 'protocol-error' | 'scan-empty' | 'disconnect';
export type ZahnerSimulatorProfile = 'normal' | 'connect-fail' | 'measure-fail' | 'timeout' | 'disconnect';

export interface SimulatorSettings {
  enabled: boolean;
  devices: {
    furnace: { enabled: boolean; profile: FurnaceSimulatorProfile };
    mfc: { enabled: boolean; profile: MfcSimulatorProfile };
    zahner: { enabled: boolean; profile: ZahnerSimulatorProfile };
  };
}

export const SIMULATOR_SETTINGS_EVENT = 'zahnerflow:simulator-settings';

const STORAGE_KEY = 'zahnerflow.simulatorSettings';

export const DEFAULT_SIMULATOR_SETTINGS: SimulatorSettings = {
  enabled: false,
  devices: {
    furnace: { enabled: false, profile: 'normal' },
    mfc: { enabled: false, profile: 'normal' },
    zahner: { enabled: false, profile: 'normal' },
  },
};

const mergeSettings = (value: Partial<SimulatorSettings> | null): SimulatorSettings => ({
  enabled: Boolean(value?.enabled),
  devices: {
    furnace: {
      ...DEFAULT_SIMULATOR_SETTINGS.devices.furnace,
      ...(value?.devices?.furnace || {}),
    },
    mfc: {
      ...DEFAULT_SIMULATOR_SETTINGS.devices.mfc,
      ...(value?.devices?.mfc || {}),
    },
    zahner: {
      ...DEFAULT_SIMULATOR_SETTINGS.devices.zahner,
      ...(value?.devices?.zahner || {}),
    },
  },
});

export const loadSimulatorSettings = (): SimulatorSettings => {
  if (typeof window === 'undefined') return DEFAULT_SIMULATOR_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? mergeSettings(JSON.parse(raw)) : DEFAULT_SIMULATOR_SETTINGS;
  } catch {
    return DEFAULT_SIMULATOR_SETTINGS;
  }
};

export const saveSimulatorSettings = (settings: SimulatorSettings): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent(SIMULATOR_SETTINGS_EVENT, { detail: settings }));
};

export const isSimulatorDeviceEnabled = (device: SimulatorDevice, settings = loadSimulatorSettings()): boolean =>
  settings.enabled && settings.devices[device].enabled;

export const simulatorProfileFor = (device: SimulatorDevice, settings = loadSimulatorSettings()): string | undefined =>
  isSimulatorDeviceEnabled(device, settings) ? settings.devices[device].profile : undefined;

export const simulatorPortFor = (device: 'furnace' | 'mfc', selectedPort: string, settings = loadSimulatorSettings()): string =>
  isSimulatorDeviceEnabled(device, settings) ? 'COM_SIMULATOR' : selectedPort;

export const simulatorHostForZahner = (host: string | undefined, settings = loadSimulatorSettings()): string =>
  isSimulatorDeviceEnabled('zahner', settings) ? 'simulator' : (host || 'localhost');

export const hasActiveSimulator = (settings = loadSimulatorSettings()): boolean =>
  settings.enabled && Object.values(settings.devices).some((device) => device.enabled);
