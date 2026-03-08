import { spawn } from 'node:child_process';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

const root = new URL('..', import.meta.url).pathname;
const webPort = Number(process.env.PORT ?? 5173);
const serverPort = Number(process.env.BAYESGROVE_SERVER_PORT ?? 7842);
const webUrl = `http://localhost:${webPort}`;
const children = [];

function spawnProcess(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: {
      ...process.env,
      BAYESGROVE_APP_ROOT: root,
      BAYESGROVE_SERVER_PORT: String(serverPort),
      PORT: String(webPort),
      VITE_DEV_SERVER_URL: webUrl,
      ...extraEnv,
    },
    stdio: 'inherit',
  });
  children.push(child);
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
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
  process.exit(exitCode);
}

process.on('SIGINT', () => cleanup(130));
process.on('SIGTERM', () => cleanup(143));

const web = spawnProcess('bun', ['run', '--cwd', 'apps/web', 'dev']);

web.on('exit', (code) => {
  if (code && code !== 0) {
    cleanup(code);
  }
});

await waitFor(webUrl);

const desktop = spawnProcess('bun', ['run', '--cwd', 'apps/desktop', 'dev'], {
  NODE_ENV: 'development',
  BAYESGROVE_ELECTRON_HEADLESS: process.env.BAYESGROVE_ELECTRON_HEADLESS ?? '0',
});

desktop.on('exit', (code) => cleanup(code ?? 0));
