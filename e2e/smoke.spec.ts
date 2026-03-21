/**
 * Smoke test for Glade E2E infrastructure.
 *
 * Verifies that:
 * - The backend server starts with a bayesgrove project
 * - The browser can navigate to the app
 * - The workspace shell renders
 * - No browser console errors occur
 * - Processes and temp directories are cleaned up
 *
 * Test isolation:
 * - Unique temp project/state directories per test run
 * - Backend server started on port 3100 (matches Vite proxy config)
 * - Server process tree terminated in afterAll
 * - Temp directories removed in afterAll
 */

import { test, expect, type Page } from '@playwright/test';

import { createBayesgroveProject, cleanupProject, type BayesgroveProject } from './fixtures/project-setup';
import { startServer, type ServerHandle } from './fixtures/server';

// --- Test-scoped state -------------------------------------------------------

let project: BayesgroveProject;
let server: ServerHandle;

// Collect browser console errors during the test
const consoleErrors: Array<{ type: string; text: string }> = [];

// --- Lifecycle ---------------------------------------------------------------

test.beforeAll(async () => {
  // 1. Create a fresh bayesgrove project with unique temp dirs
  project = await createBayesgroveProject();

  // 2. Start the backend server on port 3100 (must match Vite proxy target)
  server = await startServer({
    projectPath: project.projectPath,
    stateDir: project.stateDir,
    serverPort: 3100,
    rPort: project.rPort,
  });
});

test.afterAll(async () => {
  // 1. Stop the backend server and all child processes
  await server.stop();

  // 2. Remove temp project and state directories
  cleanupProject(project.projectPath, project.stateDir);
});

// --- Helpers -----------------------------------------------------------------

function captureConsoleErrors(page: Page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({ type: msg.type(), text: msg.text() });
    }
  });

  page.on('pageerror', (error) => {
    consoleErrors.push({ type: 'pageerror', text: error.message });
  });
}

// --- Tests -------------------------------------------------------------------

test('app loads and workspace renders', async ({ page }) => {
  // Capture console errors for the entire test
  captureConsoleErrors(page);

  // Navigate to the app
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Assert the page title
  await expect(page).toHaveTitle(/Glade/);

  // Assert the workspace shell is present in the DOM
  const workspaceShell = page.locator('.workspace-shell');
  await expect(workspaceShell).toBeVisible({ timeout: 15_000 });

  // Assert the explorer panel is present (left aside)
  const explorerPanel = page.locator('aside').first();
  await expect(explorerPanel).toBeVisible();

  // Assert no uncaught console errors occurred
  expect(consoleErrors).toHaveLength(0);
});

test('WebSocket connection establishes', async ({ page }) => {
  captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Wait for the session to become ready by checking that the
  // workspace shell is fully rendered (which requires bootstrap)
  const workspaceShell = page.locator('.workspace-shell');
  await expect(workspaceShell).toBeVisible({ timeout: 15_000 });

  // After bootstrap, the canvas area should be present
  // The canvas contains a .workflow-flow container (React Flow wrapper)
  const canvasArea = page.locator('.workflow-flow, [data-testid="workflow-canvas"]').first();
  await expect(canvasArea).toBeVisible({ timeout: 10_000 });

  // No console errors
  expect(consoleErrors).toHaveLength(0);
});

test('no browser console errors during smoke test', async ({ page }) => {
  captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'load' });
  await page.waitForTimeout(3_000);

  // Give the app time to fully initialize WebSocket and render
  const workspaceShell = page.locator('.workspace-shell');
  await expect(workspaceShell).toBeVisible({ timeout: 15_000 });

  // Reload to catch any errors on reconnection
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(workspaceShell).toBeVisible({ timeout: 15_000 });

  // Assert zero console errors across both loads
  expect(consoleErrors).toHaveLength(0);
});
