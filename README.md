# Glade

Glade is the desktop and browser-based GUI for bayesgrove.

Current release: `0.8.0`

Phase status: phase 8 is implemented.
The app now includes:

- workflow canvas
- protocol panels
- node detail drawer
- shared-session R REPL terminal
- schema-driven extension forms
- lazy GUI extension loading from trusted local bundles

Phase 8 also adds an extension registry flowing through the snapshot/cache layers, a schema-backed `UpdateNodeParameters` command path, and a sample extension package at [`examples/test-extension`](/home/m0hawk/Documents/glade/examples/test-extension).

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

Server integration coverage with a real R/bayesgrove session:

```bash
bun run --cwd apps/server test:integration
```

## Validation

```bash
bun run lint
bun run typecheck
bun run build
bun run test
```
