import { app, BrowserWindow, dialog, ipcMain, type Rectangle } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { appendFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const runtimePort = process.env.ZAHNERFLOW_RUNTIME_PORT || '3001';
const runtimeBaseUrl = `http://127.0.0.1:${runtimePort}`;
const frontendDevUrl = process.env.ZAHNERFLOW_FRONTEND_URL || 'http://127.0.0.1:8083';
const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let normalMainWindowBounds: Rectangle | null = null;
let backendProcess: ChildProcessWithoutNullStreams | null = null;
let appQuitting = false;

function writeHarnessLog(message: string): void {
  try {
    const logDir = app.isReady() ? app.getPath('userData') : process.cwd();
    mkdirSync(logDir, { recursive: true });
    appendFileSync(join(logDir, 'desktop-harness.log'), `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Logging must never keep the desktop app from starting.
  }
}

function repoRoot(): string {
  return resolve(__dirname, '..', '..', '..');
}

function packagedBackendCandidates(): string[] {
  const executableName = process.platform === 'win32' ? 'zahnerflow-backend.exe' : 'zahnerflow-backend';
  return [
    join(process.resourcesPath, 'python_backend', 'zahnerflow-backend', executableName),
    join(process.resourcesPath, 'python_backend', 'main', executableName),
    join(process.resourcesPath, 'python_backend', executableName),
  ];
}

function isExecutableFile(path: string): boolean {
  try {
    const stat = statSync(path);
    return stat.isFile();
  } catch {
    return false;
  }
}

function startBackend(): void {
  if (backendProcess) return;

  const backendDataDir = join(app.getPath('userData'), 'backend-data');
  const backendEnv = { ...process.env, PORT: runtimePort, ZAHNERFLOW_DATA_DIR: backendDataDir };
  mkdirSync(backendDataDir, { recursive: true });
  writeHarnessLog(`startBackend isDev=${isDev} resourcesPath=${process.resourcesPath} dataDir=${backendDataDir}`);

  if (isDev) {
    writeHarnessLog(`spawn dev backend cwd=${repoRoot()} command=uv run python apps/python_backend/main.py`);
    backendProcess = spawn('uv', ['run', 'python', 'apps/python_backend/main.py'], {
      cwd: repoRoot(),
      env: backendEnv,
    });
  } else {
    const candidates = packagedBackendCandidates();
    writeHarnessLog(`packaged backend candidates=${candidates.map((candidate) => `${candidate}:${isExecutableFile(candidate)}`).join(',')}`);
    const backendPath = candidates.find((candidate) => isExecutableFile(candidate));
    if (!backendPath) {
      writeHarnessLog('packaged backend not found');
      dialog.showErrorBox(
        'ZAHNERFLOW backend not found',
        'The packaged Python backend artifact is missing from app resources/python_backend.'
      );
      return;
    }

    writeHarnessLog(`spawn packaged backend cwd=${backendDataDir} command=${backendPath}`);
    backendProcess = spawn(backendPath, [], {
      cwd: backendDataDir,
      env: backendEnv,
    });
  }

  writeHarnessLog(`backend spawned pid=${backendProcess.pid ?? 'unknown'}`);
  backendProcess.stdout.on('data', (chunk) => {
    const message = `[backend stdout] ${String(chunk).trimEnd()}`;
    console.log(message);
    writeHarnessLog(message);
  });
  backendProcess.stderr.on('data', (chunk) => {
    const message = `[backend stderr] ${String(chunk).trimEnd()}`;
    console.error(message);
    writeHarnessLog(message);
  });
  backendProcess.on('exit', (code, signal) => {
    backendProcess = null;
    writeHarnessLog(`backend exit code=${code} signal=${signal}`);
    if (!appQuitting) {
      console.error(`ZAHNERFLOW backend exited with code=${code} signal=${signal}`);
    }
  });
  backendProcess.on('error', (error) => {
    backendProcess = null;
    writeHarnessLog(`backend spawn error=${error.stack || error.message}`);
    dialog.showErrorBox('Failed to start ZAHNERFLOW backend', error.message);
  });
}

function stopBackend(): void {
  if (!backendProcess) return;
  const processToStop = backendProcess;
  backendProcess = null;
  processToStop.kill();
}

async function waitForUrl(url: string, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // Keep polling until the development server is ready.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  return false;
}

function isMainWindowExpanded(): boolean {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return mainWindow.isFullScreen() || mainWindow.isMaximized();
}

function toggleMainWindowExpanded(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (isMainWindowExpanded()) {
    const restoreBounds = normalMainWindowBounds;

    if (mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    }
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    }
    if (restoreBounds) {
      mainWindow.setBounds(restoreBounds);
    }
    return;
  }

  normalMainWindowBounds = mainWindow.getBounds();
  mainWindow.maximize();
}

function wireWindowStateToMainWindow(): void {
  if (!mainWindow) return;

  const syncWindowState = () => {
    mainWindow?.webContents.send('window:maximized-changed', isMainWindowExpanded());
  };

  mainWindow.on('move', syncWindowState);
  mainWindow.on('resize', syncWindowState);
  mainWindow.on('show', () => {
    syncWindowState();
  });
  mainWindow.on('restore', () => {
    syncWindowState();
  });
  mainWindow.on('maximize', () => {
    syncWindowState();
  });
  mainWindow.on('unmaximize', () => {
    syncWindowState();
  });
  mainWindow.on('enter-full-screen', () => {
    syncWindowState();
  });
  mainWindow.on('leave-full-screen', () => {
    syncWindowState();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    frame: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  wireWindowStateToMainWindow();

  if (isDev) {
    await waitForUrl(frontendDevUrl, 30_000);
    await mainWindow.loadURL(frontendDevUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(join(process.resourcesPath, 'frontend', 'dist', 'index.html'));
  }
}

ipcMain.handle('dialog:select-directory', async () => {
  if (!mainWindow) return { canceled: true };

  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择数据存储路径',
    properties: ['openDirectory', 'createDirectory'],
  });

  return {
    canceled: result.canceled,
    path: result.canceled ? undefined : result.filePaths[0],
  };
});

ipcMain.on('runtime:get-base-url', (event) => {
  event.returnValue = runtimeBaseUrl;
});

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:toggle-maximize', () => toggleMainWindowExpanded());
ipcMain.on('window:close', () => mainWindow?.close());
ipcMain.on('window:is-maximized', (event) => {
  event.returnValue = isMainWindowExpanded();
});

app.on('before-quit', () => {
  appQuitting = true;
  stopBackend();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

void app.whenReady().then(async () => {
  writeHarnessLog('app ready');
  startBackend();
  await createWindow();
  writeHarnessLog('window created');
});
