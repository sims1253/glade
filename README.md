# Glade

Glade is the desktop and browser-based GUI for bayesgrove.

Current release: `0.7.0`

Phase status: phase 7 is implemented.
The app now includes the workflow canvas, protocol panels, node detail drawer, and a shared-session R REPL terminal with hosted-mode read-only behavior and Electron detach support.

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
