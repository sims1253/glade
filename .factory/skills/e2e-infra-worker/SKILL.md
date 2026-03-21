---
name: e2e-infra-worker
description: Sets up Playwright E2E test infrastructure for Glade
---

# E2E Infrastructure Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features in the "Playwright E2E Infrastructure" milestone. Use when the task involves:
- Setting up playwright.config.ts
- Creating shared test fixtures (project setup, server lifecycle, WebSocket)
- Creating Stan model fixture files
- Writing smoke tests for the E2E infrastructure

## Required Skills

None (this worker creates infrastructure, not GUI tests).

## Work Procedure

### 1. Install Playwright at root level

Check if `@playwright/test` is available at root. If not, install it:
```bash
cd /home/m0hawk/Documents/glade && bun add -d @playwright/test
```

### 2. Create playwright.config.ts

Create at repo root. The config must:
- Use `defineConfig` from `@playwright/test`
- Set `testDir: './e2e'`
- Configure `webServer` to start the Vite dev server on port 5173 with `reuseExistingServer: true` and timeout >= 30000
- Configure a `projects` entry for chromium (headless)
- Set `baseURL: 'http://localhost:5173'`
- Set `workers: 1` (tests share server infrastructure)
- Set reasonable timeouts (timeout: 60000 for normal, 120000 for pipeline tests)

### 3. Create test directory structure

```
e2e/
├── fixtures/
│   ├── models/
│   │   └── eight_schools.stan
│   ├── project-setup.ts
│   ├── server.ts
│   └── websocket.ts
├── smoke.spec.ts
└── support/
```

### 4. Create project-setup.ts fixture

Follow the pattern from `apps/server/test/integration-support.ts`:
- Export `createBayesgroveProject()` that creates temp dirs, runs `Rscript` to call `bg_init`, `bg_use_default_workflow`, and registers data/fit executors
- Export `cleanupProject()` that removes temp dirs
- Use `getAvailablePort()` from `@glade/shared/net` for port allocation
- Return `{ projectPath, stateDir, serverPort, rPort }`

### 5. Create server.ts fixture

- Export `startServer(config)` that spawns `bun run apps/server/src/index.ts` with required env vars
- Wait for `/health` endpoint using polling (match `waitFor()` from integration-support.ts)
- Return `{ port, rPort, child, stop() }`
- `stop()` must use `terminateProcessTree` from `@glade/shared/process`

### 6. Create websocket.ts fixture

- Export `connectWebSocket(port)` that opens `ws://127.0.0.1:<port>/ws`
- Provide `send(method, body)` for sending `WebSocketRequest` commands
- Provide `waitForMessage(predicate, timeout)` for awaiting specific messages
- Handle `WsPush` unpacking (reuse pattern from `integration-support.ts`)

### 7. Create eight_schools.stan fixture

Centered parameterization:
```stan
data {
  int<lower=1> J;
  vector[J] y;
  vector<lower=0>[J] sigma;
}
parameters {
  real mu;
  real<lower=0> tau;
  vector[J] theta;
}
model {
  mu ~ normal(0, 5);
  tau ~ normal(0, 1);
  theta ~ normal(mu, tau);
  y ~ normal(theta, sigma);
}
```

### 8. Create smoke.spec.ts

Write a basic smoke test that:
1. Starts the server using the fixture
2. Opens the browser and navigates to `baseURL`
3. Asserts the page loads (check for workspace shell element)
4. Verifies no console errors
5. Cleans up

### 9. Verify

- Run `npx playwright test --list` to verify config
- Run `npx playwright test e2e/smoke.spec.ts` to verify the smoke test works
- Run `bun run typecheck` to verify no type errors
- Run `bun run lint` to verify no lint errors

## Example Handoff

```json
{
  "salientSummary": "Set up complete Playwright E2E test infrastructure at e2e/. Created playwright.config.ts, shared fixtures for project setup/server/WebSocket, Eight Schools Stan model, and a passing smoke test. All verified with typecheck and lint.",
  "whatWasImplemented": "Created e2e/ directory with playwright.config.ts, fixtures/project-setup.ts (bayesgrove project init + executor registration), fixtures/server.ts (server lifecycle with health check), fixtures/websocket.ts (WS connection with command send + message await), fixtures/models/eight_schools.stan, and smoke.spec.ts.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "npx playwright test --list", "exitCode": 0, "observation": "Config valid, 1 test listed" },
      { "command": "npx playwright test e2e/smoke.spec.ts", "exitCode": 0, "observation": "Smoke test passed" },
      { "command": "bun run typecheck", "exitCode": 0, "observation": "No type errors" },
      { "command": "bun run lint", "exitCode": 0, "observation": "No lint errors" }
    ],
    "interactiveChecks": []
  },
  "tests": {
    "added": [
      { "file": "e2e/smoke.spec.ts", "cases": [{ "name": "app loads and workspace renders", "verifies": "Vite serves the app, workspace shell is present, no console errors" }] }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- `@playwright/test` cannot be installed or configured
- R/bayesgrove/cmdstanr are not available for the project setup fixture
- Server cannot be started programmatically from tests
