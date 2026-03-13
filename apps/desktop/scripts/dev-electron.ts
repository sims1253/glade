import type { ChildProcess } from 'node:child_process';
import { watch, type FSWatcher } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { spawnChildProcess, terminateProcessTree, type ManagedProcessLike } from '@glade/shared/process';

const desktopDir = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(desktopDir, 'dist-electron');
const requiredFiles = ['main.cjs', 'preload.cjs', 'server-process.cjs'];
const forcedShutdownTimeoutMs = 1_500;
const restartDebounceMs = 120;
const devServerUrl = process.env.VITE_DEV_SERVER_URL?.trim() || `http://localhost:${process.env.PORT ?? 5173}`;

const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;

let shuttingDown = false;
let restartTimer: NodeJS.Timeout | null = null;
let currentApp: ChildProcess | null = null;
let restartQueue = Promise.resolve();
const expectedExits = new WeakSet<ChildProcess>();
const watchers: FSWatcher[] = [];

function resolveElectronCommand() {
  return process.platform === 'win32' ? 'electron.cmd' : 'electron';
}

async function waitForRequiredFiles() {
  while (true) {
    const ready = await Promise.all(
      requiredFiles.map(async (fileName) => {
        try {
          await access(path.join(distDir, fileName));
          return true;
        } catch {
          return false;
        }
      }),
    );

    if (ready.every(Boolean)) {
      return;
    }

    await sleep(100);
  }
}

function startApp() {
  if (shuttingDown || currentApp) {
    return;
  }

  const app = spawnChildProcess({
    command: resolveElectronCommand(),
    args: ['./dist-electron/main.cjs'],
    cwd: desktopDir,
    env: {
      ...childEnv,
      VITE_DEV_SERVER_URL: devServerUrl,
    },
    stdio: 'inherit',
    shell: process.platform === 'win32',
    detached: process.platform !== 'win32',
  });

  currentApp = app;

  app.once('error', () => {
    if (currentApp === app) {
      currentApp = null;
    }

    if (!shuttingDown) {
      scheduleRestart();
    }
  });

  app.once('exit', (code, signal) => {
    if (currentApp === app) {
      currentApp = null;
    }

    if (!shuttingDown && !expectedExits.has(app) && (code !== 0 || signal !== null)) {
      scheduleRestart();
    }
  });
}

async function stopApp() {
  const app = currentApp;
  if (!app) {
    return;
  }

  currentApp = null;
  expectedExits.add(app);

  await new Promise<void>((resolve) => {
    void terminateProcessTree(app as ManagedProcessLike, { gracePeriodMs: forcedShutdownTimeoutMs }).finally(resolve);
  });
}

function scheduleRestart() {
  if (shuttingDown) {
    return;
  }

  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(() => {
    restartTimer = null;
    restartQueue = restartQueue
      .catch(() => undefined)
      .then(async () => {
        await waitForRequiredFiles();
        await sleep(100);
        await stopApp();
        if (!shuttingDown) {
          startApp();
        }
      });
  }, restartDebounceMs);
}

function startWatchers() {
  const watcher = watch(distDir, { persistent: true }, (_eventType, filename) => {
    if (typeof filename !== 'string' || !filename.endsWith('.cjs')) {
      return;
    }

    scheduleRestart();
  });

  watchers.push(watcher);
}

async function shutdown(exitCode: number) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  for (const watcher of watchers) {
    watcher.close();
  }

  await stopApp();

  process.exit(exitCode);
}

await waitForRequiredFiles();
startWatchers();
startApp();

process.once('SIGINT', () => {
  void shutdown(130);
});
process.once('SIGTERM', () => {
  void shutdown(143);
});
process.once('SIGHUP', () => {
  void shutdown(129);
});
