# Glade

Glade is the desktop and browser-based GUI for bayesgrove.

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

## Validation

```bash
bun run lint
bun run typecheck
bun run build
bun run test
```
