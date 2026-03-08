import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

import electronPath from 'electron';

const cwd = path.resolve(import.meta.dirname, '../../..');
const port = Number(process.env.BAYESGROVE_SERVER_PORT ?? 7943);
const entry = path.join(cwd, 'apps/desktop/dist-electron/main.cjs');
const scenario = process.argv[2]?.trim() || process.env.BAYESGROVE_SMOKE_SCENARIO?.trim() || '';
const stateDir = await mkdtemp(path.join(tmpdir(), 'glade-desktop-smoke-state-'));

async function waitFor(url, attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

const child = spawn(electronPath, [entry], {
  cwd,
  env: {
    ...process.env,
    BAYESGROVE_APP_ROOT: cwd,
    BAYESGROVE_STATE_DIR: stateDir,
    BAYESGROVE_SERVER_PORT: String(port),
    BAYESGROVE_SMOKE_TEST: '1',
    ...(scenario ? { BAYESGROVE_SMOKE_SCENARIO: scenario } : {}),
    BAYESGROVE_ELECTRON_HEADLESS: '1',
    NODE_ENV: 'production',
  },
  stdio: 'inherit',
});

try {
  await waitFor(`http://127.0.0.1:${port}/health`);
  await new Promise((resolve, reject) => {
    child.once('exit', (code) => {
      if (code && code !== 0) {
        reject(new Error(`Electron exited with code ${code}`));
        return;
      }
      resolve(undefined);
    });
  });
} finally {
  if (!child.killed) {
    child.kill('SIGTERM');
  }
}
