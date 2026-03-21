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
