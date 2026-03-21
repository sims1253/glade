/**
 * E2E test fixture for server lifecycle management.
 *
 * Spawns the Bun backend server with required environment variables,
 * waits for the /health endpoint, and provides a stop() method
 * that terminates the entire process tree.
 */

import { spawn } from 'node:child_process';

import { getAvailablePort } from '@glade/shared/net';
import { terminateProcessTree, waitForHttpReady, type ManagedProcessLike } from '@glade/shared/process';

const E2E_PORT_MIN = 3100;
const E2E_PORT_MAX = 3199;

let portCounter = E2E_PORT_MIN;

function nextPort(): number {
  const port = portCounter;
  portCounter = portCounter >= E2E_PORT_MAX ? E2E_PORT_MIN : portCounter + 1;
  return port;
}

/**
 * Configuration for starting the server.
 */
export interface ServerConfig {
  /** Path to the bayesgrove project directory. */
  readonly projectPath: string;
  /** Path to the server state directory. */
  readonly stateDir: string;
  /** Preferred server port (3100-3199). Falls back to available port if taken. */
  readonly serverPort?: number;
  /** Preferred R process port (3100-3199). Falls back to available port if taken. */
  readonly rPort?: number;
  /** Path to the application root directory. */
  readonly appRoot?: string;
}

/**
 * Result of starting the server.
 */
export interface ServerHandle {
  /** The port the server is listening on. */
  readonly port: number;
  /** The port the R process is listening on. */
  readonly rPort: number;
  /** Stop the server and all child processes. */
  readonly stop: () => Promise<void>;
}

/**
 * Start the Bun backend server with the given configuration.
 *
 * Spawns `bun run apps/server/src/index.ts` with all required environment
 * variables, waits for the /health endpoint to return 200, then returns
 * a handle with the allocated ports and a stop() function.
 *
 * The stop() function uses `terminateProcessTree` to ensure all child
 * processes (including the R process) are cleaned up.
 */
export async function startServer(config: ServerConfig): Promise<ServerHandle> {
  const port = await getAvailablePort(config.serverPort ?? nextPort());
  let rPort = await getAvailablePort(config.rPort ?? nextPort());

  // Ensure rPort differs from port
  if (rPort === port) {
    rPort = await getAvailablePort(nextPort());
  }

  const appRoot = config.appRoot ?? process.cwd();

  const child = spawn(
    'bun',
    ['run', 'apps/server/src/index.ts'],
    {
      cwd: appRoot,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        BAYESGROVE_APP_ROOT: appRoot,
        BAYESGROVE_PROJECT_PATH: config.projectPath,
        BAYESGROVE_STATE_DIR: config.stateDir,
        BAYESGROVE_SERVER_PORT: String(port),
        BAYESGROVE_R_PORT: String(rPort),
        NODE_ENV: 'production',
      },
    },
  );

  // Log server output for debugging
  if (child.stdout) {
    child.stdout.on('data', (chunk: Buffer) => {
      process.stdout.write(`[server:${port}] ${chunk}`);
    });
  }
  if (child.stderr) {
    child.stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(`[server:${port}:err] ${chunk}`);
    });
  }

  const stop = async () => {
    await terminateProcessTree(child as unknown as ManagedProcessLike, {
      gracePeriodMs: 5_000,
    });
  };

  // Wait for health endpoint
  try {
    await waitForHttpReady(`http://127.0.0.1:${port}/health`, {
      attempts: 120,
      delayMs: 250,
    });
  } catch (error) {
    await stop();
    throw new Error(
      `Server failed to start on port ${port}: health check timed out. ${error instanceof Error ? error.message : ''}`,
    );
  }

  return { port, rPort, stop };
}
