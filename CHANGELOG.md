# Changelog

## 0.12.3 - 2026-03-11

- Removed the vouch-based pull request trust flow, deleting the dedicated workflow and letting integration coverage run directly in CI without label gating.
- Fixed the real Bayesgrove server integration tests to match the current websocket RPC/bootstrap message shapes, so the ungated CI path validates the desktop-mode session flows again.
- Hardened GitHub Actions by pinning `oven-sh/setup-bun` to `v2.1.3`, opting JavaScript actions into Node 24, installing the missing Linux desktop build dependencies, and adding release smoke coverage to CI.

## 0.12.2 - 2026-03-11

- Fixed guided Bayesgrove actions that require user input by preserving structured `invocation` metadata in `@glade/contracts`, rendering prompt/field inputs in `@glade/web`, validating required fields in the action preview, and submitting the collected values through the existing `workflow.executeAction` path.
- Fixed misleading local setup errors for existing Bayesgrove projects by having desktop preflight try `bg_open()` before `bg_init()`, while surfacing actionable `bg_open`/`bg_init` failure details in Settings when project preparation really fails.
- Extended contract, web, and server test coverage around invocation metadata decoding, inputful action execution, workflow-state updates after action completion, and desktop preflight success/failure reporting.

## 0.12.1 - 2026-03-11

- Fixed the browser smoke test for the desktop-first home screen so CI now asserts the current setup-required banner instead of stale onboarding copy.
- Rewrote the README as a user-facing product overview, removing internal development-process notes and focusing it on installation, requirements, and in-app workflow guidance.

## 0.12.0 - 2026-03-11

- Realigned Glade around the desktop-first Bayesgrove GUI path by removing hosted-mode flows, standalone hosted packaging, Glade-owned node execution, and the old extension-platform runtime surfaces across the server, web app, examples, and tests.
- Thinned the client around Bayesgrove-owned actions and the shared R session, simplifying REPL/editor behavior, node detail flows, and workspace copy so the app reads clearly as a local Bayesgrove operator surface.
- Hardened the shared contracts against the newer Bayesgrove snapshot semantics by narrowing passive legacy descriptor fields, accepting object-shaped extension registries plus `command_surface`, and extending contract/web tests to cover the updated protocol shape.

## 0.11.8 - 2026-03-10

- Replaced the tracked `electron-builder.yml` release path with a staged desktop artifact builder, runtime-generated packaging config, manual preflight/build/publish release workflow, and release smoke validation for rerunnable GitHub Releases.
- Fixed local source-first dev startup by running the TypeScript dev entrypoints with Bun, and surfaced the app version directly in the rebuilt web shell and settings UI.
- Hardened CI reliability after the phase 10 follow-up work by extending the standalone health test timeout to cover slower server startup on shared runners, while updating the README to match the new release flow.

## 0.11.7 - 2026-03-10

- Rebuilt the primary web shell around the phase 5 mockup model: `/` now uses a light three-column workspace with persistent explorer, tabbed center work area, persistent inspector, and a docked shared REPL.
- Added a root renderer-scoped `ServerSessionProvider`, moved shared desktop/settings/terminal access onto that session boundary, and introduced dedicated `/settings` and `/terminal` routes for the rebuilt shell.
- Fixed follow-up shell review issues by improving command palette and dialog accessibility, tightening inspector/tab interactions, updating detached-terminal fallback routing, and hardening related tests.

## 0.11.6 - 2026-03-10

- Implemented the phase 4 responsive workspace foundations by extracting a dedicated `WorkflowWorkspace`, moving layout decisions onto container measurements, and introducing shared workspace CSS layout tokens.
- Added reusable canvas toolbar, inspector, obligations/actions shells, and REPL presentation/layout helpers so constrained workspace modes keep key workflow controls reachable without viewport breakpoints.
- Fixed review follow-ups around workspace accessibility and responsiveness by wiring accessible inspector tabs with keyboard navigation and ensuring toolbar compactness recomputes when workflow summaries change.

## 0.11.5 - 2026-03-10

- Implemented the phase 3 desktop boundary refactor by replacing the broad Electron preload snapshot with a narrow native bridge plus typed WebSocket-owned desktop environment state.
- Moved desktop settings, preflight checks, and session environment runtime resolution into a server-owned environment service backed by `stateDir/settings.json`, while keeping updater behavior native-only.
- Fixed review follow-ups around updater/external-link error handling, safer desktop URL opening, editor-command cache invalidation, and clearer partial-success behavior when environment updates require a session restart.

## 0.11.4 - 2026-03-10

- Normalized the CI test topology around fast Linux-first validation, explicit browser and isolated desktop smoke coverage, and a trust-gated integration job.
- Added direct artifact and string assertions to ensure desktop bundle structure and native bridge integrity remain intact during CI.
- Prevented untrusted pull requests from executing high-cost integration tests by introducing `.github/VOUCHED` and `vouch:trusted` labels.

## 0.11.3 - 2026-03-10

- Added the phase 1 runtime hardening foundations: `@glade/shared` now provides reusable logging, networking, and process helpers, desktop/server runtimes persist rotating disk logs, and embedded desktop launches pass an explicit `BAYESGROVE_STATE_DIR`.
- Standardized the runtime/test toolchain around source-first resolution by adding shared Vitest aliases, moving duplicated runner/test helpers onto the shared runtime utilities, and removing the normal Turbo `test` -> `build` dependency.
- Fixed review follow-ups around runtime logging robustness by retrying the standalone server log assertion, handling fire-and-forget log write failures safely, preserving more useful failure diagnostics, and tightening shared log/readiness helpers.

## 0.11.2 - 2026-03-09

- Replaced the remaining legacy command bridge with typed websocket RPC/state plumbing across the server and web app, including safer JSON payload handling, session/bootstrap synchronization, and dedicated client-side stores for connection, REPL, toast, and UI preferences.
- Added shared supervised process-tree utilities for desktop and server runtimes, fixing buffered child-process tracking, timeout/termination behavior, reusable `@glade/shared/process` exports, and non-local tool execution/shutdown robustness.
- Hardened follow-up runtime behavior after review: REPL history is capped client-side, disconnect/session races and duplicate toast IDs are guarded, storage and shutdown failures are handled safely, and focused tests/contracts were tightened around process, action, and websocket flows.

## 0.11.1 - 2026-03-09

- Enforced Effect diagnostics across the active Effect packages: `apps/server`, `packages/contracts`, and `apps/web` now share a common `tsconfig.effect.json`, server-side Effect diagnostic debt was cleaned up, and CI now runs an explicit repo-level Effect diagnostics sweep.
- Fixed the remaining web/browser diagnostic path by replacing a websocket `JSON.parse(...)` call with `Schema.parseJson()` so the Playwright-backed browser test path stays clean under enforced Effect diagnostics.
- Fixed desktop smoke-test startup after the refactor by preventing `tsdown` from bundling the `electron` package into the main/preload output, so Electron resolves from its real installed package at runtime.

## 0.11.0 - 2026-03-09

- Reworked the monorepo development/tooling baseline: the root `scripts/` folder is now a typed workspace package, internal workspace exports resolve directly to source for faster cross-package feedback, Turbo no longer caches `typecheck`, and runtime/dependency versions are pinned for deterministic installs.
- Improved desktop-shell iteration speed: Electron main/preload now run under a real watch-and-restart loop during `dev`, replacing the previous one-shot desktop startup path.
- Enabled the Effect language service properly across the Effect-using packages, while keeping compile-time Effect diagnostics advisory so the repo gains editor/runtime support without blocking builds on the current server cleanup backlog.
- Added a first real-browser web smoke test with Vitest browser mode and Playwright, plus ignored generated screenshot output so failed browser assertions do not get committed accidentally.

## 0.10.1 - 2026-03-09

- Fixed the phase 10 CI and packaging follow-up issues: workspace package exports now resolve to built artifacts for Vite/Bun in CI, desktop/server build scripts handle spawn failures more defensively, and Electron build assets now live under `assets/desktop` with tighter macOS entitlements.
- Fixed desktop/runtime robustness after the initial phase 10 landing: embedded server startup fails fast when the child process dies, updater actions surface graceful error state, desktop log broadcasts are throttled, and persisted settings/loading paths handle malformed JSON and probe timeouts more safely.
- Fixed packaged and hosted validation gaps: websocket reconnect handling now ignores stale sockets, server tests wait for child shutdown before removing sqlite state on Windows, and the release workflow now captures the intended artifacts while also publishing standalone server builds for Linux, macOS, and Windows.

## 0.10.0 - 2026-03-09

- Added the phase 10 packaging and distribution layer: Electron desktop settings are now persisted in `userData`, first-launch R/`bayesgrove` checks surface guided remediation in-app, and the desktop shell can restart its embedded server after local environment changes.
- Added release scaffolding for signed desktop installers and standalone compiled server binaries, including `electron-builder` configuration, icon generation from a single SVG source, platform-aware server bundling, and a tag-triggered GitHub Actions release workflow.
- Added frontend recovery work for the packaged desktop path: websocket reconnection now survives embedded server restarts, the phase 10 settings/update UI is surfaced in-app, and focused tests cover the new onboarding and reconnect flows.

## 0.9.0 - 2026-03-09

- Added phase 9 multi-runtime node execution with typed extension descriptors for `r_session`, `uvx`, `bunx`, `binary`, and guarded `shell` runtimes.
- Added Bun-side tool execution with JSON file/stdin serializers, JSON file/stdout parsers, persisted output artifacts plus content hashes, and clearer missing-tool/timeout/non-zero-exit errors.
- Added a direct `ExecuteNode` command path and node drawer execution controls for non-R extension nodes, including first-run confirmation for non-local extension packages.
- Added a worked optional-addon `examples/elicito-node-pack` extension and focused coverage for descriptor normalization, node execution planning, and tool runtime behavior.

## 0.8.1 - 2026-03-09

- Cleaned up the phase 8 extension boundary so `GraphSnapshot` now carries only canonical `extension_registry` data, with shared contract-side normalization used by both server and web.
- Fixed Layer 2 extension bundle loading in the browser by exposing host React runtime shims through a local import map, so trusted GUI bundles can resolve `react` and JSX runtime imports outside Vite.
- Refactored the schema-driven fallback form onto `react-hook-form`, added stable array field handling, integer-aware coercion, explicit submit-error affordances, and safer non-submit button behavior inside the generic extension UI.
- Reduced extension bundle cache churn by memoizing repeated identical registry snapshots instead of re-running the full file-system cache path on every broadcast.

## 0.8.0 - 2026-03-09

- Added the phase 8 extension API with snapshot-carried extension registry metadata, schema-driven node parameters, trusted local GUI bundle loading, and a sample extension package for end-to-end validation.
- Hardened extension delivery and caching: missing bundle requests now return `404`, cached bundle filenames are collision-safe, repeated snapshot processing avoids unnecessary bundle copies, and sqlite snapshot writes tolerate duplicate extension IDs.
- Tightened extension/UI contracts and runtime behavior: extension node components now use a strict shared status union, duplicate extension component registrations warn, extension loader subscriptions are scoped by node kind, and schema/file-picker parameter flows handle failure paths more defensively.

## 0.7.1 - 2026-03-08

- Fixed phase 7 desktop and hosted runtime regressions: health now opens in-app, root dev runners auto-select free app/R ports, and desktop shutdown tears down the spawned server process tree instead of leaving stale `bg_serve()` listeners behind.
- Fixed workflow canvas usability issues: disconnected nodes no longer stack at the origin, node drag now follows the cursor using React Flow's normal transient drag path, visible connection handles were added, and the canvas now exposes explicit `Add node` and `Auto arrange` controls.
- Improved terminal and session ergonomics: REPL output can be copied from the panel, shutdown no longer crashes on late sqlite REPL writes, stale cached REPL errors are cleared on fresh startup, and the hosted/desktop status messaging is more explicit.

## 0.7.0 - 2026-03-08

- Added the phase 7 shared-session REPL terminal with `xterm.js`, websocket-backed scrollback replay, clear/toggle/resize controls, hosted-mode read-only behavior, and Electron detach support.
- Added real phase 7 validation with a desktop-mode `ReplInput -> ReplOutput` integration test, an Electron detach smoke test, and follow-up runtime fixes for desktop mode startup and smoke isolation.
- Hardened the terminal/runtime boundary by filtering leaked protocol frames from console output, caching REPL history server-side, and improving Electron smoke logging so headless runs stay actionable.

## 0.6.0 - 2026-03-08

- Added the phase 6 node detail drawer with inline rename, virtualized summaries, read-only decisions, notes autosave, linked file management, and clickable lineage while keeping the canvas interactive.
- Added hosted-vs-desktop file handling through host commands and Electron file picker support, plus broader command/runtime coverage for notes and linked-file mutations.
- Added an opt-in real bayesgrove desktop smoke test and fixed a live protocol mismatch by accepting `status.last_run_id: null` in real snapshots.

## 0.5.0 - 2026-03-08

- Added the phase 5 workflow protocol UI with always-visible obligations, recommended actions, confirm-before-run previews, post-action guidance, and canvas highlighting/lock states driven by bayesgrove snapshots.
- Added server-side `ExecuteAction` routing for snapshot-backed workflow actions, plus focused tests for action dispatch, lock overlays, and follow-up guidance updates.

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
