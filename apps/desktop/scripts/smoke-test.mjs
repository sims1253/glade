import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

import electronPath from 'electron';
import { terminateProcessTree } from '@glade/shared/process';

const cwd = path.resolve(import.meta.dirname, '../../..');
const port = Number(process.env.BAYESGROVE_SERVER_PORT ?? 7943);
const entry = path.join(cwd, 'apps/desktop/dist-electron/main.cjs');
const scenario = process.argv[2]?.trim() || process.env.BAYESGROVE_SMOKE_SCENARIO?.trim() || '';
const stateDir = await mkdtemp(path.join(tmpdir(), 'glade-desktop-smoke-state-'));
const isCiHeadless = Boolean(process.env.CI || process.env.GITHUB_ACTIONS);
const electronArgs = [
  ...(isCiHeadless ? ['--no-sandbox', '--disable-setuid-sandbox', '--headless', '--disable-gpu', '--ozone-platform=headless'] : []),
  entry,
];

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

function waitForChildExit(child) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null) {
      if (child.exitCode !== 0) {
        reject(new Error(`Electron exited with code ${child.exitCode}`));
        return;
      }

      resolve(undefined);
      return;
    }

    child.once('exit', (code) => {
      if (code && code !== 0) {
        reject(new Error(`Electron exited with code ${code}`));
        return;
      }

      resolve(undefined);
    });
  });
}

async function stopChild(child) {
  if (child.exitCode !== null) {
    return;
  }

  console.log('[smoke] terminating Electron process tree');
  await terminateProcessTree(child, { gracePeriodMs: 5_000 });
  console.log('[smoke] Electron process tree terminated');
}

const child = spawn(electronPath, electronArgs, {
  cwd,
  detached: process.platform !== 'win32',
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
  console.log(`[smoke] health check passed on port ${port}`);
  if (scenario) {
    console.log(`[smoke] waiting for scenario to complete: ${scenario}`);
    await waitForChildExit(child);
  } else {
    console.log('[smoke] default smoke path reached; waiting briefly before shutdown');
    await sleep(1_000);
    if (child.exitCode !== null && child.exitCode !== 0) {
      throw new Error(`Electron exited with code ${child.exitCode}`);
    }
  }
} finally {
  await stopChild(child);
}
