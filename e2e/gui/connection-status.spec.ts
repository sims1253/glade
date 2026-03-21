/**
 * Connection status E2E tests.
 *
 * Verifies VAL-GUI-010: WebSocket connection status is visible.
 * - When the session is ready, no error banner is shown
 * - When connecting, a canvas status banner shows "Connecting to bayesgrove..."
 *   text with a spinner
 * - When in error state, a rose overlay appears with error reason
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

test('no connection status banner when session is ready', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Wait for the workspace shell to be visible
  const workspaceShell = page.locator('.workspace-shell');
  await expect(workspaceShell).toBeVisible({ timeout: 15_000 });

  // Wait for the React Flow canvas to be present
  const workflowFlow = page.locator('.workflow-flow');
  await expect(workflowFlow).toBeVisible({ timeout: 15_000 });

  // Wait for the session to become ready by checking the toolbar summary.
  // The toolbar shows "Waiting for graph snapshot…" while connecting and
  // "N nodes · M edges · K kinds" once the session is ready and the
  // graph snapshot has been received.
  const toolbarSummary = page.locator('.workflow-flow')
    .locator('..')
    .locator('p.truncate')
    .first();
  await expect(toolbarSummary).toHaveText(/\d+ nodes · \d+ edges · \d+ kinds/, { timeout: 30_000 });

  // The CanvasStatusBanner should NOT be visible when session is ready.
  // The banner renders null when sessionState === 'ready', so there should be
  // no element with the "Connecting to bayesgrove" text.
  const connectingBanner = page.locator('text=Connecting to bayesgrove');
  await expect(connectingBanner).not.toBeVisible({ timeout: 10_000 });

  // Also verify no error banner is shown
  const errorBanner = page.locator('text=Session unavailable');
  await expect(errorBanner).not.toBeVisible({ timeout: 5_000 });

  expect(consoleErrors).toHaveLength(0);
});

test('canvas status banner shows connecting text on page load before session is ready', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = captureConsoleErrors(page);

  // Intercept the WebSocket connection to prevent it from connecting.
  // This keeps the session in the 'connecting' state so we can observe
  // the CanvasStatusBanner. We use routeWebSocket which properly intercepts
  // WebSocket connections (unlike page.route which only handles HTTP).
  await page.routeWebSocket('**/ws', (ws) => {
    // Don't connect to the real server — just leave the socket hanging.
    // This keeps the app in 'connecting' state.
    ws.onMessage((_message) => {});
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // The workspace shell should still render
  const workspaceShell = page.locator('.workspace-shell');
  await expect(workspaceShell).toBeVisible({ timeout: 15_000 });

  // The connecting banner should be visible since the WS was intercepted
  const connectingBanner = page.getByText('Connecting to bayesgrove', { exact: false });
  await expect(connectingBanner).toBeVisible({ timeout: 10_000 });

  // The banner should have the spinner (LoaderCircle icon with animate-spin)
  const bannerContainer = connectingBanner.locator('..');
  const spinnerIcon = bannerContainer.locator('svg.animate-spin');
  await expect(spinnerIcon).toBeVisible({ timeout: 5_000 });

  // Verify no uncaught errors during the connecting state
  expect(consoleErrors).toHaveLength(0);
});

test('canvas status banner component structure is correct for connecting state', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors = captureConsoleErrors(page);

  // Intercept the WebSocket to keep the session in 'connecting' state
  await page.routeWebSocket('**/ws', (ws) => {
    ws.onMessage((_message) => {});
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const workspaceShell = page.locator('.workspace-shell');
  await expect(workspaceShell).toBeVisible({ timeout: 15_000 });

  // The connecting banner should be visible with the expected text
  const connectingText = page.getByText('Connecting to bayesgrove', { exact: false });
  await expect(connectingText).toBeVisible({ timeout: 10_000 });

  // Verify the banner has the "showing last known graph" subtitle
  const lastKnownText = page.getByText('showing last known graph', { exact: false });
  await expect(lastKnownText).toBeVisible({ timeout: 5_000 });

  // Verify no uncaught errors
  expect(consoleErrors).toHaveLength(0);
});
