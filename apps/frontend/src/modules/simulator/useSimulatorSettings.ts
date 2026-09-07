import { useEffect, useState } from 'react';
import { loadSimulatorSettings, SIMULATOR_SETTINGS_EVENT } from './simulatorSettings';

export function useSimulatorSettings() {
  const [settings, setSettings] = useState(loadSimulatorSettings);
  useEffect(() => {
    const refresh = () => setSettings(loadSimulatorSettings());
    window.addEventListener(SIMULATOR_SETTINGS_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(SIMULATOR_SETTINGS_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return settings;
}
