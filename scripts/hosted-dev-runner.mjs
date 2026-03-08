import { spawn } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

const root = new URL('..', import.meta.url).pathname;
const children = new Set();
let shuttingDown = false;

async function canListenOn(port) {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

async function getAvailablePort(preferredPort) {
  if (await canListenOn(preferredPort)) {
    return preferredPort;
  }

  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not resolve an ephemeral port.')));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function spawnProcess(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: 'inherit',
  });
  children.add(child);
  child.once('exit', () => {
    children.delete(child);
  });
  return child;
}

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

function cleanup(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }

  setTimeout(() => process.exit(exitCode), 50).unref();
}

process.on('SIGINT', () => cleanup(0));
process.on('SIGTERM', () => cleanup(0));

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
    cleanup(code);
  }
});

await waitFor(`http://127.0.0.1:${serverPort}/health`);

const web = spawnProcess('bun', ['run', '--cwd', 'apps/web', 'dev'], {
  BAYESGROVE_APP_ROOT: root,
  BAYESGROVE_SERVER_PORT: String(serverPort),
  BAYESGROVE_R_PORT: String(rPort),
  PORT: String(webPort),
  VITE_DEV_SERVER_URL: webUrl,
});

web.on('exit', (code) => {
  if (!shuttingDown) {
    cleanup(code === 0 || code === 143 ? 0 : (code ?? 1));
  }
});
