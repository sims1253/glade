# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks, platform-specific notes.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Required External Dependencies

| Dependency | Version | How to Check |
|---|---|---|
| Bun | >= 1.3.0 | `bun --version` |
| R | >= 4.5.0 | `Rscript --version` |
| bayesgrove R package | latest | `Rscript -e "library(bayesgrove)"` |
| cmdstanr R package | latest | `Rscript -e "library(cmdstanr)"` |
| CmdStan | >= 2.35.0 | `Rscript -e "cmdstanr::cmdstan_path()"` |
| Playwright | >= 1.58.0 | `npx playwright --version` |

## Server Environment Variables

| Variable | Required | Description |
|---|---|---|
| `BAYESGROVE_APP_ROOT` | Yes | Repository root path |
| `BAYESGROVE_PROJECT_PATH` | Yes | Bayesgrove project directory (temp) |
| `BAYESGROVE_STATE_DIR` | Yes | Server state directory (temp) |
| `BAYESGROVE_SERVER_PORT` | Yes | Backend server port (3100-3199) |
| `BAYESGROVE_R_PORT` | Yes | R bg_serve port (3100-3199, different from server) |
| `NODE_ENV` | Yes | Must be `production` for server |

## Key Quirks

- Stan model compilation happens on first `cmdstanr::cmdstan_model()` call and takes 10-30s
- The R process communicates via stdin/stdout, not HTTP. The `BAYESGROVE_R_PORT` is passed to `bg_serve()` for its internal polling
- The centered Eight Schools model reliably produces ~291 divergences — this is expected, not a bug
- Executor registration (`bg_register_node_kind`) is an R-side operation, not a WebSocket command
- Executor closures capture variables from the R session where they were registered. If executors are registered in an init Rscript but bg_serve runs in a different session, captured variables (like `stan_file`) won't be available. **Workaround:** Register executors via the REPL in the bg_serve session after startup.
- The installed bayesgrove package (0.5.1) does NOT include `bg_submit` in its command schema. The `bg_run` command is available but has a bug: `jsonlite::fromJSON(message, simplifyVector=FALSE)` in `bg_parse_command_message` converts JSON arrays to R lists, not character vectors. This causes `bg_run(targets=["node_id"])` via bg_serve WebSocket to fail with "targets must be a character vector of node ids." **Workaround:** Call `bg_run` via the REPL (`repl.write` WebSocket method) instead of through the bg_serve command protocol.
- There is no `workflow.executeCommand` RPC method on the Bun server. The only ways to interact with bayesgrove are: (1) specific `workflow.*` methods (addNode, deleteNode, etc.), (2) `workflow.executeAction` for protocol actions, and (3) `repl.write` for arbitrary R commands.
- Pre-existing typecheck errors exist in test files (`desktop-preflight.test.ts`, `editor-preferences.test.ts`, `runtime.test.ts`) due to DesktopSettings contract changes. These don't affect test execution.
- The REPL does not auto-load bayesgrove into the global namespace. Functions must be called with the `bayesgrove::` prefix (e.g., `bayesgrove::bg_add_node(...)` instead of `bg_add_node(...)`).
- REPL commands sent while a long-running R command is active (e.g., `bg_run` sampling) get appended to the running input and cause syntax errors. Automation must wait for a clean R prompt (`> `) before sending new commands.
- The Vite dev server proxies WebSocket connections to the backend using the `BAYESGROVE_SERVER_PORT` env var. When unset, it defaults to port 7842 (incorrect). The web service in services.yaml must set `BAYESGROVE_SERVER_PORT=3100` for correct proxy behavior.
