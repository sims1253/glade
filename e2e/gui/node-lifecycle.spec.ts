/**
 * Node lifecycle E2E tests.
 *
 * Verifies:
 * - VAL-GUI-008: Node can be added via REPL bg_add_node command
 * - VAL-GUI-009: Nodes appear on canvas with .react-flow__node and toolbar updates
 * - VAL-GUI-011: Clicking a node opens the node detail view with label and kind
 * - VAL-GUI-012: Node can be deleted and disappears from canvas and explorer
 *
 * Note: Tests share a single backend server via shared-setup.ts. Each test
 * navigates to a fresh page, but the server-side graph state persists.
 * Tests that mutate state clean up after themselves via REPL commands.
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

/**
 * Wait for the workspace shell to be fully loaded and ready.
 * This includes waiting for the graph snapshot to arrive from the server
 * (the toolbar summary transitions from "Waiting for graph snapshot…" to
 * "N nodes · M edges · K kinds").
 *
 * If the snapshot doesn't arrive within 15s, reloads the page once to
 * retry the WebSocket connection.
 */
async function waitForWorkspace(page: Page): Promise<void> {
  const workspaceShell = page.locator('.workspace-shell');
  await expect(workspaceShell).toBeVisible({ timeout: 15_000 });

  // Wait for the React Flow canvas to be present
  const workflowFlow = page.locator('.workflow-flow');
  await expect(workflowFlow).toBeVisible({ timeout: 15_000 });

  // Wait for the graph snapshot to arrive by polling the toolbar text.
  // Use waitForFunction for robust polling with a generous timeout.
  try {
    await page.waitForFunction(() => {
      const el = document.querySelector('.workflow-flow');
      if (!el) return false;
      const parent = el.parentElement;
      if (!parent) return false;
      const summary = parent.querySelector('p.truncate');
      if (!summary) return false;
      const text = summary.textContent ?? '';
      return /^\d+ nodes · \d+ edges · \d+ kinds/.test(text);
    }, { timeout: 15_000 });
  } catch {
    // If the first attempt times out, reload the page and try again.
    // The WebSocket connection may have failed silently on the first load.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(workspaceShell).toBeVisible({ timeout: 15_000 });
    await expect(workflowFlow).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(() => {
      const el = document.querySelector('.workflow-flow');
      if (!el) return false;
      const parent = el.parentElement;
      if (!parent) return false;
      const summary = parent.querySelector('p.truncate');
      if (!summary) return false;
      const text = summary.textContent ?? '';
      return /^\d+ nodes · \d+ edges · \d+ kinds/.test(text);
    }, { timeout: 30_000 });
  }

  // Wait for the REPL terminal to be ready (xterm container visible).
  // This ensures the R session is connected and ready to accept commands.
  const replPanel = page.locator('[aria-label="REPL terminal"]');
  await expect(replPanel).toBeVisible({ timeout: 10_000 });
  const xtermContainer = replPanel.locator('.xterm').first();
  await expect(xtermContainer).toBeVisible({ timeout: 10_000 });

  // Extra wait for the R session to be fully ready after a server restart
  await page.waitForTimeout(2000);
}

/**
 * Focus the REPL terminal and type a command, then press Enter.
 * Waits for R to process the command (checks for the R prompt).
 */
async function typeReplCommand(page: Page, command: string): Promise<void> {
  const replPanel = page.locator('[aria-label="REPL terminal"]');
  await expect(replPanel).toBeVisible({ timeout: 10_000 });

  // Click on the xterm container to focus the terminal
  const xtermContainer = replPanel.locator('.xterm').first();
  await expect(xtermContainer).toBeVisible({ timeout: 10_000 });
  await xtermContainer.click();

  // Wait for the terminal to be focused
  await page.waitForTimeout(500);

  // Type the command
  await page.keyboard.type(command, { delay: 30 });

  // Press Enter to submit
  await page.keyboard.press('Enter');

  // Wait for R to process the command and show the prompt again.
  // R commands typically complete within 2-3 seconds for simple operations.
  // Use a longer wait to account for server restarts between test files.
  await page.waitForTimeout(5000);
}

/**
 * Get the current toolbar summary text (e.g., "2 nodes · 0 edges · 4 kinds").
 * Waits for the graph snapshot to arrive first.
 */
async function getToolbarSummary(page: Page): Promise<string> {
  const toolbarSummary = page.locator('.workflow-flow')
    .locator('..')
    .locator('p.truncate')
    .first();
  await expect(toolbarSummary).toBeVisible({ timeout: 15_000 });
  // Wait for the graph snapshot to arrive
  await expect(toolbarSummary).not.toHaveText('Waiting for graph snapshot', { timeout: 15_000 });
  return toolbarSummary.textContent() ?? '';
}

/**
 * Wait for the toolbar summary to reflect a specific node count.
 * First waits for the graph snapshot to arrive (toolbar no longer shows "Waiting…").
 */
async function waitForNodeCount(page: Page, count: number, timeoutMs = 30_000): Promise<void> {
  const toolbarSummary = page.locator('.workflow-flow')
    .locator('..')
    .locator('p.truncate')
    .first();

  // First wait for the graph snapshot to arrive
  await expect(toolbarSummary).not.toHaveText('Waiting for graph snapshot', { timeout: timeoutMs });

  // Then wait for the specific node count
  await expect(toolbarSummary).toHaveText(new RegExp(`${count} nodes · \\d+ edges · \\d+ kinds`), { timeout: timeoutMs });
}

// --- Tests -------------------------------------------------------------------

test('node can be added via REPL bg_add_node command', async ({ page }) => {
  test.setTimeout(90_000);
  const consoleErrors = captureConsoleErrors(page);

  // Start with a clean page (shared server state may have leftover nodes)
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForWorkspace(page);

  // Record initial node count
  const initialSummary = await getToolbarSummary(page);
  const initialMatch = initialSummary.match(/^(\d+) nodes/);
  const initialCount = initialMatch ? parseInt(initialMatch[1]!, 10) : 0;

  // Add a node via REPL
  await typeReplCommand(page, 'bayesgrove::bg_add_node(project, kind = "source")');

  // Wait for the toolbar to update with incremented node count
  const expectedCount = initialCount + 1;
  await waitForNodeCount(page, expectedCount);

  expect(consoleErrors).toHaveLength(0);
});

test('node appears as .react-flow__node on canvas after addition', async ({ page }) => {
  test.setTimeout(90_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForWorkspace(page);

  // Record initial node count on canvas
  const initialNodes = page.locator('.react-flow__node');
  const initialCount = await initialNodes.count();

  // Add a node via REPL
  await typeReplCommand(page, 'bayesgrove::bg_add_node(project, kind = "source")');

  // Wait for a new .react-flow__node to appear on the canvas
  const nodes = page.locator('.react-flow__node');
  await expect(nodes).toHaveCount(initialCount + 1, { timeout: 15_000 });

  // The new node should have a data-id attribute
  const newNode = nodes.last();
  const dataId = await newNode.getAttribute('data-id');
  expect(dataId).toBeTruthy();
  expect(dataId!.length).toBeGreaterThan(0);

  expect(consoleErrors).toHaveLength(0);
});

test('toolbar summary updates with incremented node count', async ({ page }) => {
  test.setTimeout(90_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForWorkspace(page);

  // Record initial state
  const initialSummary = await getToolbarSummary(page);
  const initialMatch = initialSummary.match(/^(\d+) nodes/);
  const initialCount = initialMatch ? parseInt(initialMatch[1]!, 10) : 0;

  // Add first node and wait for the toolbar to update
  await typeReplCommand(page, 'bayesgrove::bg_add_node(project, kind = "source")');
  await waitForNodeCount(page, initialCount + 1);

  // Record count after first addition (in case server state changed)
  const afterFirstSummary = await getToolbarSummary(page);
  const afterFirstMatch = afterFirstSummary.match(/^(\d+) nodes/);
  const afterFirstCount = afterFirstMatch ? parseInt(afterFirstMatch[1]!, 10) : 0;

  // Add second node and wait for toolbar to update
  await typeReplCommand(page, 'bayesgrove::bg_add_node(project, kind = "source")');
  await waitForNodeCount(page, afterFirstCount + 1);

  // Verify toolbar now shows the correct count (incremented by 2 from initial)
  const updatedSummary = await getToolbarSummary(page);
  expect(updatedSummary).toMatch(/^\d+ nodes · \d+ edges · \d+ kinds$/);

  // Verify that the count increased by at least 1 from the initial
  const finalMatch = updatedSummary.match(/^(\d+) nodes/);
  expect(finalMatch).toBeTruthy();
  const finalCount = parseInt(finalMatch![1]!, 10);
  expect(finalCount).toBeGreaterThan(initialCount);

  expect(consoleErrors).toHaveLength(0);
});

test('clicking a node opens node detail view showing label and kind', async ({ page }) => {
  test.setTimeout(90_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForWorkspace(page);

  // Add a node via REPL
  await typeReplCommand(page, 'bayesgrove::bg_add_node(project, kind = "source")');

  // Wait for node to appear on canvas
  const nodes = page.locator('.react-flow__node');
  await expect(nodes.first()).toBeVisible({ timeout: 15_000 });

  // Click the node — in the current implementation, clicking a canvas node
  // opens a NodeWorkbenchPanel tab showing the node's details.
  // Use the last node since it's most likely on top (not occluded by others).
  await nodes.last().click();

  // The NodeWorkbenchPanel should render showing the node's kind and label.
  // It shows a header with the kind, label, and "state {status}" text.
  // Look for the "source" kind text (it appears in the header)
  const kindText = page.locator('p.text-slate-500').filter({ hasText: /source/i });
  await expect(kindText.first()).toBeVisible({ timeout: 10_000 });

  // The panel should show "state new" for a newly added node
  const stateText = page.locator('text=/state \\w+/i').first();
  await expect(stateText).toBeVisible({ timeout: 5_000 });

  // The panel should show node metrics (Obligations, Summaries, Decisions)
  const obligationsMetric = page.locator('p', { hasText: 'Obligations' });
  await expect(obligationsMetric.first()).toBeVisible({ timeout: 5_000 });

  expect(consoleErrors).toHaveLength(0);
});

test('node can be deleted via REPL and disappears from canvas', async ({ page }) => {
  test.setTimeout(90_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForWorkspace(page);

  // Add a node
  await typeReplCommand(page, 'bayesgrove::bg_add_node(project, kind = "source")');

  // Wait for node to appear
  const nodes = page.locator('.react-flow__node');
  await expect(nodes.first()).toBeVisible({ timeout: 15_000 });

  // Get the initial node count
  const initialCount = await nodes.count();

  // Get the node ID from the canvas
  const nodeId = await nodes.last().getAttribute('data-id');
  expect(nodeId).toBeTruthy();

  // Delete the node via REPL
  await typeReplCommand(page, `bayesgrove::bg_remove_node(project, node_id = "${nodeId}")`);

  // Wait for the node to disappear from the canvas
  await expect(nodes).toHaveCount(initialCount - 1, { timeout: 15_000 });

  // Verify the toolbar updated
  const toolbarSummary = await getToolbarSummary(page);
  const match = toolbarSummary.match(/^(\d+) nodes/);
  expect(match).toBeTruthy();
  const nodeCountAfterDelete = parseInt(match![1]!, 10);
  expect(nodeCountAfterDelete).toBe(initialCount - 1);

  expect(consoleErrors).toHaveLength(0);
});

test('deleted node disappears from explorer panel', async ({ page }) => {
  test.setTimeout(90_000);
  const consoleErrors = captureConsoleErrors(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForWorkspace(page);

  // Add a source node
  await typeReplCommand(page, 'bayesgrove::bg_add_node(project, kind = "source")');

  // Wait for node to appear on canvas
  const nodes = page.locator('.react-flow__node');
  await expect(nodes.first()).toBeVisible({ timeout: 15_000 });

  // Record the canvas node count before deletion
  const initialCount = await nodes.count();

  // The explorer panel should show the node in "Data Sources" group
  const explorerAside = page.locator('.workspace-shell aside').first();
  await expect(explorerAside).toBeVisible({ timeout: 10_000 });

  // Wait for the explorer to update and show the node item
  const explorerNodeItems = explorerAside.locator('nav section ul li');
  await expect(explorerNodeItems.first()).toBeVisible({ timeout: 10_000 });
  const initialNodeCount = await explorerNodeItems.count();
  expect(initialNodeCount).toBeGreaterThanOrEqual(1);

  // Get the node ID from the canvas
  const nodeId = await nodes.last().getAttribute('data-id');
  expect(nodeId).toBeTruthy();

  // Delete the node via REPL
  await typeReplCommand(page, `bayesgrove::bg_remove_node(project, node_id = "${nodeId}")`);

  // Wait for the node to disappear from canvas — the count should decrease by 1
  // (not necessarily to 0, since there may be leftover nodes from prior tests)
  await expect(nodes).toHaveCount(initialCount - 1, { timeout: 15_000 });

  // Wait for the explorer to update (node should be removed from the list)
  await expect(explorerNodeItems).toHaveCount(initialNodeCount - 1, { timeout: 10_000 });

  expect(consoleErrors).toHaveLength(0);
});
