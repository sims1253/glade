# Changelog

## 0.4.0 - 2026-03-08

- Added the phase 4 interactive graph workflow with server-validated add, connect, rename, delete, selection, confirmation, and toast flows on the React canvas.
- Added end-to-end server integration coverage for interactive graph mutations against a real `bg_serve()` session, plus more focused web tests for command dispatch and graph interactions.
- Hardened the websocket startup path and split CI so portable tests run cross-platform while Ubuntu provisions R and installs `bayesgrove` for the server integration job.

## 0.3.0 - 2026-03-08

- Added the phase 3 workflow canvas with React Flow node renderers, ELK-based DAG layout, and live graph-store hydration from protocol snapshots.
- Added frontend graph tests covering node rendering, layout stability, and snapshot/store synchronization.

## 0.2.0 - 2026-03-08

- Added the phase 2 bayesgrove bridge with typed protocol contracts, command routing, R session management, and frontend websocket broadcasting.
- Added durable graph-state caching plus integration coverage for cache persistence and real `bg_serve()` command dispatch.

## 0.1.0 - 2026-03-08

- Bootstrapped the Glade monorepo with the Electron desktop shell, Bun server, React web app, shared contracts, and CI automation.
