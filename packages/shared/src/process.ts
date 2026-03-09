import { spawn, spawnSync, type ChildProcess, type SpawnOptions, type SpawnSyncReturns } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

import { createLineBuffer } from './logging';

export { createLineBuffer } from './logging';

export interface SpawnProcessOptions extends SpawnOptions {
  readonly command: string;
  readonly args?: ReadonlyArray<string>;
}

export interface RunBufferedProcessOptions extends SpawnProcessOptions {
  readonly stdin?: string | null;
  readonly timeoutMs?: number | null;
  readonly killGracePeriodMs?: number | null;
}

export interface BufferedProcessResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
}

export class ProcessTimeoutError extends Error {
  override readonly name = 'ProcessTimeoutError';
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Process timed out after ${timeoutMs}ms.`);
    Object.setPrototypeOf(this, ProcessTimeoutError.prototype);
    this.timeoutMs = timeoutMs;
  }
}

export interface ProcessRuntime {
  readonly platform: NodeJS.Platform;
  readonly spawn: typeof spawn;
  readonly spawnSync: typeof spawnSync;
  readonly kill: typeof process.kill;
  readonly setTimeout: typeof globalThis.setTimeout;
  readonly clearTimeout: typeof globalThis.clearTimeout;
}

type WaitableProcessLike = {
  readonly exitCode: number | null;
  readonly signalCode: NodeJS.Signals | null;
  once(event: 'exit' | 'error', listener: (...args: ReadonlyArray<unknown>) => void): unknown;
  off(event: 'exit' | 'error', listener: (...args: ReadonlyArray<unknown>) => void): unknown;
};

export type ManagedProcessLike = WaitableProcessLike & {
  readonly pid: number | undefined;
  kill(signal?: NodeJS.Signals): boolean;
};

export interface ForwardProcessOutputOptions {
  readonly stream: NodeJS.ReadableStream | null | undefined;
  readonly writer?: Pick<NodeJS.WriteStream, 'write'> | null;
  readonly onLine?: (line: string) => void;
  readonly stripAnsi?: boolean;
  readonly includeLine?: (line: string) => boolean;
}

export interface WaitForHttpReadyOptions {
  readonly attempts?: number;
  readonly delayMs?: number;
  readonly settleDelayMs?: number;
}

const OSC_SEQUENCE_PATTERN = new RegExp(String.raw`\u001b\][^\u0007]*(?:\u0007|\u001b\\)`, 'g');
const CSI_SEQUENCE_PATTERN = new RegExp(String.raw`\u001b\[[0-?]*[ -/]*[@-~]`, 'g');

const defaultRuntime: ProcessRuntime = {
  platform: process.platform,
  spawn,
  spawnSync,
  kill: process.kill.bind(process),
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
};

export function spawnChildProcess(
  options: SpawnProcessOptions,
  runtime: ProcessRuntime = defaultRuntime,
): ChildProcess {
  const { command, args = [], ...spawnOptions } = options;
  return runtime.spawn(command, [...args], spawnOptions);
}

export function stripAnsiControlSequences(chunk: string) {
  return chunk.replace(OSC_SEQUENCE_PATTERN, '').replace(CSI_SEQUENCE_PATTERN, '');
}

export function forwardProcessOutput(options: ForwardProcessOutputOptions) {
  if (!options.stream) {
    return () => undefined;
  }

  const { stream } = options;
  stream.setEncoding?.('utf8');

  const buffer = createLineBuffer((line) => {
    const nextLine = options.stripAnsi ? stripAnsiControlSequences(line) : line;
    if (options.includeLine && !options.includeLine(nextLine)) {
      return;
    }

    options.writer?.write(`${nextLine}\n`);
    options.onLine?.(nextLine);
  });

  const onData = (chunk: string | Buffer) => {
    buffer.push(String(chunk));
  };
  const onEnd = () => {
    buffer.flush();
  };

  stream.on('data', onData);
  stream.on('end', onEnd);

  return () => {
    stream.off('data', onData);
    stream.off('end', onEnd);
  };
}

export function isProcessRunning(child: Pick<ChildProcess, 'exitCode' | 'signalCode'>) {
  return child.exitCode === null && child.signalCode === null;
}

export function waitForProcessExit(
  child: WaitableProcessLike,
  timeoutMs?: number | null,
  runtime: ProcessRuntime = defaultRuntime,
): Promise<boolean> {
  if (!isProcessRunning(child)) {
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    let timeout: ReturnType<typeof globalThis.setTimeout> | null = null;

    const finish = (exited: boolean) => {
      if (timeout !== null) {
        runtime.clearTimeout(timeout);
        timeout = null;
      }
      child.off('exit', onExit);
      child.off('error', onError);
      resolve(exited);
    };

    const onExit = () => finish(true);
    const onError = () => finish(true);

    child.once('exit', onExit);
    child.once('error', onError);

    if (typeof timeoutMs === 'number' && timeoutMs >= 0) {
      timeout = runtime.setTimeout(() => finish(false), timeoutMs);
      timeout.unref?.();
    }
  });
}

function tryKillGroup(pid: number, signal: NodeJS.Signals, runtime: ProcessRuntime) {
  try {
    runtime.kill(-pid, signal);
    return true;
  } catch {
    return false;
  }
}

function tryKillChild(child: Pick<ChildProcess, 'kill'>, signal: NodeJS.Signals) {
  try {
    child.kill(signal);
    return true;
  } catch {
    return false;
  }
}

function tryTaskkill(
  pid: number,
  force: boolean,
  runtime: ProcessRuntime,
): SpawnSyncReturns<Buffer> | null {
  try {
    return runtime.spawnSync(
      'taskkill',
      ['/pid', String(pid), '/t', ...(force ? ['/f'] : [])],
      { stdio: 'ignore' },
    );
  } catch {
    return null;
  }
}

export async function terminateProcessTree(
  child: ManagedProcessLike,
  options: {
    readonly gracePeriodMs?: number;
    readonly runtime?: ProcessRuntime;
  } = {},
) {
  const runtime = options.runtime ?? defaultRuntime;
  const gracePeriodMs = options.gracePeriodMs ?? 2_000;

  if (!child.pid || !isProcessRunning(child)) {
    return;
  }

  const pid = child.pid;
  if (runtime.platform === 'win32') {
    const softResult = tryTaskkill(pid, false, runtime);
    if (softResult?.error) {
      tryKillChild(child, 'SIGTERM');
    }

    if (await waitForProcessExit(child, gracePeriodMs, runtime)) {
      return;
    }

    const forceResult = tryTaskkill(pid, true, runtime);
    if (forceResult?.error) {
      tryKillChild(child, 'SIGKILL');
    }
    await waitForProcessExit(child, gracePeriodMs, runtime);
    return;
  }

  if (!tryKillGroup(pid, 'SIGTERM', runtime)) {
    tryKillChild(child, 'SIGTERM');
  }

  if (await waitForProcessExit(child, gracePeriodMs, runtime)) {
    return;
  }

  if (!tryKillGroup(pid, 'SIGKILL', runtime)) {
    tryKillChild(child, 'SIGKILL');
  }
  await waitForProcessExit(child, gracePeriodMs, runtime);
}

/**
 * Runs a child process and buffers stdout/stderr until it exits.
 *
 * When `options.timeoutMs` elapses, this rejects immediately with `ProcessTimeoutError`
 * and starts terminating the child tree asynchronously in the background.
 */
export async function runBufferedProcess(
  options: RunBufferedProcessOptions,
  runtime: ProcessRuntime = defaultRuntime,
): Promise<BufferedProcessResult> {
  const child = spawnChildProcess({
    ...options,
    detached: options.detached ?? runtime.platform !== 'win32',
  }, runtime);
  return waitForBufferedProcess(child, options, runtime);
}

export async function waitForBufferedProcess(
  child: ChildProcess,
  options: Pick<RunBufferedProcessOptions, 'stdin' | 'timeoutMs' | 'killGracePeriodMs'>,
  runtime: ProcessRuntime = defaultRuntime,
): Promise<BufferedProcessResult> {
  let stdout = '';
  let stderr = '';

  if (child.stdout) {
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string | Buffer) => {
      stdout += String(chunk);
    });
  }

  if (child.stderr) {
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string | Buffer) => {
      stderr += String(chunk);
    });
  }

  return await new Promise<BufferedProcessResult>((resolve, reject) => {
    let settled = false;

    const finish = (thunk: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout !== null) {
        runtime.clearTimeout(timeout);
      }
      thunk();
    };

    const timeout = typeof options.timeoutMs === 'number' && options.timeoutMs > 0
      ? runtime.setTimeout(() => {
          finish(() => reject(new ProcessTimeoutError(options.timeoutMs!)));
          void terminateProcessTree(child as ManagedProcessLike, {
            gracePeriodMs: options.killGracePeriodMs ?? 1_000,
            runtime,
          });
        }, options.timeoutMs)
      : null;
    timeout?.unref?.();

    child.once('error', (error: Error) => finish(() => reject(error)));
    child.once('close', (exitCode: number | null, signal: NodeJS.Signals | null) =>
      finish(() =>
        resolve({
          stdout,
          stderr,
          exitCode,
          signal,
        })));

    if (options.stdin !== undefined && child.stdin) {
      child.stdin.end(options.stdin, 'utf8');
    } else {
      child.stdin?.end();
    }
  });
}

export async function waitForHttpReady(url: string, options: WaitForHttpReadyOptions = {}) {
  const attempts = options.attempts ?? 120;
  const delayMs = options.delayMs ?? 250;
  const settleDelayMs = options.settleDelayMs ?? 0;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        if (settleDelayMs > 0) {
          await sleep(settleDelayMs);
        }
        return response;
      }

      await response.body?.cancel();
    } catch {
    }

    await sleep(delayMs);
  }

  throw new Error(`Timed out waiting for ${url}`);
}
