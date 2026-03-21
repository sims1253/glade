# Architecture

Architectural decisions, patterns, and conventions discovered during the mission.

---

## Three-Layer Architecture

```
React Frontend (Vite, port 5173)
    ↓ WebSocket (/ws)
Bun Backend (port 3100+)
    ↓ WebSocket (bg_serve)
R Process (port 3100+, bayesgrove)
```

## WebSocket Message Protocol

All messages are JSON. Three message types from server → client:

1. **WsPush** — server-initiated push messages with channels:
   - `server.bootstrap` — initial connection, contains `ServerBootstrap` + optional `GraphSnapshot`
   - `workflow.snapshot` — full graph state updates
   - `workflow.event` — incremental protocol events (`ProtocolEvent`)
   - `repl.output` — R console output
   - `session.status` — session state transitions

2. **WebSocketSuccess** — response to client `WebSocketRequest` with matching `id`
3. **WebSocketError** — error response to client `WebSocketRequest`

Client → Server: `WebSocketRequest` with `{ _tag, id, method, body }`

## Key RPC Methods

| Method | Purpose |
|---|---|
| `repl.write` | Send command to R REPL |
| `workflow.executeCommand` | Send bayesgrove command (bg_add_node, bg_connect, bg_submit, etc.) |
| `workflow.executeAction` | Execute a protocol action from the GUI |

## Bayesgrove Commands (via workflow.executeCommand)

| Command | Description |
|---|---|
| `bg_snapshot` | Get current graph state |
| `bg_status` | Get workflow status |
| `bg_next_actions` | Get available protocol actions |
| `bg_use_default_workflow` | Register starter node kinds |
| `bg_add_node` | Add a node to the graph |
| `bg_connect` | Create edge between nodes |
| `bg_update_node` | Update node parameters |
| `bg_remove_node` | Delete a node |
| `bg_submit` | Submit async execution |
| `bg_cancel` | Cancel running execution |
| `bg_record_decision` | Record a protocol decision |
| `bg_answer_gate` | Answer a workflow gate |

## GUI Component Hierarchy

```
WorkspaceShell
├── ExplorerPanel (left aside)
│   └── Node groups: Data Sources, Models, Fits, Diagnostics, Results
├── WorkflowCanvas (center)
│   ├── CanvasStatusBanner
│   ├── WorkflowCanvasToolbar
│   └── React Flow (.workflow-flow)
│       ├── Nodes (.react-flow__node)
│       ├── Edges (.react-flow__edge)
│       └── MiniMap
├── InspectorPanel (right aside)
│   ├── Obligations tab
│   └── Actions tab
├── ReplTerminalPanel (bottom)
│   └── xterm.js terminal (.xterm)
├── CommandPalette (modal dialog)
└── NodeDetailDrawer (slide-in from right)
```

## Test Patterns

### Integration Tests (existing, server-side)
- Location: `apps/server/test/`
- Pattern: spawn server → wait for health → WebSocket connect → send commands → assert
- Helpers: `apps/server/test/integration-support.ts`

### Browser Tests (existing, component-level)
- Location: `apps/web/src/**/*.browser.tsx`
- Runner: vitest + @vitest/browser-playwright
- Pattern: render React component in Chromium, assert DOM

### E2E Tests (new, this mission)
- Location: `e2e/`
- Runner: standalone Playwright
- Pattern: start server → launch browser → interact with GUI → assert DOM + WebSocket
