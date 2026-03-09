# Glade

Glade is the desktop and browser-based GUI for bayesgrove.

Current release: `0.9.0`

Phase status: phase 9 is implemented.
The app now includes:

- workflow canvas
- protocol panels
- node detail drawer
- shared-session R REPL terminal
- schema-driven extension forms
- lazy GUI extension loading from trusted local bundles
- Bun-executed multi-runtime nodes (`uvx`, `bunx`, `binary`, `shell`) with first-run confirmation for non-local extensions

Phase 9 extends the extension registry with runtime execution descriptors, adds a direct `ExecuteNode` path for non-R nodes, and includes sample extension packages at [`examples/test-extension`](/home/m0hawk/Documents/glade/examples/test-extension) plus an optional addon-style example at [`examples/elicito-node-pack`](/home/m0hawk/Documents/glade/examples/elicito-node-pack).

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
