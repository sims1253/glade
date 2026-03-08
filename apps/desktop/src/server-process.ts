import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import * as Effect from 'effect/Effect';
import * as Schedule from 'effect/Schedule';

import { DEFAULT_SERVER_PORT } from '@glade/shared';

function appRoot() {
  return process.env.BAYESGROVE_APP_ROOT?.trim() || path.resolve(__dirname, '../../..');
}

function serverEntry() {
  const root = appRoot();
  const useSourceEntry = process.env.NODE_ENV === 'development' || process.env.BAYESGROVE_SMOKE_TEST === '1';
  return useSourceEntry
    ? path.join(root, 'apps/server/src/index.ts')
    : path.join(root, 'apps/server/dist/index.mjs');
}

export function serverPort() {
  return Number(process.env.BAYESGROVE_SERVER_PORT ?? DEFAULT_SERVER_PORT);
}

export function serverUrl() {
  return `http://127.0.0.1:${serverPort()}`;
}

export function startServerProcess(): ChildProcess {
  return spawn('bun', ['run', serverEntry()], {
    cwd: appRoot(),
    env: {
      ...process.env,
      BAYESGROVE_APP_ROOT: appRoot(),
      BAYESGROVE_RUNTIME: 'desktop',
      BAYESGROVE_SERVER_PORT: String(serverPort()),
      NODE_ENV: process.env.NODE_ENV ?? 'production',
    },
    detached: process.platform !== 'win32',
    stdio: 'inherit',
  });
}

export function stopServerProcess(child: ChildProcess | null) {
  if (!child || child.killed || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM');
      setTimeout(() => {
        try {
          process.kill(-child.pid!, 'SIGKILL');
        } catch {
        }
      }, 2_000).unref();
      return;
    } catch {
    }
  }

  child.kill('SIGTERM');
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
  }, 2_000).unref();
}

export async function waitForServer() {
  await Effect.runPromise(
    Effect.tryPromise(() => fetch(`${serverUrl()}/health`)).pipe(
      Effect.filterOrFail((response) => response.ok, () => new Error('Server is not ready yet.')),
      Effect.retry(Schedule.spaced('250 millis')),
    ),
  );
  await sleep(100);
}
