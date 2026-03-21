---
name: explorer-worker
description: Manually explores Glade via the GUI to perform Bayesian workflows and fix bugs encountered
---

# Explorer Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features in the "Manual Exploration & Bug Fixes" milestone. Use when the task involves:
- Starting the full Glade stack (Vite + Bun server + R process)
- Interacting with the GUI via agent-browser
- Creating Bayesian workflows through the GUI
- Identifying and fixing bugs found during manual exploration

## Required Skills

- `agent-browser` — for GUI interaction, screenshots, and browser automation
- `tuistory` — for terminal interaction if needed (starting servers, running R commands)

## Work Procedure

### 1. Start the full stack

1. Start the Vite web dev server:
   ```bash
   cd /home/m0hawk/Documents/glade && bun run dev:web &
   ```
   Wait for port 5173 to be ready (curl or health check).

2. Create a temp bayesgrove project:
   ```bash
   PROJECT_PATH=$(mktemp -d) && STATE_DIR=$(mktemp -d)
   ```
   Initialize via Rscript:
   ```bash
   Rscript -e "
   library(bayesgrove)
   handle <- bayesgrove::bg_init(path='$PROJECT_PATH', project_name='exploration-test')
   bayesgrove::bg_use_default_workflow(handle)
   # Register executors for data and fit nodes
   stan_file <- file.path('$PROJECT_PATH', 'eight_schools.stan')
   writeLines(c(
     'data { int<lower=1> J; vector[J] y; vector<lower=0>[J] sigma; }',
     'parameters { real mu; real<lower=0> tau; vector[J] theta; }',
     'model { mu ~ normal(0,5); tau ~ normal(0,1); theta ~ normal(mu, tau); y ~ normal(theta, sigma); }'
   ), stan_file)
   bayesgrove::bg_register_node_kind(handle, 'data', executor = function(node, inputs) {
     list(J=8L, y=c(28,8,-3,7,-1,1,18,12), sigma=c(15,10,16,11,9,11,10,18))
   })
   bayesgrove::bg_register_node_kind(handle, 'fit', executor = function(node, inputs) {
     mod <- cmdstanr::cmdstan_model(stan_file, quiet=TRUE)
     fit <- mod\$sample(data=inputs[[1]], chains=2, parallel_chains=2, iter_warmup=500, iter_sampling=500, seed=42L, refresh=0)
     diag <- fit\$diagnostic_summary(quiet=TRUE)
     rhat_max <- max(fit\$summary()\$rhat, na.rm=TRUE)
     n_div <- sum(diag\$num_divergent)
     passed <- n_div == 0 && rhat_max < 1.01
     list(result=fit, summaries=list(list(summary_kind='hmc_diagnostics', passed=passed, severity=if(passed) 'ok' else 'warning', metrics=list(divergences=n_div, rhat_max=rhat_max))))
   })
   "
   ```

3. Start the backend server:
   ```bash
   BAYESGROVE_APP_ROOT=/home/m0hawk/Documents/glade \
   BAYESGROVE_PROJECT_PATH=$PROJECT_PATH \
   BAYESGROVE_STATE_DIR=$STATE_DIR \
   BAYESGROVE_SERVER_PORT=3100 \
   BAYESGROVE_R_PORT=3101 \
   NODE_ENV=production \
   bun run apps/server/src/index.ts &
   ```
   Wait for `curl -sf http://127.0.0.1:3100/health`.

### 2. Explore the GUI with agent-browser

1. Launch browser and navigate to `http://localhost:5173`
2. Take a screenshot of the initial state
3. Verify the workspace shell, canvas, explorer, inspector, and REPL panels render
4. Check browser console for errors
5. Wait for WebSocket connection (session status becomes `ready`)

### 3. Walk through the Eight Schools workflow

1. Use the REPL to interact with bayesgrove:
   - Type commands into the xterm terminal
   - Verify output appears correctly
2. Add a data node via REPL or canvas context menu
3. Add a fit node and connect it to the data node
4. Submit execution
5. Wait for execution to complete (may take 30-60s for cmdstanr sampling)
6. Verify diagnostic results appear
7. Check that protocol obligations surface in the inspector

### 4. Fix bugs encountered

For each bug found:
1. Document the bug (what was expected, what happened, how to reproduce)
2. Investigate the root cause by reading relevant source files
3. Implement the fix
4. Verify the fix by re-testing the affected flow
5. Run `bun run typecheck` and `bun run lint` after each fix
6. Run `bun run test` to check for regressions

### 5. Cleanup

1. Kill all background processes:
   ```bash
   lsof -ti :5173 | xargs kill -9 2>/dev/null
   lsof -ti :3100 | xargs kill -9 2>/dev/null
   lsof -ti :3101 | xargs kill -9 2>/dev/null
   ```
2. Remove temp directories:
   ```bash
   rm -rf $PROJECT_PATH $STATE_DIR
   ```

## Example Handoff

```json
{
  "salientSummary": "Successfully explored the full Glade stack end-to-end. Fixed 3 bugs: (1) WebSocket reconnection loop on initial load, (2) REPL not sending commands after session bootstrap, (3) Inspector obligation tab not updating after execution. All fixes verified with typecheck and lint passing.",
  "whatWasImplemented": "Fixed WebSocket reconnection issue in bayesgrove-socket.ts by adding proper connection state tracking. Fixed REPL command dispatch by ensuring repl.write is only called after session becomes ready. Fixed inspector obligation refresh by subscribing to workflow.event channel updates.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "bun run typecheck", "exitCode": 0, "observation": "All packages typecheck cleanly" },
      { "command": "bun run lint", "exitCode": 0, "observation": "No lint errors" },
      { "command": "bun run test", "exitCode": 0, "observation": "All existing tests pass" }
    ],
    "interactiveChecks": [
      { "action": "Navigate to http://localhost:5173 after starting full stack", "observed": "Workspace renders with canvas, explorer, inspector, REPL panels" },
      { "action": "Type '1 + 1' in REPL and press Enter", "observed": "REPL shows '[1] 2' output" },
      { "action": "Add data node via REPL bg_add_node command", "observed": "Node appears in explorer under 'Data Sources' and on canvas" },
      { "action": "Add fit node and connect to data node", "observed": "Edge renders on canvas, both nodes visible" },
      { "action": "Submit execution via bg_submit", "observed": "Fit node status updates, diagnostics appear in node detail" },
      { "action": "Check inspector obligations tab after execution", "observed": "review_computation_validity obligation visible" }
    ]
  },
  "tests": {
    "added": []
  },
  "discoveredIssues": [
    { "severity": "low", "description": "Stan model compilation takes ~15s on first use, slowing down test execution" }
  ]
}
```

## When to Return to Orchestrator

- The full stack cannot be started (missing R, bayesgrove, or cmdstanr)
- A bug is found that requires architectural changes beyond a simple fix
- The GUI is completely broken and cannot be interacted with
- Server crashes during normal operation and the root cause is unclear
