export const DEVELOPER_MODE_STORAGE_KEY = 'zahnerflow.developerMode';
export const DEVELOPER_MODE_EVENT = 'zahnerflow:developer-mode';

export const readDeveloperMode = (): boolean => {
  try {
    return window.localStorage.getItem(DEVELOPER_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

export const writeDeveloperMode = (enabled: boolean): void => {
  try {
    if (enabled) {
      window.localStorage.setItem(DEVELOPER_MODE_STORAGE_KEY, 'true');
    } else {
      window.localStorage.removeItem(DEVELOPER_MODE_STORAGE_KEY);
    }
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
  window.dispatchEvent(new CustomEvent(DEVELOPER_MODE_EVENT, { detail: enabled }));
};
