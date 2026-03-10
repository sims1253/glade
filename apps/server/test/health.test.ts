import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { version } from '../package.json' with { type: 'json' };
import { getAvailablePort, terminateChildren, waitFor } from './integration-support';

const cwd = path.resolve(import.meta.dirname, '../../..');
const children = new Set<ReturnType<typeof spawn>>();
const tempDirs = new Set<string>();
const STANDALONE_HEALTH_TIMEOUT_MS = 15_000;

afterEach(async () => {
  await terminateChildren(children);
  children.clear();
  await Promise.all(Array.from(tempDirs, async (dir) => {
    await rm(dir, { recursive: true, force: true });
  }));
  tempDirs.clear();
});

it('starts standalone and exposes /health', async () => {
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
    { timeout: STANDALONE_HEALTH_TIMEOUT_MS, interval: 100 },
  ).toContain('Glade server listening');
}, STANDALONE_HEALTH_TIMEOUT_MS);

it('serves cached extension bundles and returns 404 for missing bundle paths', async () => {
  const port = await getAvailablePort();
  const stateDir = await mkdtemp(path.join(tmpdir(), 'glade-health-state-'));
  tempDirs.add(stateDir);
  const extensionDir = path.join(stateDir, 'extensions');
  await mkdir(extensionDir, { recursive: true });
  await writeFile(path.join(extensionDir, 'test.js'), 'export function register() {}', 'utf8');

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

  await waitFor(`http://127.0.0.1:${port}/health`);

  const bundleResponse = await fetch(`http://127.0.0.1:${port}/extension-bundles/test.js`);
  expect(bundleResponse.status).toBe(200);
  expect(await bundleResponse.text()).toContain('register');

  const missingResponse = await fetch(`http://127.0.0.1:${port}/extension-bundles/missing.js`);
  expect(missingResponse.status).toBe(404);

  const emptyPathResponse = await fetch(`http://127.0.0.1:${port}/extension-bundles/`);
  expect(emptyPathResponse.status).toBe(404);
}, STANDALONE_HEALTH_TIMEOUT_MS);
