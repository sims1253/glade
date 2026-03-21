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
