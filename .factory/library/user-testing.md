# User Testing

Testing surface, required testing skills/tools, and resource cost classification.

## Validation Surface

**Primary surface:** Web browser (Chromium via Playwright or agent-browser)
**URL:** `http://localhost:5173` (Vite dev server)
**Secondary surface:** WebSocket at `ws://localhost:3100/ws` (backend server)

### What can be tested via browser
- Workspace layout and panel rendering
- Graph canvas (React Flow) interactions
- Explorer panel node grouping and status
- Inspector panel obligations and actions tabs
- REPL terminal (xterm.js) input/output
- Command palette open/close/filter
- Settings page form fields
- Node lifecycle (add, connect, delete)
- Node detail drawer
- Connection status banners
- Navigation and state preservation

### What requires WebSocket interception
- Verifying exact message formats (GraphSnapshot, ProtocolEvent)
- Checking diagnostic values (divergences, rhat_max)
- Confirming execution submission and completion
- Verifying protocol obligation data

### Limitations
- R process output cannot be directly inspected from the browser
- Stan model compilation time adds 10-30s to first pipeline test
- MCMC sampling adds 30-60s per execution test

## Validation Concurrency

**Surface:** agent-browser (Chromium)

**Per-instance resource cost:**
- Playwright Chromium: ~300MB
- Vite dev server (shared): ~200MB
- Bun backend server: ~200MB
- R process + cmdstanr: ~500MB
- **Total per instance: ~1.2GB**

**System resources:**
- Total RAM: 14 GiB
- Available: ~6.6 GiB
- Usable headroom (70%): ~4.6 GiB

**Max concurrent validators: 3**
(3 × 1.2GB = 3.6GB, fits within 4.6GB budget)

**Note:** Pipeline tests involving cmdstanr sampling should run sequentially (not in parallel) due to CPU-intensive Stan compilation and MCMC sampling. Only GUI-only tests can safely run in parallel.

## Flow Validator Guidance: browser

### Isolation Rules
- Each flow validator gets its own agent-browser session (e.g., `--session "dd8c626bc112__u1"`)
- Shared state: the backend server and R process are shared across all validators
- Validators that MUTATE graph state (add nodes, execute) MUST run sequentially — they share the same bayesgrove project
- Validators that only READ state (check layout, verify messages) can run concurrently

### Key Quirks for Subagents

1. **REPL handle variable**: `bayesgrove::bg_active_handle()` does NOT exist. The correct variable is `project` (set by the Bun server's R startup expression). Use `project` directly in REPL commands.

2. **WebSocket frame capture**: JavaScript `window.WebSocket` override does NOT survive page navigation (from about:blank to app URL). Use Python `websockets` library to connect directly to `ws://127.0.0.1:3100/ws` for reliable frame capture.

3. **Vite HMR warnings**: WebSocket connection warnings to `ws://localhost:5173/ws` are Vite HMR-related, NOT application errors. The app WebSocket is at `ws://127.0.0.1:3100/ws`.

4. **REPL timing**: Wait for the R prompt (`> `) between REPL commands. Commands sent during long-running R operations get appended and cause syntax errors.

5. **bg_run execution time**: `bayesgrove::bg_run(project)` takes ~90s total (10-30s Stan compilation + 30-60s MCMC sampling). Be patient.
