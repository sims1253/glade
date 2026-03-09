import path from 'node:path';

import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';

import {
  APP_DISPLAY_NAME,
  type DesktopPreflightState,
  type DesktopRuntimeSnapshot,
  type DesktopSettings,
  type DesktopUpdateState,
} from '@glade/shared';

import { runDesktopPreflight } from './preflight';
import {
  serverUrl,
  startServerProcess,
  stopServerProcess,
  type ServerProcessHandle,
  waitForServer,
} from './server-process';
import {
  DEFAULT_DESKTOP_SETTINGS,
  defaultProjectPath,
  loadDesktopSettings,
  normalizeDesktopSettings,
  resetDesktopSettings,
  saveDesktopSettings,
} from './settings';
import { runSmokeScenario } from './smoke-runner';

let mainWindow: BrowserWindow | null = null;
let detachedTerminalWindow: BrowserWindow | null = null;
let backendProcess: ServerProcessHandle | null = null;
let isQuitting = false;
let desktopSettings: DesktopSettings = DEFAULT_DESKTOP_SETTINGS;
let desktopPreflight: DesktopPreflightState = {
  checkedAt: new Date(0).toISOString(),
  projectPath: '',
  status: 'action_required',
  issues: [],
};
let projectPath = '';
let updateState: DesktopUpdateState = {
  channel: DEFAULT_DESKTOP_SETTINGS.updateChannel,
  status: 'idle',
  version: null,
  message: null,
  progressPercent: null,
};
const runtimeLogTail: string[] = [];
let desktopStateBroadcastTimer: NodeJS.Timeout | null = null;

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
}

function desktopSnapshot(): DesktopRuntimeSnapshot {
  return {
    settings: desktopSettings,
    preflight: desktopPreflight,
    update: updateState,
    logTail: runtimeLogTail,
  };
}

function broadcastDetachedTerminalState(isDetached: boolean) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('glade:repl-detached-state', isDetached);
    }
  }
}

function broadcastDesktopState() {
  if (desktopStateBroadcastTimer) {
    clearTimeout(desktopStateBroadcastTimer);
    desktopStateBroadcastTimer = null;
  }
  const snapshot = desktopSnapshot();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('glade:desktop-state', snapshot);
    }
  }
}

function scheduleDesktopStateBroadcast(delayMs = 100) {
  if (desktopStateBroadcastTimer) {
    return;
  }

  desktopStateBroadcastTimer = setTimeout(() => {
    desktopStateBroadcastTimer = null;
    broadcastDesktopState();
  }, delayMs);
  desktopStateBroadcastTimer.unref?.();
}

function setUpdateState(next: Partial<DesktopUpdateState>) {
  updateState = {
    ...updateState,
    ...next,
    channel: desktopSettings.updateChannel,
  };
  broadcastDesktopState();
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.channel = desktopSettings.updateChannel === 'beta' ? 'beta' : 'latest';
  autoUpdater.allowDowngrade = desktopSettings.updateChannel === 'beta';
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
      }
    } catch {
    }

    return { action: 'deny' };
  });
  window.on('closed', () => {
    mainWindow = null;
  });

  window.webContents.on('did-finish-load', () => {
    window.webContents.send('glade:desktop-state', desktopSnapshot());
    const smokeScenario = process.env.BAYESGROVE_SMOKE_SCENARIO?.trim();
    if (smokeScenario) {
      window.webContents.on('console-message', (_event) => {
        const { level, message } = _event;
        if (shouldLogSmokeConsoleMessage(message)) {
          console.log(`[renderer:${level}] ${message}`);
        }
      });
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
    if (!isQuitting) {
      broadcastDesktopState();
    }
  });
}

async function refreshDesktopState() {
  projectPath = process.env.BAYESGROVE_PROJECT_PATH?.trim() || defaultProjectPath(app.getPath('userData'));
  desktopPreflight = runDesktopPreflight(desktopSettings, projectPath);
  updateState = {
    ...updateState,
    channel: desktopSettings.updateChannel,
  };
  broadcastDesktopState();

  await stopServerProcess(backendProcess);
  backendProcess = await startServerProcess({
    projectPath,
    settings: desktopSettings,
    onLogLine: (line) => {
      appendRuntimeLog(line);
      scheduleDesktopStateBroadcast();
    },
  });
  attachBackendLifecycle(backendProcess);
  await waitForServer(backendProcess);
  broadcastDesktopState();
  return desktopSnapshot();
}

async function checkForUpdates() {
  if (!app.isPackaged) {
    setUpdateState({
      status: 'error',
      message: 'Auto-updates are available only in packaged builds.',
      progressPercent: null,
    });
    return desktopSnapshot();
  }

  configureAutoUpdater();
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
  return desktopSnapshot();
}

async function downloadUpdate() {
  if (!app.isPackaged) {
    setUpdateState({
      status: 'error',
      message: 'Auto-updates are available only in packaged builds.',
      progressPercent: null,
    });
    return desktopSnapshot();
  }

  configureAutoUpdater();
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
  return desktopSnapshot();
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
  ipcMain.handle('glade:select-executable-path', selectSingleFile);
  ipcMain.handle('glade:get-desktop-state', () => desktopSnapshot());
  ipcMain.handle('glade:refresh-desktop-state', () => refreshDesktopState());
  ipcMain.handle('glade:save-desktop-settings', async (_event, nextSettings: unknown) => {
    desktopSettings = await saveDesktopSettings(app.getPath('userData'), normalizeDesktopSettings(nextSettings));
    configureAutoUpdater();
    return refreshDesktopState();
  });
  ipcMain.handle('glade:reset-desktop-settings', async () => {
    desktopSettings = await resetDesktopSettings(app.getPath('userData'));
    configureAutoUpdater();
    return refreshDesktopState();
  });
  ipcMain.handle('glade:check-for-updates', () => checkForUpdates());
  ipcMain.handle('glade:download-update', () => downloadUpdate());
  ipcMain.handle('glade:install-downloaded-update', () => installDownloadedUpdate());
  ipcMain.handle('glade:open-detached-terminal', () => createDetachedTerminalWindow());
}

function shutdown() {
  isQuitting = true;
  if (desktopStateBroadcastTimer) {
    clearTimeout(desktopStateBroadcastTimer);
    desktopStateBroadcastTimer = null;
  }
  detachedTerminalWindow?.close();
  void stopServerProcess(backendProcess).catch((error) => {
    appendRuntimeLog(
      `[desktop] failed to stop server during shutdown: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
  backendProcess = null;
}

async function bootstrap() {
  desktopSettings = await loadDesktopSettings(app.getPath('userData'));
  configureAutoUpdater();
  await refreshDesktopState();
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
