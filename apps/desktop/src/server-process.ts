import { existsSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import {
  forwardProcessOutput,
  spawnChildProcess,
  terminateProcessTree,
  waitForHttpReady,
  type ManagedProcessLike,
  type SpawnProcessOptions,
} from '@glade/shared/process';
import { writeRotatingLogLine } from '@glade/shared/logging';
import { DEFAULT_SERVER_PORT } from '@glade/shared';

import type { ChildProcess } from 'node:child_process';

const MAX_LOG_LINES = 160;

export interface ServerProcessHandle {
  readonly child: ChildProcess;
  readonly logTail: ReadonlyArray<string>;
}

interface StartServerProcessOptions {
  readonly stateDir: string;
  readonly projectPath?: string | null;
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

function appendLog(logs: string[], stateDir: string, line: string, onLogLine?: (line: string) => void) {
  logs.push(line);
  while (logs.length > MAX_LOG_LINES) {
    logs.shift();
  }
  void writeRotatingLogLine({
    directory: path.join(stateDir, 'logs'),
    fileName: 'embedded-server.log',
    line,
  }).catch(() => undefined);
  onLogLine?.(line);
}

function forwardOutput(
  stream: NodeJS.ReadableStream | null,
  writer: NodeJS.WriteStream,
  logs: string[],
  stateDir: string,
  prefix: 'stdout' | 'stderr',
  onLogLine?: (line: string) => void,
) {
  if (!stream) {
    return;
  }

  forwardProcessOutput({
    stream,
    writer,
    onLine: (line) => {
      appendLog(logs, stateDir, `[server:${prefix}] ${line}`, onLogLine);
    },
  });
}

export function startServerProcess(options: StartServerProcessOptions): Promise<ServerProcessHandle> {
  const root = appRoot();
  const binaryPath = bundledServerBinary();
  const useCompiledBinary = process.env.BAYESGROVE_SMOKE_TEST !== '1' && existsSync(binaryPath);
  const envRoot = useCompiledBinary ? (process.resourcesPath || root) : root;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    BAYESGROVE_APP_ROOT: envRoot,
    BAYESGROVE_SERVER_PORT: String(serverPort()),
    BAYESGROVE_STATE_DIR: options.stateDir,
    NODE_ENV: process.env.NODE_ENV ?? 'production',
  };
  const projectPath = options.projectPath?.trim();
  if (projectPath) {
    env.BAYESGROVE_PROJECT_PATH = projectPath;
  }
  const logs: string[] = [];

  const spawnOptions: SpawnProcessOptions = useCompiledBinary
    ? {
        command: binaryPath,
        cwd: envRoot,
        env,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    : {
        command: 'bun',
        args: ['run', serverEntry()],
        cwd: root,
        env,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      };
  const child = spawnChildProcess(spawnOptions);

  forwardOutput(child.stdout, process.stdout, logs, options.stateDir, 'stdout', options.onLogLine);
  forwardOutput(child.stderr, process.stderr, logs, options.stateDir, 'stderr', options.onLogLine);

  return Promise.resolve({
    child,
    // logTail is a live view backed by the mutable internal logs array.
    logTail: logs,
  });
}

export async function stopServerProcess(handle: ServerProcessHandle | null) {
  const child = handle?.child ?? null;
  if (!child || child.killed || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await terminateProcessTree(child as ManagedProcessLike);
}

export async function waitForServer(handle: ServerProcessHandle | null) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (handle?.child.exitCode !== null || handle?.child.signalCode !== null) {
      throw new Error('Server process exited before becoming ready.');
    }

    try {
      await waitForHttpReady(`${serverUrl()}/health`, {
        attempts: 1,
        delayMs: 0,
        settleDelayMs: 100,
      });
      return;
    } catch {
    }

    await sleep(250);
  }

  throw new Error('Timed out waiting for server to become ready.');
}
