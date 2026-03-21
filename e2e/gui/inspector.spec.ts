/**
 * Inspector panel E2E tests.
 *
 * Verifies VAL-GUI-004: Inspector panel has obligations and actions tabs.
 * - Inspector panel renders with "Obligations" and "Actions" tab buttons showing counts
 * - Switching tabs shows the corresponding items
 * - Tabs have proper ARIA attributes (role="tablist", role="tab", role="tabpanel")
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

test('inspector panel has Obligations and Actions tabs with role="tab" ARIA', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Wait for workspace shell to be visible
  const workspaceShell = page.locator('.workspace-shell');
  await expect(workspaceShell).toBeVisible({ timeout: 15_000 });

  // Locate the inspector tablist by its aria-label
  const inspectorTablist = page.locator('[aria-label="Inspector tabs"]');
  await expect(inspectorTablist).toBeVisible({ timeout: 15_000 });

  // Verify role="tablist"
  await expect(inspectorTablist).toHaveAttribute('role', 'tablist');

  // Locate the tab buttons within the tablist
  const tabs = inspectorTablist.locator('[role="tab"]');
  const tabCount = await tabs.count();
  expect(tabCount).toBe(2);

  // Verify Obligations tab exists with correct text pattern
  const obligationsTab = tabs.filter({ hasText: 'Obligations' });
  await expect(obligationsTab).toBeVisible();
  await expect(obligationsTab).toHaveAttribute('role', 'tab');

  // Verify Actions tab exists with correct text pattern
  const actionsTab = tabs.filter({ hasText: 'Actions' });
  await expect(actionsTab).toBeVisible();
  await expect(actionsTab).toHaveAttribute('role', 'tab');

  // Verify tabs have aria-selected attribute
  const obligationsSelected = await obligationsTab.getAttribute('aria-selected');
  expect(obligationsSelected).toBe('true');

  const actionsSelected = await actionsTab.getAttribute('aria-selected');
  expect(actionsSelected).toBe('false');

  // Verify tabpanel exists with role="tabpanel"
  const tabpanel = page.locator('[role="tabpanel"]');
  await expect(tabpanel).toBeVisible({ timeout: 5_000 });

  // Verify the active tabpanel is labelled by the active tab (aria-labelledby)
  const tabpanelLabelledBy = await tabpanel.getAttribute('aria-labelledby');
  expect(tabpanelLabelledBy).toBeTruthy();

  // Verify the active tab has aria-controls pointing to a panel
  const activeTabControls = await obligationsTab.getAttribute('aria-controls');
  expect(activeTabControls).toBeTruthy();
  // The tab's aria-controls should reference the panel ID (not the tab ID)
  expect(activeTabControls).not.toBe(tabpanelLabelledBy);
  expect(activeTabControls).toContain('panel');

  // Verify no console errors
  expect(consoleErrors).toHaveLength(0);
});

test('inspector panel switches between Obligations and Actions tabs', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const workspaceShell = page.locator('.workspace-shell');
  await expect(workspaceShell).toBeVisible({ timeout: 15_000 });

  const inspectorTablist = page.locator('[aria-label="Inspector tabs"]');
  await expect(inspectorTablist).toBeVisible({ timeout: 15_000 });

  // Verify Obligations tab is active by default
  const obligationsTab = inspectorTablist.locator('[role="tab"]').filter({ hasText: 'Obligations' });
  await expect(obligationsTab).toHaveAttribute('aria-selected', 'true');

  // Click on the Actions tab
  const actionsTab = inspectorTablist.locator('[role="tab"]').filter({ hasText: 'Actions' });
  await actionsTab.click();

  // Verify Actions tab is now selected
  await expect(actionsTab).toHaveAttribute('aria-selected', 'true');
  await expect(obligationsTab).toHaveAttribute('aria-selected', 'false');

  // Click back on the Obligations tab
  await obligationsTab.click();

  // Verify Obligations tab is selected again
  await expect(obligationsTab).toHaveAttribute('aria-selected', 'true');
  await expect(actionsTab).toHaveAttribute('aria-selected', 'false');

  expect(consoleErrors).toHaveLength(0);
});

test('inspector panel shows count badges on tabs', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const workspaceShell = page.locator('.workspace-shell');
  await expect(workspaceShell).toBeVisible({ timeout: 15_000 });

  const inspectorTablist = page.locator('[aria-label="Inspector tabs"]');
  await expect(inspectorTablist).toBeVisible({ timeout: 15_000 });

  // Both tabs should show counts in parentheses
  const obligationsTab = inspectorTablist.locator('[role="tab"]').filter({ hasText: 'Obligations' });
  const obligationsText = await obligationsTab.textContent();
  expect(obligationsText).toMatch(/Obligations \(\d+\)/);

  const actionsTab = inspectorTablist.locator('[role="tab"]').filter({ hasText: 'Actions' });
  const actionsText = await actionsTab.textContent();
  expect(actionsText).toMatch(/Actions \(\d+\)/);

  // In a fresh project, counts should be 0
  expect(obligationsText).toContain('(0)');
  expect(actionsText).toContain('(0)');

  expect(consoleErrors).toHaveLength(0);
});

test('inspector panel shows empty state when no obligations or actions', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const workspaceShell = page.locator('.workspace-shell');
  await expect(workspaceShell).toBeVisible({ timeout: 15_000 });

  const inspectorTablist = page.locator('[aria-label="Inspector tabs"]');
  await expect(inspectorTablist).toBeVisible({ timeout: 15_000 });

  // The tabpanel should show the empty state message
  const tabpanel = page.locator('[role="tabpanel"]');
  await expect(tabpanel).toBeVisible({ timeout: 5_000 });

  // In a fresh project, the default "Obligations" tab should show "No obligations yet."
  const emptyState = tabpanel.locator('text=No obligations yet');
  await expect(emptyState).toBeVisible({ timeout: 5_000 });

  // Switch to Actions tab
  const actionsTab = inspectorTablist.locator('[role="tab"]').filter({ hasText: 'Actions' });
  await actionsTab.click();

  // The actions panel should show "No actions yet."
  const actionsPanel = page.locator('[role="tabpanel"]');
  const actionsEmptyState = actionsPanel.locator('text=No actions yet');
  await expect(actionsEmptyState).toBeVisible({ timeout: 5_000 });

  expect(consoleErrors).toHaveLength(0);
});
