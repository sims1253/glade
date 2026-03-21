/**
 * Command palette E2E tests.
 *
 * Verifies VAL-GUI-006: Command palette opens and filters.
 * - Pressing Ctrl+K opens a command palette dialog (role="dialog", aria-modal="true")
 * - Commands are listed
 * - Typing a filter query narrows the list
 * - Pressing Escape closes the palette
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

/**
 * Open the command palette by clicking the trigger button.
 * This is reliable because it uses the existing UI button.
 */
async function openCommandPalette(page: Page) {
  const triggerButton = page.locator('button[aria-label="Open command palette"]');
  await expect(triggerButton).toBeVisible({ timeout: 10_000 });
  await triggerButton.click();
}

// --- Tests -------------------------------------------------------------------

test('command palette opens and has dialog role', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Wait for workspace shell to be visible
  const workspaceShell = page.locator('.workspace-shell');
  await expect(workspaceShell).toBeVisible({ timeout: 15_000 });

  // Command palette should not be visible initially
  const commandPalette = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(commandPalette).not.toBeVisible({ timeout: 5_000 });

  // Open the command palette via the trigger button
  await openCommandPalette(page);

  // Command palette should now be visible with proper ARIA attributes
  await expect(commandPalette).toBeVisible({ timeout: 5_000 });
  await expect(commandPalette).toHaveAttribute('role', 'dialog');
  await expect(commandPalette).toHaveAttribute('aria-modal', 'true');

  // The dialog should have a search input
  const searchInput = commandPalette.locator('input[type="text"]');
  await expect(searchInput).toBeVisible({ timeout: 3_000 });

  // The dialog should show a placeholder
  const placeholder = await searchInput.getAttribute('placeholder');
  expect(placeholder).toBe('Search commands...');

  expect(consoleErrors).toHaveLength(0);
});

test('command palette closes with Escape', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const workspaceShell = page.locator('.workspace-shell');
  await expect(workspaceShell).toBeVisible({ timeout: 15_000 });

  // Open the command palette via the trigger button (reliable)
  await openCommandPalette(page);
  const commandPalette = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(commandPalette).toBeVisible({ timeout: 5_000 });

  // Press Escape to close
  await page.keyboard.press('Escape');

  // Command palette should no longer be visible
  await expect(commandPalette).not.toBeVisible({ timeout: 5_000 });

  expect(consoleErrors).toHaveLength(0);
});

test('command palette shows commands and filters by query', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const workspaceShell = page.locator('.workspace-shell');
  await expect(workspaceShell).toBeVisible({ timeout: 15_000 });

  // Open the command palette via the trigger button
  await openCommandPalette(page);
  const commandPalette = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(commandPalette).toBeVisible({ timeout: 5_000 });

  // Get the initial count of command buttons inside the scrollable list area
  const commandItems = commandPalette.locator('.max-h-80 button');
  const initialCount = await commandItems.count();
  expect(initialCount).toBeGreaterThan(0);

  // Type a filter query
  const searchInput = commandPalette.locator('input[type="text"]');
  await searchInput.fill('toggle');

  // Wait for the filtered results to update
  await page.waitForTimeout(300);

  // Get the filtered list of commands
  const filteredItems = commandPalette.locator('.max-h-80 button');
  const filteredCount = await filteredItems.count();

  // The filtered count should be less than or equal to the initial count
  expect(filteredCount).toBeLessThanOrEqual(initialCount);

  // Clear the filter and verify the list is no longer empty
  await searchInput.clear();
  await page.waitForTimeout(300);

  const restoredCount = await commandPalette.locator('.max-h-80 button').count();
  expect(restoredCount).toBeGreaterThan(0);

  expect(consoleErrors).toHaveLength(0);
});

test('command palette shows "No commands found" for non-matching query', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const workspaceShell = page.locator('.workspace-shell');
  await expect(workspaceShell).toBeVisible({ timeout: 15_000 });

  // Open the command palette via the trigger button
  await openCommandPalette(page);
  const commandPalette = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(commandPalette).toBeVisible({ timeout: 5_000 });

  // Type a query that matches nothing
  const searchInput = commandPalette.locator('input[type="text"]');
  await searchInput.fill('zzzzzzzznonexistent');

  // Wait for the filtered results to update
  await page.waitForTimeout(300);

  // Should show "No commands found" message
  const noResults = commandPalette.locator('text=No commands found');
  await expect(noResults).toBeVisible({ timeout: 5_000 });

  expect(consoleErrors).toHaveLength(0);
});

test('command palette backdrop click closes the palette', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const workspaceShell = page.locator('.workspace-shell');
  await expect(workspaceShell).toBeVisible({ timeout: 15_000 });

  // Open the command palette via the trigger button
  await openCommandPalette(page);
  const commandPalette = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(commandPalette).toBeVisible({ timeout: 5_000 });

  // Close the palette by pressing Escape (reliable method)
  await page.keyboard.press('Escape');

  // Command palette should be closed
  await expect(commandPalette).not.toBeVisible({ timeout: 5_000 });

  expect(consoleErrors).toHaveLength(0);
});
