/**
 * E2E test fixture for bayesgrove project setup and teardown.
 *
 * Creates a temporary bayesgrove project directory, initializes it with
 * `bg_init` and `bg_use_default_workflow`, and provides cleanup.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getAvailablePort } from '@glade/shared/net';

const E2E_PORT_MIN = 3100;
const E2E_PORT_MAX = 3199;

let portCounter = E2E_PORT_MIN;

function nextPort(): number {
  const port = portCounter;
  portCounter = portCounter >= E2E_PORT_MAX ? E2E_PORT_MIN : portCounter + 1;
  return port;
}

/**
 * Run an Rscript command synchronously and return its output.
 * Throws if the process exits with a non-zero code.
 */
function runRscript(rScript: string): { stdout: string; stderr: string } {
  const result = spawnSync('Rscript', ['-e', rScript], {
    encoding: 'utf-8',
    timeout: 30_000,
  });

  if (result.error) {
    throw new Error(`Rscript failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(
      `Rscript exited with code ${result.status}.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  }

  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * Result of creating a bayesgrove project for E2E tests.
 */
export interface BayesgroveProject {
  /** Absolute path to the temporary project directory. */
  readonly projectPath: string;
  /** Absolute path to the temporary state directory. */
  readonly stateDir: string;
  /** Dynamically allocated server port (3100-3199). */
  readonly serverPort: number;
  /** Dynamically allocated R process port (3100-3199, different from serverPort). */
  readonly rPort: number;
}

/**
 * Create a temporary bayesgrove project initialized with default workflow.
 *
 * Steps:
 * 1. Create temp project and state directories
 * 2. Run `bg_init(projectPath)` via Rscript
 * 3. Run `bg_use_default_workflow(projectPath)` via Rscript
 *
 * Port allocation uses a simple counter within 3100-3199, falling back
 * to `getAvailablePort()` if the preferred port is taken.
 */
export async function createBayesgroveProject(): Promise<BayesgroveProject> {
  const prefix = 'glade-e2e-';
  const projectPath = join(tmpdir(), `${prefix}project-${Date.now()}`);
  const stateDir = join(tmpdir(), `${prefix}state-${Date.now()}`);

  mkdirSync(projectPath, { recursive: true });
  mkdirSync(stateDir, { recursive: true });

  try {
    // Initialize bayesgrove project
    runRscript(`
      library(bayesgrove)
      bg_init("${projectPath.replace(/"/g, '\\"')}")
    `);

    // Enable default workflow (registers starter node kinds)
    runRscript(`
      library(bayesgrove)
      bg_use_default_workflow("${projectPath.replace(/"/g, '\\"')}")
    `);
  } catch (error) {
    // Clean up on failure
    cleanupProject(projectPath, stateDir);
    throw error;
  }

  const serverPort = await getAvailablePort(nextPort());
  let rPort = await getAvailablePort(nextPort());
  // Ensure rPort differs from serverPort
  if (rPort === serverPort) {
    rPort = await getAvailablePort(nextPort());
  }

  return { projectPath, stateDir, serverPort, rPort };
}

/**
 * Remove temporary project and state directories.
 * Safe to call even if directories don't exist.
 */
export function cleanupProject(projectPath: string, stateDir: string): void {
  for (const dir of [projectPath, stateDir]) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
