# Glade

Glade is the desktop-first GUI for bayesgrove.

Current release: `0.12.0`

Phase status: the phase 13 desktop-first realignment pass is implemented.
The app now includes:

- mockup-driven three-column workspace shell with persistent explorer, center tabs, persistent inspector, and docked shared-session REPL
- workflow canvas
- protocol-driven inspector actions and obligations
- node detail drawer
- dedicated `/settings` and `/terminal` routes on a shared renderer session provider
- schema-driven parameter forms for Bayesgrove-described nodes
- desktop first-launch checks for R and `bayesgrove`, persisted Electron settings, and user-confirmed update flow
- staged release artifact builds for desktop installers

The current release completes the desktop-first Bayesgrove realignment: hosted mode, Glade-owned non-R execution, and the old extension-platform/runtime surfaces are removed, while the client contracts and workspace UX stay focused on the local Bayesgrove workflow.

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

The root dev runner auto-selects free app-server and `bg_serve()` ports when the defaults are already occupied.

Desktop-specific smoke coverage:

```bash
bun run --cwd apps/desktop smoke-test:repl-detach
bun run --cwd apps/desktop smoke-test:bayesgrove
```

Desktop packaging bundle for the current platform:

```bash
bun run build:desktop-bundle
```

Build desktop release artifacts for the current platform:

```bash
bun run build:desktop:artifact
```

Run the release smoke path without signing or publishing:

```bash
bun run release:smoke
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
