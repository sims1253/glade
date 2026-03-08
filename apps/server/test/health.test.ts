import { spawn } from 'node:child_process';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, expect, it } from 'vitest';

const cwd = path.resolve(import.meta.dirname, '../../..');
const children = new Set<ReturnType<typeof spawn>>();

afterEach(() => {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
  children.clear();
});

async function waitFor(url: string, attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
    } catch {
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

it('starts standalone and exposes /health', async () => {
  const port = 7942;
  const child = spawn('bun', ['run', 'apps/server/src/index.ts'], {
    cwd,
    env: {
      ...process.env,
      BAYESGROVE_APP_ROOT: cwd,
      BAYESGROVE_SERVER_PORT: String(port),
      NODE_ENV: 'production',
    },
    stdio: 'inherit',
  });
  children.add(child);

  const response = await waitFor(`http://127.0.0.1:${port}/health`);
  expect(await response.json()).toEqual({ status: 'ok', version: '0.1.0' });
});
