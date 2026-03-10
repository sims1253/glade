# Glade

Glade is the desktop and browser-based GUI for bayesgrove.

Current release: `0.11.7`

Phase status: phase 10 is implemented.
The app now includes:

- mockup-driven three-column workspace shell with persistent explorer, center tabs, persistent inspector, and docked shared-session REPL
- workflow canvas
- protocol-driven inspector actions and obligations
- node detail drawer
- dedicated `/settings` and `/terminal` routes on a shared renderer session provider
- schema-driven extension forms
- lazy GUI extension loading from trusted local bundles
- Bun-executed multi-runtime nodes (`uvx`, `bunx`, `binary`, `shell`) with first-run confirmation for non-local extensions
- desktop first-launch checks for R and `bayesgrove`, persisted Electron settings, and user-confirmed update flow
- packaging/release scaffolding for Electron installers plus standalone Bun server binaries

Phase 10 adds the packaging layer around the phase 9 runtime work: the desktop app now persists its local environment settings in Electron `userData`, checks for `Rscript` and the `bayesgrove` package on launch, and includes release scripts/config for Electron installers and standalone compiled server artifacts.

## Workspace

- `apps/desktop` — Electron shell
- `apps/server` — Bun/Effect orchestrator
- `apps/web` — React/Vite frontend
- `packages/contracts` — shared Effect Schema protocol types
- `packages/shared` — shared constants and utilities

## Development

```bash
bun install
bun run dev
```

Hosted/browser development with a local Bun server:

```bash
BAYESGROVE_PROJECT_PATH=/tmp/glade-manual bun run dev:hosted
```

Both root runners (`dev` and `dev:hosted`) now select free app-server and `bg_serve()` ports automatically when the defaults are already occupied.

Desktop-specific smoke coverage:

```bash
bun run --cwd apps/desktop smoke-test:repl-detach
bun run --cwd apps/desktop smoke-test:bayesgrove
```

Desktop packaging bundle for the current platform:

```bash
bun run build:desktop-bundle
```

Create installers with `electron-builder` after dependencies are installed:

```bash
bun run --cwd apps/desktop dist
```

Server integration coverage with a real R/bayesgrove session:

```bash
bun run --cwd apps/server test:integration
```

Standalone compiled server artifact for hosted deployment:

```bash
bun run build:server:standalone
```

Run the standalone server in hosted mode with an existing bayesgrove project:

```bash
TARGET=linux-x64
BAYESGROVE_PROJECT_PATH=/path/to/project \
BAYESGROVE_R_PATH=/usr/bin/Rscript \
BAYESGROVE_SERVER_PORT=7842 \
./dist/standalone/$TARGET/glade-server
```

On Windows, use `glade-server.exe`. After startup, open the server URL displayed in the terminal.

## Validation

```bash
bun run lint
bun run typecheck
bun run build
bun run test
```
