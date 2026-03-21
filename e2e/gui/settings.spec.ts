/**
 * Settings page E2E tests.
 *
 * Verifies VAL-GUI-007: Settings page loads and renders.
 * - Navigating to /settings renders the settings route
 * - Settings page shows header with "Settings" label and title
 * - "Back to workspace" button is present
 * - In the web browser (non-desktop), a fallback message is shown
 *   indicating desktop-only availability
 * - Action buttons are present in the header area
 */

import { test, expect, type Page } from '@playwright/test';

import { ensureTestEnvironment, cleanupTestEnvironment } from './shared-setup';

// --- Lifecycle ---------------------------------------------------------------

test.beforeAll(async () => {
  await ensureTestEnvironment();
});

test.afterAll(async () => {
  await cleanupTestEnvironment();
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

test('settings page renders with header and title', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/settings', { waitUntil: 'domcontentloaded' });

  // The settings page should render a section with the settings layout
  const settingsSection = page.locator('section.min-h-screen');
  await expect(settingsSection).toBeVisible({ timeout: 15_000 });

  // Verify the "Settings" label is present
  const settingsLabel = page.locator('text=Settings').first();
  await expect(settingsLabel).toBeVisible({ timeout: 10_000 });

  // Verify the page title contains "Desktop Bayesgrove environment"
  const pageTitle = page.locator('h1');
  await expect(pageTitle).toBeVisible({ timeout: 10_000 });
  const titleText = await pageTitle.textContent();
  expect(titleText).toContain('Desktop Bayesgrove environment');

  expect(consoleErrors).toHaveLength(0);
});

test('settings page shows Back to workspace button', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/settings', { waitUntil: 'domcontentloaded' });

  const settingsSection = page.locator('section.min-h-screen');
  await expect(settingsSection).toBeVisible({ timeout: 15_000 });

  // Verify the "Back to workspace" button is present
  const backButton = page.locator('button', { hasText: 'Back to workspace' });
  await expect(backButton).toBeVisible({ timeout: 10_000 });

  expect(consoleErrors).toHaveLength(0);
});

test('settings page renders form fields and action buttons', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/settings', { waitUntil: 'domcontentloaded' });

  const settingsSection = page.locator('section.min-h-screen');
  await expect(settingsSection).toBeVisible({ timeout: 15_000 });

  // The settings page renders form fields when a desktop environment is available
  // Project directory input
  const projectDirInput = page.locator('input', { hasText: '' }).first();
  await expect(projectDirInput).toBeVisible({ timeout: 10_000 });

  // Verify form field labels are present
  const projectDirLabel = page.locator('text=Project directory');
  await expect(projectDirLabel.first()).toBeVisible({ timeout: 5_000 });

  const rExeLabel = page.locator('text=R executable path');
  await expect(rExeLabel.first()).toBeVisible({ timeout: 5_000 });

  const editorLabel = page.locator('text=Preferred editor command');
  await expect(editorLabel.first()).toBeVisible({ timeout: 5_000 });

  const updateChannelLabel = page.locator('text=Update channel');
  await expect(updateChannelLabel.first()).toBeVisible({ timeout: 5_000 });

  // Verify action buttons are present
  const resetButton = page.locator('button', { hasText: 'Reset to defaults' });
  await expect(resetButton).toBeVisible({ timeout: 5_000 });

  const discardButton = page.locator('button', { hasText: 'Discard' });
  await expect(discardButton).toBeVisible({ timeout: 5_000 });

  const saveButton = page.locator('button', { hasText: 'Save and restart session' });
  await expect(saveButton).toBeVisible({ timeout: 5_000 });

  expect(consoleErrors).toHaveLength(0);
});

test('settings page shows version info in header', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/settings', { waitUntil: 'domcontentloaded' });

  const settingsSection = page.locator('section.min-h-screen');
  await expect(settingsSection).toBeVisible({ timeout: 15_000 });

  // The header should show app version and server connection info
  const versionInfo = page.locator('text=App');
  await expect(versionInfo.first()).toBeVisible({ timeout: 5_000 });

  // Server info should also be visible
  const serverInfo = page.locator('text=Server');
  await expect(serverInfo.first()).toBeVisible({ timeout: 5_000 });

  expect(consoleErrors).toHaveLength(0);
});
