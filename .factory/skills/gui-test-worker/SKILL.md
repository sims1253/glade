---
name: gui-test-worker
description: Writes Playwright E2E tests for Glade GUI workflow interactions
---

# GUI Test Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features in the "GUI Workflow Tests" milestone. Use when the task involves:
- Writing Playwright tests for the GUI's workflow management
- Testing graph canvas, explorer panel, inspector panel, REPL
- Testing command palette, settings page, node lifecycle

## Required Skills

- `agent-browser` — for manual verification of GUI tests

## Work Procedure

### 1. Understand the test infrastructure

Read the fixtures created in the E2E infrastructure milestone:
- `e2e/fixtures/project-setup.ts` — how to create bayesgrove projects
- `e2e/fixtures/server.ts` — how to start/stop the server
- `e2e/fixtures/websocket.ts` — how to send WebSocket commands

### 2. Write tests using TDD

For each test:
1. Write the test FIRST (red phase) — the test should fail initially
2. Run it to confirm it fails for the right reason
3. If the test passes immediately, it's not testing the right thing or the assertion is too weak

### 3. Test structure

Each test file should:
- Use Playwright's `test` from `@playwright/test`
- Import fixtures from `e2e/fixtures/`
- Start the server in a `beforeAll` hook
- Stop the server in an `afterAll` hook
- Clean up temp dirs in `afterAll`
- Use `test.setTimeout(60000)` for normal tests

### 4. Key selectors (from codebase analysis)

- Workspace shell: the main container wrapping the app
- Canvas: `.workflow-flow` (React Flow wrapper)
- Canvas nodes: `.react-flow__node`
- Canvas edges: `.react-flow__edge`
- Explorer panel: `aside` with project name header
- Explorer groups: buttons matching "Data Sources", "Models", "Fits", "Diagnostics", "Results"
- Inspector panel: `aside` with "Inspector" header
- Inspector tabs: `[role="tab"]` containing "Obligations" or "Actions"
- REPL terminal: `[aria-label="REPL terminal"]` or `.xterm`
- Command palette: `[role="dialog"][aria-modal="true"]`
- Settings page: `h1` containing "Desktop Bayesgrove environment"
- Node detail drawer: slides in from right when node is clicked

### 5. REPL interaction

The REPL uses xterm.js. To type into it:
1. Click on the `.xterm` container to focus it
2. Use `page.keyboard.type('command text')` to type
3. Use `page.keyboard.press('Enter')` to submit
4. Wait for output by listening for `repl.output` WebSocket messages on the server side

### 6. Required test coverage

Write tests for:
- App loads and workspace renders (VAL-GUI-001)
- Graph canvas renders (VAL-GUI-002)
- Explorer panel structure (VAL-GUI-003)
- Inspector panel tabs (VAL-GUI-004)
- REPL terminal input/output (VAL-GUI-005)
- Command palette open/close/filter (VAL-GUI-006)
- Settings page renders (VAL-GUI-007)
- Node addition via REPL (VAL-GUI-008)
- Nodes appear on canvas (VAL-GUI-009)
- Connection status display (VAL-GUI-010)
- Node detail drawer (VAL-GUI-011)
- Node deletion (VAL-GUI-012)

### 7. Verify

- Run `npx playwright test e2e/gui/` to verify all GUI tests pass
- Use `agent-browser` to manually spot-check at least 3 tests
- Run `bun run typecheck` and `bun run lint`
- Verify no orphaned processes after test run

## Example Handoff

```json
{
  "salientSummary": "Wrote 12 Playwright E2E tests covering the full GUI surface: workspace layout, canvas rendering, explorer/inspector panels, REPL, command palette, settings, and node lifecycle (add, view detail, delete). All tests pass.",
  "whatWasImplemented": "Created e2e/gui/ directory with tests for all 12 VAL-GUI assertions. Tests use shared fixtures for server lifecycle and WebSocket interaction. REPL tests use keyboard.type() for xterm interaction. Explorer tests verify group structure and node status indicators.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "npx playwright test e2e/gui/", "exitCode": 0, "observation": "All 12 GUI tests passed" },
      { "command": "bun run typecheck", "exitCode": 0, "observation": "No type errors" },
      { "command": "bun run lint", "exitCode": 0, "observation": "No lint errors" }
    ],
    "interactiveChecks": [
      { "action": "Manually verified workspace layout test via agent-browser", "observed": "Three-panel layout renders correctly" },
      { "action": "Manually verified REPL test via agent-browser", "observed": "Commands type and output appears" },
      { "action": "Manually verified node deletion test via agent-browser", "observed": "Node removed from canvas and explorer after delete" }
    ]
  },
  "tests": {
    "added": [
      { "file": "e2e/gui/workspace.spec.ts", "cases": [{ "name": "workspace renders with canvas and panels", "verifies": "VAL-GUI-001" }] },
      { "file": "e2e/gui/canvas.spec.ts", "cases": [{ "name": "graph canvas renders React Flow container", "verifies": "VAL-GUI-002" }] },
      { "file": "e2e/gui/explorer.spec.ts", "cases": [{ "name": "explorer shows node groups", "verifies": "VAL-GUI-003" }] },
      { "file": "e2e/gui/inspector.spec.ts", "cases": [{ "name": "inspector has obligations and actions tabs", "verifies": "VAL-GUI-004" }] },
      { "file": "e2e/gui/repl.spec.ts", "cases": [{ "name": "REPL accepts input and shows output", "verifies": "VAL-GUI-005" }] },
      { "file": "e2e/gui/command-palette.spec.ts", "cases": [{ "name": "command palette opens with Ctrl+K", "verifies": "VAL-GUI-006" }] },
      { "file": "e2e/gui/settings.spec.ts", "cases": [{ "name": "settings page renders form fields", "verifies": "VAL-GUI-007" }] },
      { "file": "e2e/gui/node-lifecycle.spec.ts", "cases": [{ "name": "node can be added via REPL", "verifies": "VAL-GUI-008" }, { "name": "nodes appear on canvas", "verifies": "VAL-GUI-009" }, { "name": "node detail drawer opens on click", "verifies": "VAL-GUI-011" }, { "name": "node can be deleted", "verifies": "VAL-GUI-012" }] },
      { "file": "e2e/gui/connection-status.spec.ts", "cases": [{ "name": "connection status displays correctly", "verifies": "VAL-GUI-010" }] }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- A GUI component cannot be tested because it doesn't render or has no selectable elements
- The REPL cannot be interacted with via Playwright keyboard events
- Server doesn't start or WebSocket doesn't connect in test context
- Multiple tests fail due to shared state (port conflicts, process leaks)
