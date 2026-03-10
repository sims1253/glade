import { spawn } from 'node:child_process';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';
import WebSocket from 'ws';

import { getAvailablePort, terminateChildren, waitFor } from './integration-support';

const cwd = path.resolve(import.meta.dirname, '../../..');
const children = new Set<ReturnType<typeof spawn>>();
const HOSTED_REPL_TIMEOUT_MS = 15_000;

afterEach(async () => {
  await terminateChildren(children);
  children.clear();
});

it('rejects interactive repl input in hosted mode', async () => {
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

  await waitFor(`http://127.0.0.1:${port}/health`);

  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });

  socket.send(JSON.stringify({
    _tag: 'WebSocketRequest',
    id: 'cmd.repl.hosted',
    method: 'repl.write',
    body: {
      _tag: 'repl.write',
      data: '1 + 1\n',
    },
  }));

  const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for hosted REPL rejection.')), HOSTED_REPL_TIMEOUT_MS);
    socket.on('message', (payload) => {
      const message = JSON.parse(String(payload)) as Record<string, unknown>;
      if (message._tag === 'WebSocketError' && message.id === 'cmd.repl.hosted') {
        clearTimeout(timeout);
        resolve(message);
      }
    });
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  expect(result).toMatchObject({
    _tag: 'WebSocketError',
    id: 'cmd.repl.hosted',
    error: {
      _tag: 'RpcError',
      code: 'interactive_repl_unavailable',
      message: 'Interactive REPL is unavailable in hosted mode.',
    },
  });

  socket.close();
}, HOSTED_REPL_TIMEOUT_MS);
