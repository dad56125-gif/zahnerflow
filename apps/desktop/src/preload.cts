import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopUpdateBridge, DesktopUpdateState } from '@zahnerflow/types';

export interface DirectorySelectionResult {
  canceled: boolean;
  path?: string;
}

export interface ZahnerflowDesktopBridge {
  updates: DesktopUpdateBridge;
  selectDirectory: () => Promise<DirectorySelectionResult>;
  getRuntimeBaseUrl: () => string;
  windowMinimize: () => void;
  windowToggleMaximize: () => void;
  windowClose: () => void;
  isMaximized: () => boolean;
  onMaximizedChanged: (callback: (maximized: boolean) => void) => () => void;
}

const desktopBridge: ZahnerflowDesktopBridge = {
  updates: {
    getState: () => ipcRenderer.invoke('updates:get-state'),
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    cancel: () => ipcRenderer.invoke('updates:cancel'),
    revealFile: () => ipcRenderer.invoke('updates:reveal-file'),
    onStateChanged: (callback: (state: DesktopUpdateState) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: DesktopUpdateState) => callback(state);
      ipcRenderer.on('updates:state', handler);
      return () => ipcRenderer.removeListener('updates:state', handler);
    },
  },
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
