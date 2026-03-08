import path from 'node:path';

import { app, BrowserWindow, dialog, ipcMain } from 'electron';

import { APP_DISPLAY_NAME } from '@glade/shared';

import {
  serverPort,
  serverUrl,
  startServerProcess,
  stopServerProcess,
  waitForServer,
} from './server-process';
import { runSmokeScenario } from './smoke-runner';

let mainWindow: BrowserWindow | null = null;
let backendProcess = startServerProcess();
let isQuitting = false;

ipcMain.handle('glade:select-file-path', async () => {
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
    console.error('[desktop] file dialog failed', error);
    return null;
  }
});

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

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.on('closed', () => {
    mainWindow = null;
  });

  window.webContents.on('did-finish-load', () => {
    const smokeScenario = process.env.BAYESGROVE_SMOKE_SCENARIO?.trim();
    if (smokeScenario) {
      window.webContents.on('console-message', (_event, level, message) => {
        console.log(`[renderer:${level}] ${message}`);
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

async function bootstrap() {
  await waitForServer();
  mainWindow = createWindow();
}

function shutdown() {
  isQuitting = true;
  stopServerProcess(backendProcess);
}

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
    shutdown();
    app.quit();
  });

backendProcess.on('exit', () => {
  if (!isQuitting) {
    mainWindow?.webContents.executeJavaScript(`console.error('Server on port ${serverPort()} exited unexpectedly.')`);
  }
});
