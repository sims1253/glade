import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { DEFAULT_SERVER_PORT } from '@glade/shared';

import type { DesktopSettings } from '@glade/shared';

import { resolveEditorCommand } from './settings';

const MAX_LOG_LINES = 160;

export interface ServerProcessHandle {
  readonly child: ChildProcess;
  readonly logTail: ReadonlyArray<string>;
}

interface StartServerProcessOptions {
  readonly projectPath: string;
  readonly settings: DesktopSettings;
  readonly onLogLine?: (line: string) => void;
}

function appRoot() {
  return process.env.BAYESGROVE_APP_ROOT?.trim() || path.resolve(__dirname, '../../..');
}

function serverEntry() {
  const root = appRoot();
  const useSourceEntry = process.env.NODE_ENV === 'development' || process.env.BAYESGROVE_SMOKE_TEST === '1';
  return useSourceEntry
    ? path.join(root, 'apps/server/src/index.ts')
    : path.join(root, 'apps/server/dist/index.mjs');
}

function bundledServerBinary() {
  const root = process.resourcesPath || appRoot();
  const executable = process.platform === 'win32'
    ? `glade-server-${process.platform}-${process.arch}.exe`
    : `glade-server-${process.platform}-${process.arch}`;
  const targetedPath = path.join(root, 'server', executable);
  if (existsSync(targetedPath)) {
    return targetedPath;
  }

  const fallbackExecutable = process.platform === 'win32' ? 'glade-server.exe' : 'glade-server';
  return path.join(root, 'server', fallbackExecutable);
}

export function serverPort() {
  return Number(process.env.BAYESGROVE_SERVER_PORT ?? DEFAULT_SERVER_PORT);
}

export function serverUrl() {
  return `http://127.0.0.1:${serverPort()}`;
}

function appendLog(logs: string[], line: string, onLogLine?: (line: string) => void) {
  logs.push(line);
  while (logs.length > MAX_LOG_LINES) {
    logs.shift();
  }
  onLogLine?.(line);
}

function forwardOutput(
  stream: NodeJS.ReadableStream | null,
  writer: NodeJS.WriteStream,
  logs: string[],
  prefix: 'stdout' | 'stderr',
  onLogLine?: (line: string) => void,
) {
  if (!stream) {
    return;
  }

  stream.setEncoding?.('utf8');
  let buffer = '';
  stream.on('data', (chunk) => {
    const text = String(chunk);
    writer.write(text);
    buffer += text.replace(/\r\n/g, '\n');
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      appendLog(logs, `[server:${prefix}] ${line}`, onLogLine);
    }
  });
  stream.on('end', () => {
    if (buffer) {
      appendLog(logs, `[server:${prefix}] ${buffer}`, onLogLine);
      buffer = '';
    }
  });
}

export async function startServerProcess(options: StartServerProcessOptions): Promise<ServerProcessHandle> {
  const root = appRoot();
  const binaryPath = bundledServerBinary();
  const useCompiledBinary = process.env.BAYESGROVE_SMOKE_TEST !== '1' && existsSync(binaryPath);
  const envRoot = useCompiledBinary ? (process.resourcesPath || root) : root;
  const env = {
    ...process.env,
    BAYESGROVE_APP_ROOT: envRoot,
    BAYESGROVE_RUNTIME: 'desktop',
    BAYESGROVE_SERVER_PORT: String(serverPort()),
    BAYESGROVE_PROJECT_PATH: options.projectPath,
    BAYESGROVE_R_PATH: options.settings.rExecutablePath,
    BAYESGROVE_EDITOR: await resolveEditorCommand(options.settings),
    NODE_ENV: process.env.NODE_ENV ?? 'production',
  };
  const logs: string[] = [];

  const child = useCompiledBinary
    ? spawn(binaryPath, [], {
        cwd: envRoot,
        env,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    : spawn('bun', ['run', serverEntry()], {
        cwd: root,
        env,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

  forwardOutput(child.stdout, process.stdout, logs, 'stdout', options.onLogLine);
  forwardOutput(child.stderr, process.stderr, logs, 'stderr', options.onLogLine);

  return {
    child,
    logTail: logs,
  };
}

export function stopServerProcess(handle: ServerProcessHandle | null) {
  const child = handle?.child ?? null;
  if (!child || child.killed || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM');
      setTimeout(() => {
        try {
          process.kill(-child.pid!, 'SIGKILL');
        } catch {
        }
      }, 2_000).unref();
      return;
    } catch {
    }
  }

  child.kill('SIGTERM');
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
  }, 2_000).unref();
}

export async function waitForServer(handle: ServerProcessHandle | null) {
  let attempts = 0;
  while (attempts < 120) {
    if (handle?.child.exitCode !== null || handle?.child.signalCode !== null) {
      throw new Error('Server process exited before becoming ready.');
    }

    try {
      const response = await fetch(`${serverUrl()}/health`);
      if (response.ok) {
        await sleep(100);
        return;
      }
    } catch {
      // Ignore network errors and keep retrying
    }

    await sleep(250);
    attempts++;
  }

  throw new Error('Timed out waiting for server to become ready.');
}
