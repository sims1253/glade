import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const children = new Set<ChildProcess>();
let shuttingDown = false;
const OSC_SEQUENCE_PATTERN = new RegExp(String.raw`\u001b\][^\u0007]*(?:\u0007|\u001b\\)`, 'g');
const CSI_SEQUENCE_PATTERN = new RegExp(String.raw`\u001b\[[0-?]*[ -/]*[@-~]`, 'g');

interface SpawnProcessOptions {
  readonly stdio?: 'inherit' | 'pipe';
}

async function canListenOn(port: number) {
  return await new Promise<boolean>((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

async function getAvailablePort(preferredPort: number) {
  if (await canListenOn(preferredPort)) {
    return preferredPort;
  }

  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not resolve an ephemeral port.')));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

function stripTerminalControlSequences(chunk: string) {
  return chunk.replace(OSC_SEQUENCE_PATTERN, '').replace(CSI_SEQUENCE_PATTERN, '');
}

function shouldSuppressDesktopNoise(chunk: string) {
  return chunk.includes('dbus/object_proxy.cc:573') && chunk.includes('StartTransientUnit');
}

function forwardOutput(stream: NodeJS.ReadableStream | null | undefined, writer: NodeJS.WriteStream) {
  stream?.setEncoding?.('utf8');
  stream?.on('data', (chunk) => {
    const cleaned = stripTerminalControlSequences(String(chunk));
    if (!cleaned || shouldSuppressDesktopNoise(cleaned)) {
      return;
    }

    writer.write(cleaned);
  });
}

function spawnProcess(
  command: string,
  args: ReadonlyArray<string>,
  extraEnv: NodeJS.ProcessEnv = {},
  options: SpawnProcessOptions = {},
) {
  const child = spawn(command, [...args], {
    cwd: root,
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: options.stdio ?? 'inherit',
  });

  children.add(child);
  child.once('exit', () => {
    children.delete(child);
  });

  if (options.stdio === 'pipe') {
    forwardOutput(child.stdout, process.stdout);
    forwardOutput(child.stderr, process.stderr);
  }

  return child;
}

async function waitFor(url: string, attempts = 120) {
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

const web = spawnProcess('bun', ['run', '--cwd', 'apps/web', 'dev'], {
  BAYESGROVE_APP_ROOT: root,
  BAYESGROVE_SERVER_PORT: String(serverPort),
  BAYESGROVE_R_PORT: String(rPort),
  PORT: String(webPort),
  VITE_DEV_SERVER_URL: webUrl,
});

web.on('exit', (code) => {
  if (!shuttingDown && code && code !== 0 && code !== 143) {
    cleanup(code);
  }
});

await waitFor(webUrl);

const desktop = spawnProcess(
  'bun',
  ['run', '--cwd', 'apps/desktop', 'dev'],
  {
    BAYESGROVE_APP_ROOT: root,
    BAYESGROVE_SERVER_PORT: String(serverPort),
    BAYESGROVE_R_PORT: String(rPort),
    PORT: String(webPort),
    VITE_DEV_SERVER_URL: webUrl,
    NODE_ENV: 'development',
    BAYESGROVE_ELECTRON_HEADLESS: process.env.BAYESGROVE_ELECTRON_HEADLESS ?? '0',
  },
  { stdio: 'pipe' },
);

desktop.on('exit', (code) => {
  if (!shuttingDown) {
    cleanup(code === 0 || code === 143 ? 0 : (code ?? 1));
  }
});
