import { contextBridge, ipcRenderer } from 'electron';

export interface DirectorySelectionResult {
  canceled: boolean;
  path?: string;
}

export interface ZahnerflowDesktopBridge {
  selectDirectory: () => Promise<DirectorySelectionResult>;
  getRuntimeBaseUrl: () => string;
}

const desktopBridge: ZahnerflowDesktopBridge = {
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  getRuntimeBaseUrl: () => ipcRenderer.sendSync('runtime:get-base-url'),
};

contextBridge.exposeInMainWorld('zahnerflowDesktop', desktopBridge);
