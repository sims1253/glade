import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { version } from '../package.json' with { type: 'json' };
import { getAvailablePort, terminateChildren, waitFor } from './integration-support';

const cwd = path.resolve(import.meta.dirname, '../../..');
const children = new Set<ReturnType<typeof spawn>>();
const tempDirs = new Set<string>();
const HEALTH_TIMEOUT_MS = 15_000;

afterEach(async () => {
  await terminateChildren(children);
  children.clear();
  await Promise.all(Array.from(tempDirs, async (dir) => {
    await rm(dir, { recursive: true, force: true });
  }));
  tempDirs.clear();
});

it('starts the local server and exposes /health', async () => {
  const port = await getAvailablePort();
  const stateDir = await mkdtemp(path.join(tmpdir(), 'glade-health-state-'));
  tempDirs.add(stateDir);
  const child = spawn('bun', ['run', 'apps/server/src/index.ts'], {
    cwd,
    env: {
      ...process.env,
      BAYESGROVE_APP_ROOT: cwd,
      BAYESGROVE_SERVER_PORT: String(port),
      BAYESGROVE_STATE_DIR: stateDir,
      NODE_ENV: 'production',
    },
    stdio: 'inherit',
  });
  children.add(child);

  const response = await waitFor(`http://127.0.0.1:${port}/health`);
  expect(await response.json()).toEqual({ status: 'ok', version });
  await expect.poll(
    async () => await readFile(path.join(stateDir, 'logs', 'server.log'), 'utf8').catch(() => ''),
    { timeout: HEALTH_TIMEOUT_MS, interval: 100 },
  ).toContain('Glade server listening');
}, HEALTH_TIMEOUT_MS);
