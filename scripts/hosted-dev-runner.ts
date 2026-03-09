import type { ChildProcess } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { getAvailablePort } from '@glade/shared/Net';
import {
  spawnChildProcess,
  terminateProcessTree,
  waitForHttpReady,
  type ManagedProcessLike,
} from '@glade/shared/process';

const root = fileURLToPath(new URL('..', import.meta.url));
const children = new Set<ChildProcess>();
let shuttingDown = false;

function trackChild(child: ChildProcess) {
  children.add(child);
  const cleanup = () => {
    children.delete(child);
  };
  child.once('exit', cleanup);
  child.once('error', cleanup);
  return child;
}

function spawnProcess(command: string, args: ReadonlyArray<string>, extraEnv: NodeJS.ProcessEnv = {}) {
  const child = trackChild(spawnChildProcess({
    command,
    args,
    cwd: root,
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: 'inherit',
  }));

  return child;
}

async function cleanup(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  await Promise.all(Array.from(children, async (child) => {
    await terminateProcessTree(child as ManagedProcessLike).catch(() => undefined);
  }));

  process.exit(exitCode);
}

process.on('SIGINT', () => {
  void cleanup(0);
});
process.on('SIGTERM', () => {
  void cleanup(0);
});

const webPort = await getAvailablePort(Number(process.env.PORT ?? 5173));
const serverPort = await getAvailablePort(Number(process.env.BAYESGROVE_SERVER_PORT ?? 7842));
const rPort = await getAvailablePort(Number(process.env.BAYESGROVE_R_PORT ?? serverPort + 10));
const webUrl = `http://localhost:${webPort}`;

const server = spawnProcess('bun', ['run', '--cwd', 'apps/server', 'dev'], {
  BAYESGROVE_APP_ROOT: root,
  BAYESGROVE_SERVER_PORT: String(serverPort),
  BAYESGROVE_R_PORT: String(rPort),
  PORT: String(webPort),
  VITE_DEV_SERVER_URL: webUrl,
  NODE_ENV: 'development',
});

server.on('exit', (code) => {
  if (!shuttingDown && code && code !== 0 && code !== 143) {
    void cleanup(code);
  }
});

await waitForHttpReady(`http://127.0.0.1:${serverPort}/health`);

const web = spawnProcess('bun', ['run', '--cwd', 'apps/web', 'dev'], {
  BAYESGROVE_APP_ROOT: root,
  BAYESGROVE_SERVER_PORT: String(serverPort),
  BAYESGROVE_R_PORT: String(rPort),
  PORT: String(webPort),
  VITE_DEV_SERVER_URL: webUrl,
});

web.on('exit', (code) => {
  if (!shuttingDown) {
    void cleanup(code === 0 || code === 143 ? 0 : (code ?? 1));
  }
});
