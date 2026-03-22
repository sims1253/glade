# Pipeline Tests

Key patterns and gotchas for writing pipeline E2E tests.

## WebSocket RPC Methods for Graph Operations

The Bun server exposes `workflow.*` RPC methods that translate to bayesgrove commands:

| Method | Body Shape | Bayesgrove Command |
|---|---|---|
| `workflow.addNode` | `{ _tag: 'workflow.addNode', kind, label?, inputs?, params?, metadata? }` | `bg_add_node` |
| `workflow.connectNodes` | `{ _tag: 'workflow.connectNodes', from, to, edgeType?, metadata? }` | `bg_connect` |
| `workflow.deleteNode` | `{ _tag: 'workflow.deleteNode', nodeId }` | `bg_remove_node` |
| `workflow.renameNode` | `{ _tag: 'workflow.renameNode', nodeId, label }` | `bg_update_node` |
| `repl.write` | `{ _tag: 'repl.write', data: string }` | Direct stdin write |

**Important:** The `repl.write` body uses `data` (not `text`), and the data MUST end with `\n` for R's `readLines` to return the line.

## Node IDs from RPC Responses

The `workflow.addNode` success response has an **undefined payload** — the node ID is NOT returned in the response. Instead, get the node ID by:
1. Getting the initial node IDs from the GraphSnapshot
2. Sending `workflow.addNode`
3. Waiting for a `workflow.snapshot` push with more nodes
4. Diffing the before/after node ID lists

## Raw Graph Snapshot Structure

GraphSnapshots are received via:
- `server.bootstrap` WsPush (embedded snapshot)
- `workflow.snapshot` WsPush

The `message_type === 'GraphSnapshot'` identifies them.

**Raw node fields:**
- `kind`: string (e.g., "data", "fit")
- `state`: string (e.g., "new", "ok", "warning") — NOT `status`
- `label`: string
- `id`: string (node ID)
- `block_reason`: string
- `metadata`: array
- `params`: array

**Raw edge fields:**
- `from`: source node ID
- `to`: target node ID

**Node kinds are available in:**
- `snapshot.availableNodeKinds` — flat array of kind names
- `snapshot.graph.registry.kinds` — object keyed by kind name

## Executor Registration Gotchas

1. **Must use REPL** (`repl.write`), not WebSocket commands — executor closures capture R session variables
2. **Must append `\n`** to the command text — R's `readLines` needs newline to return
3. **Wait for `__GLADE_READY__`** before sending REPL commands — the R process must finish `bg_serve()` startup
4. **No `\\` escaping for `$`** — in JS template literals, `$` doesn't need escaping (only `${...}` is special). Using `\\$` causes R parse errors.
5. **`bg_register_node_kind` with `input_contract`** — the default workflow registers fit kind with `input_contract` requiring "data". Re-registering without specifying `input_contract` keeps the old one. You CANNOT clear it with `input_contract = NULL` or `input_contract = list()` (bayesgrove rejects both).

## Fit Node Input Requirement

The default workflow's fit kind requires a "data" input. When adding a fit node via `workflow.addNode`, pass `inputs: [dataNodeId]` or the server returns "Unknown node kind: fit" / "missing required input_contract fields: data".

## bg_run Execution Limitations (bayesgrove 0.5.1)

**Critical:** `bg_run` executes nodes (runs the executor functions, performs MCMC sampling) but does **NOT** persist results to the graph nodes. After `bg_run`:
- Node states remain `"new"` in the graph snapshot
- Node `result` field is `undefined`/`null` in the snapshot
- Protocol obligations are NOT generated (the protocol engine doesn't see execution results)
- Jobs ARE created with `status: "succeeded"` and `result_ref` entries
- But `bg_result(handle, result_ref)` returns "No cached result available"

**Workaround:** Capture execution evidence from the REPL output:
- cmdstanr prints divergence warnings to the REPL (detectable via `repl.output`/`repl.rawOutput`)
- `bg_run` prints "Starting run", "Running node", "succeeded" status
- These can be parsed to verify execution happened and produced diagnostics

## REPL Completion Detection

The R prompt (`>`) is **NOT** sent via WebSocket messages. To detect when an R command completes:
1. Track the count of repl.output/repl.rawOutput messages
2. Wait for new messages to arrive (command processing started)
3. Wait for a silence period (**5s** with no new repl messages = command done) — 3s is insufficient for bg_run as MCMC chain outputs can have gaps longer than 3s between chains
4. **Do NOT** use `.some()` on accumulated messages — old messages will always match, causing the silence detection to never trigger

## bg_connect Uses Node IDs, Not Labels

`bg_connect(project, from=..., to=...)` requires node IDs (e.g., `"node_abc123"`), NOT labels. `bg_add_node` returns the node ID as a string (visible in REPL output like `[1] "node_abc123"`). If you pass a label, you get "Node <label> not found."

## bg_submit Not Available

`bg_submit` is not exported from bayesgrove 0.5.1. The only way to execute the workflow is via `bg_run(project)` through the REPL.

## Orphaned Vite Process After Test Runs

Playwright's `webServer` config (which starts Vite via `turbo run dev:web`) can become orphaned after test runs complete. Subsequent test runs with `reuseExistingServer: true` may fail if the orphaned Vite process is in a degraded state. Workaround: manually kill orphaned Vite processes on port 5173 before re-running tests, or set `reuseExistingServer: false` (slower but more reliable).
