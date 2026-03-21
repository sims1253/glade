/**
 * Graph canvas E2E tests.
 *
 * Verifies VAL-GUI-002: Graph canvas renders (React Flow container is present).
 * - After graph snapshot is received, a .workflow-flow container exists within the canvas area
 * - .react-flow__node elements are present when nodes exist in the graph
 * - React Flow controls and minimap are present
 */

import { test, expect, type Page } from '@playwright/test';

import { ensureTestEnvironment } from './shared-setup';

// --- Lifecycle ---------------------------------------------------------------

test.beforeAll(async () => {
  await ensureTestEnvironment();
});

// --- Helpers -----------------------------------------------------------------

function captureConsoleErrors(page: Page): Array<{ type: string; text: string }> {
  const errors: Array<{ type: string; text: string }> = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push({ type: msg.type(), text: msg.text() });
    }
  });

  page.on('pageerror', (error) => {
    errors.push({ type: 'pageerror', text: error.message });
  });

  return errors;
}

// --- Tests -------------------------------------------------------------------

test('React Flow canvas container (.workflow-flow) is present', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const workspaceShell = page.locator('.workspace-shell');
  await expect(workspaceShell).toBeVisible({ timeout: 15_000 });

  const workflowFlow = page.locator('.workflow-flow');
  await expect(workflowFlow).toBeVisible({ timeout: 15_000 });

  const viewport = workflowFlow.locator('.react-flow__viewport');
  await expect(viewport).toBeVisible({ timeout: 10_000 });

  expect(consoleErrors).toHaveLength(0);
});

test('React Flow background (dots pattern) renders inside canvas', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const workflowFlow = page.locator('.workflow-flow');
  await expect(workflowFlow).toBeVisible({ timeout: 15_000 });

  const background = page.locator('.react-flow__background');
  await expect(background).toBeVisible({ timeout: 10_000 });

  expect(consoleErrors).toHaveLength(0);
});

test('React Flow controls and minimap are present in canvas', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const workflowFlow = page.locator('.workflow-flow');
  await expect(workflowFlow).toBeVisible({ timeout: 15_000 });

  const controls = page.locator('.react-flow__controls');
  await expect(controls).toBeVisible({ timeout: 10_000 });

  const minimap = page.locator('.react-flow__minimap');
  await expect(minimap).toBeVisible({ timeout: 10_000 });

  expect(consoleErrors).toHaveLength(0);
});

test('empty graph shows no .react-flow__node elements', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const workflowFlow = page.locator('.workflow-flow');
  await expect(workflowFlow).toBeVisible({ timeout: 15_000 });

  const nodes = page.locator('.react-flow__node');
  await expect(nodes).toHaveCount(0, { timeout: 10_000 });

  const toolbarSummary = page.locator('.workflow-flow')
    .locator('..')
    .locator('p.truncate')
    .first();
  await expect(toolbarSummary).toHaveText(/0 nodes · 0 edges · \d+ kinds/, { timeout: 10_000 });

  expect(consoleErrors).toHaveLength(0);
});
