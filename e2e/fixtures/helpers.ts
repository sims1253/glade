/**
 * Shared E2E utilities for network and process management.
 *
 * Self-contained implementations that avoid importing from monorepo packages
 * (which Playwright's Node.js runtime cannot resolve).
 */

import { execSync, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

// ---------------------------------------------------------------------------
// Port utilities
// ---------------------------------------------------------------------------

/**
 * Check whether a specific port is available on the loopback interface.
 */
function canListenOnLoopback(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

/**
 * Open an ephemeral port (OS-assigned) and return the number.
 */
function openEphemeralLoopbackPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
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

/**
 * Get an available port on the loopback interface.
 *
 * If `preferredPort` is given and available, returns it.
 * Otherwise asks the OS for an ephemeral port.
 */
export async function getAvailablePort(preferredPort?: number | null): Promise<number> {
  if (typeof preferredPort === 'number' && Number.isFinite(preferredPort)) {
    if (await canListenOnLoopback(preferredPort)) {
      return preferredPort;
    }
  }
  return openEphemeralLoopbackPort();
}

// ---------------------------------------------------------------------------
// Process utilities
// ---------------------------------------------------------------------------

interface WaitableProcessLike {
  readonly pid: number | undefined;
  readonly exitCode: number | null;
  kill(signal?: NodeJS.Signals): boolean;
  once(event: 'exit' | 'error', listener: (...args: unknown[]) => void): unknown;
  off(event: 'exit' | 'error', listener: (...args: unknown[]) => void): unknown;
}

function isProcessRunning(child: Pick<ChildProcess, 'exitCode'>): boolean {
  return child.exitCode === null;
}

function waitForProcessExit(
  child: WaitableProcessLike,
  timeoutMs: number,
): Promise<boolean> {
  if (!isProcessRunning(child as Pick<ChildProcess, 'exitCode'>)) {
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const finish = (exited: boolean) => {
      if (timeout !== null) {
        clearTimeout(timeout);
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

    timeout = setTimeout(() => finish(false), timeoutMs);
    timeout.unref?.();
  });
}

/**
 * Terminate a process and its entire process tree.
 *
 * Tries SIGTERM first, waits for `gracePeriodMs`, then SIGKILL.
 */
export async function terminateProcessTree(
  child: WaitableProcessLike,
  options: { gracePeriodMs?: number } = {},
): Promise<void> {
  const gracePeriodMs = options.gracePeriodMs ?? 2_000;

  if (!child.pid || !isProcessRunning(child as Pick<ChildProcess, 'exitCode'>)) {
    return;
  }

  const pid = child.pid;

  // Try process group kill (SIGTERM)
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      // Process may already be dead
    }
  }

  if (await waitForProcessExit(child, gracePeriodMs)) {
    return;
  }

  // Force kill (SIGKILL)
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      // Process may already be dead
    }
  }
  await waitForProcessExit(child, gracePeriodMs);
}

// ---------------------------------------------------------------------------
// HTTP utilities
// ---------------------------------------------------------------------------

/**
 * Poll a URL until it returns HTTP 200.
 *
 * @throws if the health check does not succeed within the given attempts.
 */
export async function waitForHttpReady(
  url: string,
  options: { attempts?: number; delayMs?: number } = {},
): Promise<Response> {
  const attempts = options.attempts ?? 120;
  const delayMs = options.delayMs ?? 250;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
      await response.body?.cancel();
    } catch {
      // Server not ready yet, retry
    }
    await sleep(delayMs);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

// ---------------------------------------------------------------------------
// Port-based process cleanup
// ---------------------------------------------------------------------------

/**
 * Kill all processes listening on a specific port.
 *
 * Uses `lsof` to find PIDs listening on the given port and kills them.
 * This is a safety net for cleaning up orphaned child processes (e.g., R
 * processes spawned by the Bun server) that may survive parent termination.
 */
export function killProcessesOnPort(port: number): void {
  try {
    const result = execSync(`lsof -ti :${port}`, {
      encoding: 'utf-8',
      timeout: 5_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const pids = result
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map(Number)
      .filter(Number.isFinite);

    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // Process may already be dead
      }
    }

    // Wait briefly then force-kill any survivors
    setTimeout(() => {
      for (const pid of pids) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Already dead
        }
      }
    }, 2_000).unref();
  } catch {
    // lsof found no processes on this port — nothing to do
  }
}
