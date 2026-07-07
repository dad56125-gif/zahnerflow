import { contextBridge, ipcRenderer } from 'electron';

export interface DirectorySelectionResult {
  canceled: boolean;
  path?: string;
}

export interface ZahnerflowDesktopBridge {
  selectDirectory: () => Promise<DirectorySelectionResult>;
  getRuntimeBaseUrl: () => string;
  windowMinimize: () => void;
  windowToggleMaximize: () => void;
  windowClose: () => void;
  isMaximized: () => boolean;
  onMaximizedChanged: (callback: (maximized: boolean) => void) => () => void;
}

const desktopBridge: ZahnerflowDesktopBridge = {
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  getRuntimeBaseUrl: () => ipcRenderer.sendSync('runtime:get-base-url'),
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowToggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  windowClose: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.sendSync('window:is-maximized'),
  onMaximizedChanged: (callback: (maximized: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized);
    ipcRenderer.on('window:maximized-changed', handler);
    return () => ipcRenderer.removeListener('window:maximized-changed', handler);
  },
};

contextBridge.exposeInMainWorld('zahnerflowDesktop', desktopBridge);
