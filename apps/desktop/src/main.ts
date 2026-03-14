import path from 'node:path';

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { autoUpdater } from 'electron-updater';

import { APP_DISPLAY_NAME, type DesktopUpdateState } from '@glade/shared';
import { writeRotatingLogLine } from '@glade/shared/logging';

import {
  serverUrl,
  startServerProcess,
  stopServerProcess,
  type ServerProcessHandle,
  waitForServer,
} from './server-process';
import { defaultProjectPath, loadDesktopSettings } from './settings';
import { runSmokeScenario } from './smoke-runner';

let mainWindow: BrowserWindow | null = null;
let detachedTerminalWindow: BrowserWindow | null = null;
let backendProcess: ServerProcessHandle | null = null;
let updateState: DesktopUpdateState = {
  status: 'idle',
  version: null,
  message: null,
  progressPercent: null,
};
const runtimeLogTail: string[] = [];
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function shouldLogSmokeConsoleMessage(message: string) {
  return !(
    message.includes('Electron Security Warning') ||
    message.includes("Cannot read properties of undefined (reading 'dimensions')") ||
    message.includes('org.eclipse.elk.graph.json.JsonImportException')
  );
}

function appendRuntimeLog(line: string) {
  runtimeLogTail.push(line);
  while (runtimeLogTail.length > 160) {
    runtimeLogTail.shift();
  }

  if (app.isReady()) {
    void writeRotatingLogLine({
      directory: path.join(app.getPath('userData'), 'logs'),
      fileName: 'desktop-main.log',
      line,
    }).catch(() => undefined);
  }
}

function broadcastDetachedTerminalState(isDetached: boolean) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('glade:repl-detached-state', isDetached);
    }
  }
}

function broadcastUpdateState() {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('glade:update-state', updateState);
    }
  }
}

function setUpdateState(next: Partial<DesktopUpdateState>) {
  updateState = {
    ...updateState,
    ...next,
  };
  broadcastUpdateState();
}

async function configureAutoUpdater() {
  let updateChannel: 'stable' | 'beta' = 'stable';
  try {
    updateChannel = (await loadDesktopSettings(app.getPath('userData'))).updateChannel;
  } catch (error) {
    appendRuntimeLog(
      `[desktop] failed to load settings for auto-updater: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.channel = updateChannel === 'beta' ? 'beta' : 'latest';
  autoUpdater.allowDowngrade = updateChannel === 'beta';
}

function isAllowedExternalUrl(url: string) {
  try {
    return ALLOWED_EXTERNAL_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

autoUpdater.on('checking-for-update', () => {
  appendRuntimeLog('[updater] checking for updates');
  setUpdateState({
    status: 'checking',
    message: 'Checking GitHub Releases…',
    progressPercent: null,
  });
});

autoUpdater.on('update-available', (info) => {
  appendRuntimeLog(`[updater] update available ${info.version}`);
  setUpdateState({
    status: 'available',
    version: info.version,
    message: `Version ${info.version} is available.`,
  });
});

autoUpdater.on('update-not-available', () => {
  appendRuntimeLog('[updater] no update available');
  setUpdateState({
    status: 'not-available',
    message: 'You already have the latest release for this channel.',
    progressPercent: null,
  });
});

autoUpdater.on('download-progress', (progress) => {
  setUpdateState({
    status: 'downloading',
    message: `Downloading update… ${Math.round(progress.percent)}%`,
    progressPercent: progress.percent,
  });
});

autoUpdater.on('update-downloaded', (info) => {
  appendRuntimeLog(`[updater] update downloaded ${info.version}`);
  setUpdateState({
    status: 'downloaded',
    version: info.version,
    message: `Version ${info.version} is ready to install.`,
    progressPercent: 100,
  });
});

autoUpdater.on('error', (error) => {
  appendRuntimeLog(`[updater] ${error.message}`);
  setUpdateState({
    status: 'error',
    message: error.message,
  });
});

async function selectSingleFile() {
  try {
    const ownerWindow = BrowserWindow.getFocusedWindow() ?? mainWindow;
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, { properties: ['openFile'] })
      : await dialog.showOpenDialog({ properties: ['openFile'] });

    if (result.canceled) {
      return null;
    }

    return result.filePaths[0] ?? null;
  } catch (error) {
    appendRuntimeLog(`[desktop] file dialog failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function selectDirectory() {
  try {
    const ownerWindow = BrowserWindow.getFocusedWindow() ?? mainWindow;
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });

    if (result.canceled) {
      return null;
    }

    return result.filePaths[0] ?? null;
  } catch (error) {
    appendRuntimeLog(`[desktop] folder dialog failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function createDetachedTerminalWindow() {
  if (detachedTerminalWindow && !detachedTerminalWindow.isDestroyed()) {
    if (detachedTerminalWindow.isMinimized()) {
      detachedTerminalWindow.restore();
    }
    detachedTerminalWindow.focus();
    return true;
  }

  const window = new BrowserWindow({
    width: 980,
    height: 620,
    show: false,
    backgroundColor: '#08111b',
    title: `${APP_DISPLAY_NAME} Terminal`,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
    },
  });

  detachedTerminalWindow = window;
  window.on('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.on('closed', () => {
    detachedTerminalWindow = null;
    broadcastDetachedTerminalState(false);
  });

  await window.loadURL(`${serverUrl()}/?terminal=detached`);
  broadcastDetachedTerminalState(true);
  return true;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1200,
    height: 820,
    show: false,
    backgroundColor: '#08111b',
    title: APP_DISPLAY_NAME,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
    },
  });

  window.on('ready-to-show', () => {
    if (process.env.BAYESGROVE_ELECTRON_HEADLESS !== '1') {
      window.show();
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      if (target.origin === serverUrl() && target.searchParams.get('terminal') === 'detached') {
        void createDetachedTerminalWindow().catch((error) => {
          if (
            !(error instanceof Error) ||
            !error.message.includes("ERR_FAILED (-2) loading") ||
            !error.message.includes('/?terminal=detached')
          ) {
            appendRuntimeLog(`[desktop] failed to open detached terminal window: ${String(error)}`);
          }
        });
      } else if (isAllowedExternalUrl(url)) {
        void shell.openExternal(url).catch((error) => {
          appendRuntimeLog(`[desktop] failed to open external url: ${error instanceof Error ? error.message : String(error)}`);
        });
      } else {
        appendRuntimeLog(`[desktop] blocked external url with unsupported protocol: ${target.protocol}`);
      }
    } catch {
    }

    return { action: 'deny' };
  });
  window.on('closed', () => {
    mainWindow = null;
  });

  const smokeScenario = process.env.BAYESGROVE_SMOKE_SCENARIO?.trim();
  if (smokeScenario) {
    window.webContents.on('console-message', (_event, level, message) => {
      if (shouldLogSmokeConsoleMessage(message)) {
        console.log(`[renderer:${level}] ${message}`);
      }
    });
  }

  window.webContents.on('did-finish-load', () => {
    window.webContents.send('glade:update-state', updateState);
    if (smokeScenario) {
      void runSmokeScenario(window, smokeScenario)
        .then(() => app.quit())
        .catch((error) => {
          console.error(`[desktop] smoke scenario ${smokeScenario} failed`, error);
          process.exitCode = 1;
          app.quit();
        });
      return;
    }

    if (process.env.BAYESGROVE_SMOKE_TEST === '1') {
      setTimeout(() => app.quit(), 500).unref();
    }
  });

  void window.loadURL(serverUrl());
  return window;
}

function attachBackendLifecycle(handle: ServerProcessHandle) {
  handle.child.once('exit', (code, signal) => {
    if (backendProcess !== handle) {
      return;
    }

    appendRuntimeLog(`[desktop] embedded server exited (${code ?? 'null'}/${signal ?? 'null'})`);
  });
}

async function ensureServerProcess() {
  const stateDir = app.getPath('userData');

  await stopServerProcess(backendProcess);
  backendProcess = await startServerProcess({
    projectPath: defaultProjectPath(stateDir),
    stateDir,
    onLogLine: appendRuntimeLog,
  });
  attachBackendLifecycle(backendProcess);
  await waitForServer(backendProcess);
}

async function checkForUpdates() {
  if (!app.isPackaged) {
    setUpdateState({
      status: 'error',
      message: 'Auto-updates are available only in packaged builds.',
      progressPercent: null,
    });
    return updateState;
  }

  await configureAutoUpdater();
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendRuntimeLog(`[updater] check failed: ${message}`);
    setUpdateState({
      status: 'error',
      message,
      progressPercent: null,
    });
  }
  return updateState;
}

async function downloadUpdate() {
  if (!app.isPackaged) {
    setUpdateState({
      status: 'error',
      message: 'Auto-updates are available only in packaged builds.',
      progressPercent: null,
    });
    return updateState;
  }

  await configureAutoUpdater();
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendRuntimeLog(`[updater] download failed: ${message}`);
    setUpdateState({
      status: 'error',
      message,
      progressPercent: null,
    });
  }
  return updateState;
}

function installDownloadedUpdate() {
  if (updateState.status !== 'downloaded') {
    return false;
  }

  autoUpdater.quitAndInstall(false, true);
  return true;
}

function registerIpcHandlers() {
  ipcMain.handle('glade:select-file-path', selectSingleFile);
  ipcMain.handle('glade:select-directory-path', selectDirectory);
  ipcMain.handle('glade:select-executable-path', selectSingleFile);
  ipcMain.handle('glade:open-external', (_event, url: string) => {
    if (!isAllowedExternalUrl(url)) {
      appendRuntimeLog('[desktop] blocked open-external request with unsupported or invalid url');
      return false;
    }

    return shell.openExternal(url).then(() => true).catch((error) => {
      appendRuntimeLog(`[desktop] failed to open external url: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    });
  });
  ipcMain.handle('glade:get-update-state', () => updateState);
  ipcMain.handle('glade:check-for-updates', () => checkForUpdates());
  ipcMain.handle('glade:download-update', () => downloadUpdate());
  ipcMain.handle('glade:install-downloaded-update', () => installDownloadedUpdate());
  ipcMain.handle('glade:open-detached-terminal', () => createDetachedTerminalWindow());
}

function shutdown() {
  detachedTerminalWindow?.close();
  void stopServerProcess(backendProcess).catch((error) => {
    appendRuntimeLog(
      `[desktop] failed to stop server during shutdown: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
  backendProcess = null;
}

async function bootstrap() {
  await configureAutoUpdater();
  await ensureServerProcess();
  mainWindow = createWindow();

  if (app.isPackaged) {
    setTimeout(() => {
      void checkForUpdates().catch((error) => {
        appendRuntimeLog(`[updater] initial check failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, 3_000).unref();
  }
}

registerIpcHandlers();

app.on('before-quit', shutdown);
app.on('window-all-closed', () => {
  shutdown();
  app.quit();
});

app
  .whenReady()
  .then(() => bootstrap())
  .catch((error) => {
    console.error('[desktop] failed to start', error);
    dialog.showErrorBox(
      'Glade Failed to Start',
      `The desktop application could not be started.\n\n${error instanceof Error ? error.message : String(error)}\n\nLogs:\n${runtimeLogTail.slice(-15).join('\n')}`
    );
    shutdown();
    app.quit();
  });
