import { app, BrowserWindow, dialog, ipcMain, screen, type Rectangle } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const runtimePort = process.env.ZAHNERFLOW_RUNTIME_PORT || '3001';
const runtimeBaseUrl = `http://127.0.0.1:${runtimePort}`;
const frontendDevUrl = process.env.ZAHNERFLOW_FRONTEND_URL || 'http://127.0.0.1:8083';
const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let closeTabWindow: BrowserWindow | null = null;
let normalMainWindowBounds: Rectangle | null = null;
let closeTabTransitioning = false;
let closeTabAnimationTimer: ReturnType<typeof setInterval> | null = null;
let backendProcess: ChildProcessWithoutNullStreams | null = null;
let appQuitting = false;

const closeTabSize = { width: 116, height: 28 };
const closeTabOutsideHeight = 28;
const closeTabRightInset = 120;
const closeTabTopInset = 2;
const closeTabTransitionDurationMs = 180;
const windowBoundsTolerance = 3;

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

function closeTabHtml(): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html,
    body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: transparent;
      -webkit-app-region: no-drag;
    }

    .window-controls {
      position: absolute;
      inset: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 3px;
      padding: 2px 6px;
      border: 0;
      border-radius: 999px;
      overflow: hidden;
      background:
        radial-gradient(circle at 18% 0%, rgba(49, 94, 132, 0.34), transparent 44%),
        radial-gradient(circle at 100% 100%, rgba(97, 50, 130, 0.24), transparent 48%),
        linear-gradient(180deg, rgba(13, 24, 43, 0.94), rgba(9, 17, 31, 0.9));
      box-shadow:
        inset 0 1px 1px rgba(255, 255, 255, 0.26),
        inset 0 -1px 1px rgba(0, 0, 0, 0.18);
      -webkit-app-region: no-drag;
    }

    .window-controls.expanded {
      border-radius: 3px;
      justify-content: flex-end;
    }

    button {
      display: grid;
      width: 32px;
      height: 22px;
      place-items: center;
      justify-self: center;
      padding: 0;
      border: 0;
      border-radius: 999px;
      color: rgba(255, 255, 255, 0.94);
      background: transparent;
      cursor: pointer;
      -webkit-app-region: no-drag;
    }

    button:hover {
      background: rgba(255, 255, 255, 0.15);
    }

    button[data-action="close"]:hover {
      background: rgba(248, 113, 113, 0.62);
    }

    svg {
      display: block;
      width: 14px;
      height: 14px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  </style>
</head>
<body>
  <div class="window-controls" aria-label="窗口控制">
    <button type="button" data-action="minimize" aria-label="最小化窗口" title="最小化">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6 12H18" />
      </svg>
    </button>
    <button type="button" data-action="maximize" aria-label="最大化或还原窗口" title="最大化/还原">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M8 8H16V16H8Z" />
      </svg>
    </button>
    <button type="button" data-action="close" aria-label="关闭窗口" title="关闭">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 7L17 17M17 7L7 17" />
      </svg>
    </button>
  </div>
  <script>
    const controls = document.querySelector('.window-controls');
    function syncShape() {
      controls.classList.toggle('expanded', window.innerWidth > 220);
    }
    syncShape();
    window.addEventListener('resize', syncShape);

    document.querySelectorAll('button[data-action]').forEach(function (button) {
      button.addEventListener('click', function () {
        window.location.href = 'zahnerflow-window-control://' + button.dataset.action;
      });
    });
  </script>
</body>
</html>`;
}

function positionCloseTabWindow(): void {
  if (!mainWindow || !closeTabWindow || mainWindow.isDestroyed() || closeTabWindow.isDestroyed()) return;

  const targetBounds = closeTabTargetBounds();
  if (!targetBounds) return;
  closeTabWindow.setBounds(targetBounds);
}

function rectsNearlyEqual(a: Rectangle, b: Rectangle, tolerance = windowBoundsTolerance): boolean {
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  );
}

function mainWindowExpandedBounds(bounds: Rectangle): Rectangle {
  const workArea = screen.getDisplayMatching(bounds).workArea;
  return {
    x: workArea.x,
    y: workArea.y + closeTabOutsideHeight,
    width: workArea.width,
    height: workArea.height - closeTabOutsideHeight,
  };
}

function isMainWindowExpanded(): boolean {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isFullScreen() || mainWindow.isMaximized()) return true;
  const bounds = mainWindow.getBounds();
  return rectsNearlyEqual(bounds, mainWindowExpandedBounds(bounds));
}

function closeTabTargetBounds(forceExpanded?: boolean): Rectangle | null {
  if (!mainWindow || mainWindow.isDestroyed()) return null;

  const mainBounds = ensureCloseTabSpace();
  if (!mainBounds) return null;

  const isExpandedTab = forceExpanded ?? isMainWindowExpanded();
  const tabWidth = isExpandedTab ? mainBounds.width : closeTabSize.width;
  const tabX = isExpandedTab ? mainBounds.x : mainBounds.x + mainBounds.width - closeTabRightInset;
  const tabY = mainWindow.isFullScreen() ? mainBounds.y + closeTabTopInset : mainBounds.y - closeTabOutsideHeight + closeTabTopInset;

  return {
    x: tabX,
    y: tabY,
    width: tabWidth,
    height: closeTabSize.height,
  };
}

function animateCloseTabToTarget(forceExpanded: boolean): void {
  if (!closeTabWindow || closeTabWindow.isDestroyed()) return;

  if (closeTabAnimationTimer) {
    clearInterval(closeTabAnimationTimer);
    closeTabAnimationTimer = null;
  }

  const startBounds = closeTabWindow.getBounds();
  const startedAt = Date.now();
  closeTabTransitioning = true;
  closeTabWindow.showInactive();

  closeTabAnimationTimer = setInterval(() => {
    if (!closeTabWindow || closeTabWindow.isDestroyed()) {
      if (closeTabAnimationTimer) clearInterval(closeTabAnimationTimer);
      closeTabAnimationTimer = null;
      closeTabTransitioning = false;
      return;
    }

    const targetBounds = closeTabTargetBounds(forceExpanded);
    if (!targetBounds) return;

    const progress = Math.min((Date.now() - startedAt) / closeTabTransitionDurationMs, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    closeTabWindow.setBounds({
      x: Math.round(startBounds.x + (targetBounds.x - startBounds.x) * eased),
      y: Math.round(startBounds.y + (targetBounds.y - startBounds.y) * eased),
      width: Math.round(startBounds.width + (targetBounds.width - startBounds.width) * eased),
      height: Math.round(startBounds.height + (targetBounds.height - startBounds.height) * eased),
    });

    if (progress >= 1) {
      clearInterval(closeTabAnimationTimer!);
      closeTabAnimationTimer = null;
      closeTabTransitioning = false;
      closeTabWindow.setBounds(targetBounds);
    }
  }, 16);
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
    animateCloseTabToTarget(false);
    return;
  }

  normalMainWindowBounds = mainWindow.getBounds();
  mainWindow.maximize();
}

function ensureCloseTabSpace(): Rectangle | null {
  if (!mainWindow || mainWindow.isDestroyed()) return null;

  const bounds = mainWindow.getBounds();
  if (mainWindow.isFullScreen() || mainWindow.isMaximized()) return bounds;

  const display = screen.getDisplayMatching(bounds);
  const minimumMainWindowY = display.workArea.y + closeTabOutsideHeight;

  if (bounds.y >= minimumMainWindowY) return bounds;

  const [minimumWidth, minimumHeight] = mainWindow.getMinimumSize();
  const expandedBounds = mainWindowExpandedBounds(bounds);
  const shouldFillWorkAreaBelowTab = mainWindow.isMaximized() || rectsNearlyEqual(bounds, display.workArea);
  const blockedTopDelta = minimumMainWindowY - bounds.y;
  const adjustedBounds = {
    ...bounds,
    y: minimumMainWindowY,
    width: shouldFillWorkAreaBelowTab ? expandedBounds.width : Math.max(bounds.width, minimumWidth),
    height: shouldFillWorkAreaBelowTab ? expandedBounds.height : Math.max(bounds.height - blockedTopDelta, minimumHeight),
  };
  mainWindow.setBounds(adjustedBounds);
  return adjustedBounds;
}

async function createCloseTabWindow(): Promise<void> {
  if (!mainWindow || closeTabWindow) return;

  closeTabWindow = new BrowserWindow({
    parent: mainWindow,
    width: closeTabSize.width,
    height: closeTabSize.height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    acceptFirstMouse: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  closeTabWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('zahnerflow-window-control://')) return;
    event.preventDefault();
    if (!mainWindow || mainWindow.isDestroyed()) return;

    if (url.startsWith('zahnerflow-window-control://minimize')) {
      mainWindow.minimize();
      return;
    }

    if (url.startsWith('zahnerflow-window-control://maximize')) {
      toggleMainWindowExpanded();
      return;
    }

    if (url.startsWith('zahnerflow-window-control://close')) {
      mainWindow.close();
    }
  });

  closeTabWindow.on('closed', () => {
    closeTabWindow = null;
  });

  await closeTabWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(closeTabHtml())}`);
  positionCloseTabWindow();
  closeTabWindow.showInactive();
}

function wireCloseTabWindowToMainWindow(): void {
  if (!mainWindow) return;

  const syncCloseTabWindow = () => {
    if (closeTabTransitioning) return;
    const expanded = isMainWindowExpanded();
    mainWindow?.webContents.send('window:maximized-changed', expanded);
    if (expanded) {
      closeTabWindow?.hide();
    } else {
      positionCloseTabWindow();
      closeTabWindow?.showInactive();
    }
  };

  mainWindow.on('move', syncCloseTabWindow);
  mainWindow.on('resize', syncCloseTabWindow);
  mainWindow.on('show', () => {
    syncCloseTabWindow();
  });
  mainWindow.on('restore', () => {
    syncCloseTabWindow();
  });
  mainWindow.on('maximize', () => {
    syncCloseTabWindow();
  });
  mainWindow.on('unmaximize', () => {
    syncCloseTabWindow();
  });
  mainWindow.on('enter-full-screen', () => {
    syncCloseTabWindow();
  });
  mainWindow.on('leave-full-screen', () => {
    syncCloseTabWindow();
  });
  mainWindow.on('minimize', () => closeTabWindow?.hide());
  mainWindow.on('hide', () => closeTabWindow?.hide());
  mainWindow.on('closed', () => {
    if (closeTabWindow && !closeTabWindow.isDestroyed()) {
      closeTabWindow.close();
    }
    closeTabWindow = null;
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
    void createCloseTabWindow();
  });

  wireCloseTabWindowToMainWindow();

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
