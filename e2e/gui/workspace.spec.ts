/**
 * Workspace layout E2E tests.
 *
 * Verifies VAL-GUI-001: App loads and shows workspace canvas with toolbar.
 * - Workspace shell renders
 * - Three-panel layout visible in wide mode (Explorer, Canvas, Inspector)
 * - Canvas toolbar shows summary string matching "N nodes · M edges · K kinds"
 */

import { test, expect, type Page } from '@playwright/test';

import { ensureTestEnvironment } from './shared-setup';

// --- Lifecycle ---------------------------------------------------------------

test.beforeAll(async () => {
  await ensureTestEnvironment();
});

// Note: cleanupTestEnvironment is called by the last test file alphabetically
// (settings.spec.ts) to avoid Vite proxy crashes.

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

test('workspace shell renders with three-panel layout', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const workspaceShell = page.locator('.workspace-shell');
  await expect(workspaceShell).toBeVisible({ timeout: 15_000 });

  const gridContainer = workspaceShell.locator('> div.grid');
  await expect(gridContainer).toBeVisible({ timeout: 10_000 });

  const explorerHeader = page.locator('.workspace-shell aside header h1');
  await expect(explorerHeader).toBeVisible({ timeout: 10_000 });

  const inspectorTablist = page.locator('[aria-label="Inspector tabs"]');
  await expect(inspectorTablist).toBeVisible({ timeout: 10_000 });

  const canvasContainer = page.locator('.workflow-flow').first();
  await expect(canvasContainer).toBeVisible({ timeout: 10_000 });

  expect(consoleErrors).toHaveLength(0);
});

test('canvas toolbar shows node, edge, and kind counts', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const workspaceShell = page.locator('.workspace-shell');
  await expect(workspaceShell).toBeVisible({ timeout: 15_000 });

  const toolbarSummary = page.locator('.workflow-flow')
    .locator('..')
    .locator('p.truncate')
    .first();

  await expect(toolbarSummary).toHaveText(/\d+ nodes · \d+ edges · \d+ kinds/, { timeout: 15_000 });

  const summaryText = await toolbarSummary.textContent();
  expect(summaryText).not.toContain('Waiting');

  expect(consoleErrors).toHaveLength(0);
});

test('explorer panel shows project name header', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const workspaceShell = page.locator('.workspace-shell');
  await expect(workspaceShell).toBeVisible({ timeout: 15_000 });

  const explorerHeader = page.locator('.workspace-shell aside').first().locator('header h1');
  await expect(explorerHeader).toBeVisible({ timeout: 10_000 });

  const headerText = await explorerHeader.textContent();
  expect(headerText).toBeTruthy();
  expect(headerText!.length).toBeGreaterThan(0);

  expect(consoleErrors).toHaveLength(0);
});
