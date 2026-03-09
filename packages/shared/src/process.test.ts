import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import {
  createLineBuffer,
  ProcessTimeoutError,
  runBufferedProcess,
  terminateProcessTree,
  type ManagedProcessLike,
  type ProcessRuntime,
} from './process';

class FakeChildProcess extends EventEmitter {
  pid: number | undefined = 4242;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly kill = vi.fn<(signal?: NodeJS.Signals) => boolean>().mockReturnValue(true);
}

function testRuntime(overrides: Partial<ProcessRuntime>): ProcessRuntime {
  return {
    platform: 'linux',
    spawn: vi.fn() as unknown as ProcessRuntime['spawn'],
    spawnSync: vi.fn() as unknown as ProcessRuntime['spawnSync'],
    kill: vi.fn() as unknown as ProcessRuntime['kill'],
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    ...overrides,
  };
}

describe('process helpers', () => {
  it('buffers stdout by complete lines', () => {
    const lines: string[] = [];
    const buffer = createLineBuffer((line) => {
      lines.push(line);
    });

    buffer.push('alpha\r\nbeta');
    buffer.push('\ngamma');
    buffer.flush();

    expect(lines).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('terminates POSIX process groups via negative pid', async () => {
    const child = new FakeChildProcess();
    const kill = vi.fn((_pid: number, _signal?: NodeJS.Signals | number) => {
      child.exitCode = 0;
      child.emit('exit', 0, null);
      return true;
    }) as unknown as ProcessRuntime['kill'];

    await terminateProcessTree(child as ManagedProcessLike, {
      gracePeriodMs: 10,
      runtime: testRuntime({ platform: 'linux', kill }),
    });

    expect(kill).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledWith(-4242, 'SIGTERM');
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('forces Windows tree termination with taskkill when the soft kill does not exit', async () => {
    const child = new FakeChildProcess();
    const spawnSync = vi.fn((command: string, args: ReadonlyArray<string>) => {
      expect(command).toBe('taskkill');
      if (args.includes('/f')) {
        child.exitCode = 1;
        child.signalCode = 'SIGKILL';
        child.emit('exit', 1, 'SIGKILL');
      }
      return { pid: 1, output: [], stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), status: 0, signal: null };
    }) as unknown as ProcessRuntime['spawnSync'];

    await terminateProcessTree(child as ManagedProcessLike, {
      gracePeriodMs: 1,
      runtime: testRuntime({ platform: 'win32', spawnSync }),
    });

    expect(spawnSync).toHaveBeenNthCalledWith(1, 'taskkill', ['/pid', '4242', '/t'], { stdio: 'ignore' });
    expect(spawnSync).toHaveBeenNthCalledWith(2, 'taskkill', ['/pid', '4242', '/t', '/f'], { stdio: 'ignore' });
  });

  it('times out buffered commands and rejects with ProcessTimeoutError', async () => {
    await expect(runBufferedProcess({
      command: 'node',
      args: ['-e', 'setTimeout(() => {}, 5000)'],
      stdio: ['ignore', 'pipe', 'pipe'],
      timeoutMs: 50,
      killGracePeriodMs: 10,
    })).rejects.toBeInstanceOf(ProcessTimeoutError);
  });
});
