import { useSyncExternalStore } from 'react';
import { DEVELOPER_MODE_EVENT, readDeveloperMode } from './developerMode';

function subscribe(listener: () => void) {
  window.addEventListener(DEVELOPER_MODE_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(DEVELOPER_MODE_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export const useDeveloperMode = () => useSyncExternalStore(subscribe, readDeveloperMode);
