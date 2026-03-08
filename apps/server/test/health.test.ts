import { spawn } from 'node:child_process';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { version } from '../package.json' with { type: 'json' };
import { getAvailablePort, terminateChildren, waitFor } from './integration-support';

const cwd = path.resolve(import.meta.dirname, '../../..');
const children = new Set<ReturnType<typeof spawn>>();

afterEach(() => {
  terminateChildren(children);
  children.clear();
});

it('starts standalone and exposes /health', async () => {
  const port = await getAvailablePort();
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
  expect(await response.json()).toEqual({ status: 'ok', version });
});
