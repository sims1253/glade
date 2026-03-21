---
name: pipeline-test-worker
description: Writes Playwright E2E tests for the full Bayesian analysis pipeline
---

# Pipeline Test Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features in the "Full Bayesian Pipeline Tests" milestone. Use when the task involves:
- Writing end-to-end tests for Bayesian model fitting through the GUI
- Testing HMC diagnostic results and protocol obligations
- Testing cross-area flows (app load → full workflow → state preservation)

## Required Skills

- `agent-browser` — for manual verification of pipeline tests

## Work Procedure

### 1. Understand the test infrastructure

Read the fixtures:
- `e2e/fixtures/project-setup.ts` — bayesgrove project setup with registered executors
- `e2e/fixtures/server.ts` — server lifecycle
- `e2e/fixtures/websocket.ts` — WebSocket interaction
- `e2e/fixtures/models/eight_schools.stan` — Stan model fixture

### 2. Understand the bayesgrove protocol

Key concepts:
- Executor registration happens in R (via REPL or Rscript), NOT via WebSocket commands
- Node addition: `bg_add_node` bayesgrove command sent through WebSocket
- Node connection: `bg_connect` bayesgrove command
- Execution: `bg_submit` bayesgrove command (async) — the GUI uses `workflow.executeAction` RPC
- Results arrive as `workflow.snapshot` pushes with updated node data
- Protocol events arrive as `workflow.event` pushes
- The centered Eight Schools model produces divergences (expected behavior)

### 3. Write tests using TDD

For each test:
1. Write the test FIRST (red phase)
2. Run to confirm it fails for the right reason
3. Fix or implement to make it pass (green phase)

### 4. Pipeline test patterns

**Creating a workflow via WebSocket commands:**
```typescript
// Add data node
const addDataResult = await ws.sendCommand('workflow.executeCommand', {
  command: 'bg_add_node',
  args: { kind: 'data', label: 'Eight schools data' }
});
// Add fit node connected to data
const addFitResult = await ws.sendCommand('workflow.executeCommand', {
  command: 'bg_add_node',
  args: { kind: 'fit', label: 'Centered fit', inputs: [dataNodeId], params: { stan_file: stanFilePath } }
});
// Connect nodes
await ws.sendCommand('workflow.executeCommand', {
  command: 'bg_connect',
  args: { from: dataNodeId, to: fitNodeId }
});
```

**Waiting for execution results:**
```typescript
// Submit execution
await ws.sendCommand('workflow.executeCommand', {
  command: 'bg_submit',
  args: { targets: [fitNodeId] }
});
// Wait for updated snapshot with completed node status
const updatedSnapshot = await ws.waitForMessage(
  msg => msg.message_type === 'GraphSnapshot' && msg.graph.nodes[fitNodeId]?.status !== 'new',
  120000 // 2 minute timeout for cmdstanr sampling
);
```

### 5. Required test coverage

Write tests for:
- Workflow creation from scratch (VAL-PIPELINE-001)
- Data node with Eight Schools data (VAL-PIPELINE-002)
- Fit node with Stan model (VAL-PIPELINE-003)
- Node connection (VAL-PIPELINE-004)
- Execution submission (VAL-PIPELINE-005)
- HMC diagnostic results (VAL-PIPELINE-006)
- Protocol obligations after execution (VAL-PIPELINE-007)
- Graph snapshot updates (VAL-PIPELINE-008)
- No console errors during pipeline (VAL-PIPELINE-009)
- Server health after pipeline (VAL-PIPELINE-010)
- Cross-area: app load to canvas renders (VAL-CROSS-001)
- Cross-area: state preserved across navigation (VAL-CROSS-002)
- Cross-area: full end-to-end Eight Schools cycle (VAL-CROSS-003)

### 6. Timeout considerations

Pipeline tests involving cmdstanr sampling are SLOW:
- Stan model compilation: ~10-30s (first time)
- MCMC sampling (2 chains, 500 warmup, 500 sampling): ~30-60s
- Use `test.setTimeout(180000)` (3 minutes) for pipeline tests
- Consider caching compiled Stan models between tests if possible

### 7. Verify

- Run `npx playwright test e2e/pipeline/` to verify pipeline tests
- Use `agent-browser` to manually verify at least the full E2E test (VAL-CROSS-003)
- Run `bun run typecheck` and `bun run lint`
- Verify no orphaned processes
- Verify no leftover temp directories

## Example Handoff

```json
{
  "salientSummary": "Wrote 13 Playwright E2E tests covering the full Bayesian pipeline: workflow creation, node lifecycle, execution, diagnostics, obligations, and 3 cross-area flows including the full Eight Schools analysis cycle. All tests pass.",
  "whatWasImplemented": "Created e2e/pipeline/ with tests for all VAL-PIPELINE and VAL-CROSS assertions. Tests use WebSocket commands to create workflows, submit execution via bg_submit, wait for cmdstanr results, and verify HMC diagnostics and protocol obligations appear in the GUI.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "npx playwright test e2e/pipeline/", "exitCode": 0, "observation": "All 13 pipeline tests passed" },
      { "command": "bun run typecheck", "exitCode": 0, "observation": "No type errors" },
      { "command": "bun run lint", "exitCode": 0, "observation": "No lint errors" },
      { "command": "lsof -i -P -n | grep -E '310[0-9]|5173'", "exitCode": 0, "observation": "No orphaned processes" }
    ],
    "interactiveChecks": [
      { "action": "Manually verified full E2E Eight Schools test via agent-browser", "observed": "Complete workflow from init to obligation display works correctly" }
    ]
  },
  "tests": {
    "added": [
      { "file": "e2e/pipeline/workflow-creation.spec.ts", "cases": [{ "name": "workflow created from scratch", "verifies": "VAL-PIPELINE-001" }, { "name": "data node with Eight Schools data", "verifies": "VAL-PIPELINE-002" }, { "name": "fit node with Stan model", "verifies": "VAL-PIPELINE-003" }, { "name": "nodes can be connected", "verifies": "VAL-PIPELINE-004" }] },
      { "file": "e2e/pipeline/execution.spec.ts", "cases": [{ "name": "execution can be submitted", "verifies": "VAL-PIPELINE-005" }, { "name": "HMC diagnostics returned", "verifies": "VAL-PIPELINE-006" }, { "name": "obligations surface after execution", "verifies": "VAL-PIPELINE-007" }, { "name": "graph snapshot updates", "verifies": "VAL-PIPELINE-008" }, { "name": "no console errors during pipeline", "verifies": "VAL-PIPELINE-009" }, { "name": "server healthy after pipeline", "verifies": "VAL-PIPELINE-010" }] },
      { "file": "e2e/pipeline/cross-area.spec.ts", "cases": [{ "name": "app load to canvas renders nodes", "verifies": "VAL-CROSS-001" }, { "name": "state preserved across navigation", "verifies": "VAL-CROSS-002" }, { "name": "full end-to-end Eight Schools cycle", "verifies": "VAL-CROSS-003" }] }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- cmdstanr sampling fails or times out consistently
- Protocol obligations don't appear after execution (may be a bayesgrove version issue)
- WebSocket commands don't produce expected results
- Server crashes during pipeline execution
- Tests are too flaky or slow to be useful
