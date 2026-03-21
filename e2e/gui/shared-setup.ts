/**
 * Shared test environment for GUI E2E tests.
 *
 * Provides a singleton backend server that starts once per worker process
 * and is reused across all test files in e2e/gui/. The server is cleaned up
 * via cleanupTestEnvironment() which should be called from a single test file's
 * afterAll (e.g., the last file alphabetically).
 *
 * This avoids the issue where stopping the backend server in one file's
 * afterAll causes Vite's WebSocket proxy to crash, breaking subsequent
 * test files.
 */

import { createBayesgroveProject, cleanupProject, type BayesgroveProject } from '../fixtures/project-setup';
import { startServer, type ServerHandle } from '../fixtures/server';
import { killProcessesOnPort } from '../fixtures/helpers';

const SERVER_PORT = 3100;

let project: BayesgroveProject | null = null;
let server: ServerHandle | null = null;
let started = false;

/**
 * Ensure the shared test environment is running.
 *
 * On first call, cleans up any orphaned processes on the target port,
 * creates a bayesgrove project and starts the server.
 * Subsequent calls return the existing environment immediately.
 */
export async function ensureTestEnvironment(): Promise<void> {
  if (started) return;

  // Clean up any orphaned processes from a previous crashed worker
  // to ensure port 3100 is available for our server
  killProcessesOnPort(SERVER_PORT);

  project = await createBayesgroveProject();
  server = await startServer({
    projectPath: project.projectPath,
    stateDir: project.stateDir,
    serverPort: SERVER_PORT,
    rPort: project.rPort,
  });

  started = true;
}

/**
 * Clean up the shared test environment.
 *
 * Stops the server and removes temp directories. Should be called
 * from a single test file's afterAll (the last one to run).
 */
export async function cleanupTestEnvironment(): Promise<void> {
  if (!started || !project || !server) return;

  await server.stop();
  cleanupProject(project.projectPath, project.stateDir);
  project = null;
  server = null;
  started = false;
}
