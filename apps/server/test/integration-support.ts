import { spawnSync, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

export function ensureBayesgroveIntegrationPrerequisites() {
  const probe = spawnSync(
    'Rscript',
    ['-e', 'quit(status = if (requireNamespace("bayesgrove", quietly = TRUE)) 0 else 2)'],
    { stdio: 'ignore' },
  );

  if (probe.error) {
    if ('code' in probe.error && probe.error.code === 'ENOENT') {
      throw new Error(
        'R-backed integration tests require `Rscript` on PATH. Run `bun run test:integration` only in an environment with R and bayesgrove installed.',
      );
    }

    throw new Error(`Failed to start Rscript for integration preflight: ${probe.error.message}`);
  }

  if (probe.status === 2) {
    throw new Error(
      'R-backed integration tests require the `bayesgrove` R package. Install it before running `bun run test:integration`.',
    );
  }

  if (probe.status !== 0) {
    throw new Error(`R-backed integration preflight failed with exit code ${probe.status}.`);
  }
}

export async function waitFor(url: string, attempts = 160) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
    } catch {
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export async function getAvailablePort() {
  return await new Promise<number>((resolve, reject) => {
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

async function waitForChildExit(child: ChildProcess, timeoutMs = 5_000) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill('SIGKILL');
        } catch {
        }
      }
    }, timeoutMs);

    const finish = () => {
      clearTimeout(timeout);
      resolve();
    };

    child.once('exit', finish);
    child.once('error', finish);
  });
}

export async function terminateChildren(children: ReadonlySet<ChildProcess>) {
  await Promise.all(Array.from(children, async (child) => {
    if (child.exitCode === null && child.signalCode === null && !child.killed) {
      try {
        child.kill('SIGTERM');
      } catch {
      }
    }

    await waitForChildExit(child);
  }));
}
