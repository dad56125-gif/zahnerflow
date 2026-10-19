import { ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { lstat } from 'node:fs/promises';
import { UpdateManager } from './updateManager.js';

export function registerUpdateIpc(manager: UpdateManager, getWindow: () => BrowserWindow | null): void {
  const trusted = (event: IpcMainInvokeEvent) => {
    const window = getWindow();
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('更新请求来源无效。');
  };
  ipcMain.handle('updates:get-state', event => { trusted(event); return manager.getState(); });
  ipcMain.handle('updates:check', event => { trusted(event); return manager.check(); });
  ipcMain.handle('updates:download', event => { trusted(event); return manager.download(); });
  ipcMain.handle('updates:cancel', event => { trusted(event); return manager.cancel(); });
  ipcMain.handle('updates:reveal-file', async event => {
    trusted(event);
    const state = manager.getState();
    if (state.status !== 'downloaded' || !state.filePath) throw new Error('尚无已校验完成的安装包。');
    const file = await lstat(state.filePath);
    if (!file.isFile() || file.isSymbolicLink()) throw new Error('安装包文件已不存在。');
    // Only select the file in Explorer/Finder. Never invoke the executable.
    shell.showItemInFolder(state.filePath);
  });
}
