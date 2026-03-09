import { spawnSync, type ChildProcess } from 'node:child_process';

import { getAvailablePort as getSharedAvailablePort } from '@glade/shared/Net';
import { terminateProcessTree, waitForHttpReady, type ManagedProcessLike } from '@glade/shared/process';

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
  return await waitForHttpReady(url, { attempts, delayMs: 250 });
}

export async function getAvailablePort() {
  return await getSharedAvailablePort();
}

export async function terminateChildren(children: ReadonlySet<ChildProcess>) {
  await Promise.all(Array.from(children, async (child) => {
    await terminateProcessTree(child as ManagedProcessLike, { gracePeriodMs: 5_000 }).catch(() => undefined);
  }));
}
