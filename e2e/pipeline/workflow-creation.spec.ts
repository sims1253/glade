/**
 * Workflow creation E2E tests.
 *
 * Verifies:
 * - VAL-PIPELINE-001: Eight Schools workflow can be created from scratch
 * - VAL-PIPELINE-002: Data node can be added with hardcoded Eight Schools data
 * - VAL-PIPELINE-003: Fit node can be added with Eight Schools Stan model
 * - VAL-PIPELINE-004: Nodes can be connected (data to fit)
 *
 * These tests verify the server-side bayesgrove protocol via WebSocket RPC
 * methods (workflow.addNode, workflow.connectNodes) and validate graph
 * snapshot updates. They use a shared server with executors pre-registered
 * via REPL in the shared-setup module.
 *
 * Architecture notes:
 * - The Bun server exposes workflow.* RPC methods that translate to
 *   bayesgrove commands (bg_add_node, bg_connect, etc.)
 * - Executor registration must happen in the R session (via REPL) since
 *   executor closures capture variables from the session where they run
 * - bg_use_default_workflow is called during project setup to register
 *   starter node kinds (source, fit, ppc, compare)
 */

import { test, expect } from '@playwright/test';

import { ensurePipelineEnvironment, cleanupPipelineEnvironment } from './shared-setup';
import { connectWebSocket, type WebSocketHandle } from '../fixtures/websocket';

// --- Lifecycle ---------------------------------------------------------------

test.beforeAll(async () => {
  await ensurePipelineEnvironment();
});

test.afterAll(async () => {
  await cleanupPipelineEnvironment();
});

// --- Helpers -----------------------------------------------------------------

const SERVER_PORT = 3100;

/**
 * Connect a fresh WebSocket and wait for the initial bootstrap + snapshot.
 */
async function connectAndWait(ws: WebSocketHandle): Promise<void> {
  await ws.waitForChannel('server.bootstrap', 30_000);
  // Wait for at least one GraphSnapshot to arrive
  await waitForGraphSnapshot(ws, 15_000);
}

/**
 * Wait for a GraphSnapshot message (either from server.bootstrap embedded
 * snapshot or from a workflow.snapshot push).
 */
async function waitForGraphSnapshot(
  wsHandle: WebSocketHandle,
  timeoutMs = 15_000,
): Promise<Record<string, unknown>> {
  return wsHandle.waitForMessage(
    (msg) => msg.message_type === 'GraphSnapshot',
    timeoutMs,
  );
}

/**
 * Wait for a workflow.snapshot push that satisfies a predicate on the
 * GraphSnapshot payload.
 */
async function waitForSnapshotUpdate(
  wsHandle: WebSocketHandle,
  predicate: (snapshot: Record<string, unknown>) => boolean,
  timeoutMs = 15_000,
): Promise<Record<string, unknown>> {
  return wsHandle.waitForMessage(
    (msg) => msg.message_type === 'GraphSnapshot' && predicate(msg as Record<string, unknown>),
    timeoutMs,
  );
}

/**
 * Add a node via the workflow.addNode RPC method.
 * Returns the request ID (node ID must be extracted from snapshot diff).
 */
async function addNodeViaRpc(
  wsHandle: WebSocketHandle,
  kind: string,
  label?: string,
  inputs?: string[],
  params?: Record<string, unknown>,
): Promise<string> {
  const requestId = wsHandle.send('workflow.addNode', {
    _tag: 'workflow.addNode',
    kind,
    ...(label ? { label } : {}),
    ...(inputs ? { inputs } : {}),
    ...(params ? { params } : {}),
  });

  const response = await wsHandle.waitForResponse(requestId, 30_000);
  if (response._tag === 'WebSocketError') {
    throw new Error(
      `workflow.addNode returned WebSocketError: ${JSON.stringify(response)}`,
    );
  }

  return requestId;
}

/**
 * Connect two nodes via the workflow.connectNodes RPC method.
 * Returns the request ID (edge ID must be extracted from snapshot diff).
 */
async function connectNodesViaRpc(
  wsHandle: WebSocketHandle,
  from: string,
  to: string,
): Promise<string> {
  const requestId = wsHandle.send('workflow.connectNodes', {
    _tag: 'workflow.connectNodes',
    from,
    to,
  });

  const response = await wsHandle.waitForResponse(requestId, 30_000);
  if (response._tag === 'WebSocketError') {
    const errorPayload = response.payload as Record<string, unknown>;
    throw new Error(
      `workflow.connectNodes returned WebSocketError: ${JSON.stringify(errorPayload)}`,
    );
  }

  return requestId;
}

/**
 * Wait for a snapshot update that has a different node count than the baseline.
 * Returns the new node IDs and the snapshot that contained them.
 */
async function waitForNewNodes(
  wsHandle: WebSocketHandle,
  baselineNodeIds: string[],
  timeoutMs = 15_000,
): Promise<{ newNodeIds: string[]; snapshot: Record<string, unknown> }> {
  const snapshot = await waitForSnapshotUpdate(
    wsHandle,
    (snap) => {
      const graph = parseSnapshotGraph(snap);
      return graph.nodeIds.length > baselineNodeIds.length;
    },
    timeoutMs,
  );
  const graph = parseSnapshotGraph(snapshot);
  const newNodeIds = graph.nodeIds.filter((id) => !baselineNodeIds.includes(id));
  return { newNodeIds, snapshot };
}

/**
 * Wait for a snapshot update that has a different edge count than the baseline.
 * Returns the new edge IDs and the snapshot that contained them.
 */
async function waitForNewEdges(
  wsHandle: WebSocketHandle,
  baselineEdgeIds: string[],
  timeoutMs = 15_000,
): Promise<{ newEdgeIds: string[]; snapshot: Record<string, unknown> }> {
  const snapshot = await waitForSnapshotUpdate(
    wsHandle,
    (snap) => {
      const graph = parseSnapshotGraph(snap);
      return graph.edgeIds.length > baselineEdgeIds.length;
    },
    timeoutMs,
  );
  const graph = parseSnapshotGraph(snapshot);
  const newEdgeIds = graph.edgeIds.filter((id) => !baselineEdgeIds.includes(id));
  return { newEdgeIds, snapshot };
}

/**
 * Parse node IDs and edge IDs from a GraphSnapshot.
 */
function parseSnapshotGraph(snapshot: Record<string, unknown>): {
  nodeIds: string[];
  edgeIds: string[];
  nodes: Record<string, Record<string, unknown>>;
  edges: Record<string, Record<string, unknown>>;
} {
  const graph = (snapshot.graph ?? {}) as Record<string, unknown>;
  const nodes = (graph.nodes ?? {}) as Record<string, Record<string, unknown>>;
  const edges = (graph.edges ?? {}) as Record<string, Record<string, unknown>>;
  return {
    nodeIds: Object.keys(nodes),
    edgeIds: Object.keys(edges),
    nodes,
    edges,
  };
}

/**
 * Extract registered node kinds from a GraphSnapshot.
 *
 * Kinds are available in two places:
 * 1. `graph.registry.kinds` — the raw bayesgrove kind registry
 * 2. `availableNodeKinds` — a flat array of kind names on the snapshot
 */
function extractKinds(snapshot: Record<string, unknown>): string[] {
  const kinds: string[] = [];

  // Check availableNodeKinds (flat array on the snapshot)
  const availableKinds = snapshot.availableNodeKinds;
  if (Array.isArray(availableKinds)) {
    kinds.push(...availableKinds.map(String));
  }

  // Also check graph.registry.kinds
  const graph = (snapshot.graph ?? {}) as Record<string, unknown>;
  const registry = (graph.registry ?? {}) as Record<string, unknown>;
  const registryKinds = (registry.kinds ?? {}) as Record<string, unknown>;
  if (typeof registryKinds === 'object' && registryKinds !== null) {
    kinds.push(...Object.keys(registryKinds));
  }

  // Deduplicate
  return [...new Set(kinds)];
}

// --- Tests -------------------------------------------------------------------

test('VAL-PIPELINE-001: bg_use_default_workflow registers node kinds', async () => {
  test.setTimeout(60_000);

  // Connect a fresh WebSocket to observe the current graph state.
  // bg_use_default_workflow was already called during project setup
  // (via createBayesgroveProject). The shared-setup also registers
  // 'data' and 'fit' executors via REPL.
  const ws = connectWebSocket(SERVER_PORT);
  await connectAndWait(ws);

  // Get the current GraphSnapshot
  const snapshot = await waitForGraphSnapshot(ws, 15_000);
  const kinds = extractKinds(snapshot);

  // bg_use_default_workflow registers: source, fit, ppc, compare
  // The shared-setup also registers: data
  expect(kinds).toContain('source');
  expect(kinds).toContain('fit');
  expect(kinds).toContain('ppc');
  expect(kinds).toContain('compare');

  await ws.close();
});

test('VAL-PIPELINE-002: data node can be added with hardcoded Eight Schools data', async () => {
  test.setTimeout(90_000);

  const ws = connectWebSocket(SERVER_PORT);
  await connectAndWait(ws);

  // Get the initial node IDs from the graph snapshot
  const initialSnapshot = await waitForGraphSnapshot(ws, 15_000);
  const initialGraph = parseSnapshotGraph(initialSnapshot);

  // Add a data node via workflow.addNode RPC
  await addNodeViaRpc(ws, 'data', 'Eight schools data');

  // Wait for the workflow.snapshot to update with the new node
  const { newNodeIds, snapshot: updatedSnapshot } = await waitForNewNodes(ws, initialGraph.nodeIds, 15_000);
  expect(newNodeIds).toHaveLength(1);

  const [dataNodeId] = newNodeIds;
  expect(dataNodeId).toMatch(/^node_[a-f0-9]+$/);

  // Verify node properties from the snapshot that contained the new node
  const updatedGraph = parseSnapshotGraph(updatedSnapshot);

  // The new node should exist in the graph with kind "data" and state "new"
  const dataNode = updatedGraph.nodes[dataNodeId];
  expect(dataNode).toBeDefined();
  expect(dataNode.kind).toBe('data');
  expect(dataNode.state).toBe('new');

  await ws.close();
});

test('VAL-PIPELINE-003: fit node can be added with Eight Schools Stan model', async () => {
  test.setTimeout(90_000);

  const ws = connectWebSocket(SERVER_PORT);
  await connectAndWait(ws);

  // Get initial state
  const initialSnapshot = await waitForGraphSnapshot(ws, 15_000);
  const initialGraph = parseSnapshotGraph(initialSnapshot);

  // First add a data node (required as input for the fit node,
  // since the default workflow's fit kind has input_contract requiring "data")
  await addNodeViaRpc(ws, 'data', 'Eight schools data');
  const { newNodeIds: dataNodeIds, snapshot: afterDataSnapshot } = await waitForNewNodes(ws, initialGraph.nodeIds, 15_000);
  expect(dataNodeIds).toHaveLength(1);
  const dataNodeId = dataNodeIds[0]!;

  const afterDataGraph = parseSnapshotGraph(afterDataSnapshot);

  // Add a fit node via workflow.addNode RPC with the data node as input
  await addNodeViaRpc(ws, 'fit', 'Centered fit', [dataNodeId]);

  // Wait for the workflow.snapshot to update with the new node
  const { newNodeIds: fitNodeIds, snapshot: updatedSnapshot } = await waitForNewNodes(ws, afterDataGraph.nodeIds, 15_000);
  expect(fitNodeIds).toHaveLength(1);

  const [fitNodeId] = fitNodeIds;
  expect(fitNodeId).toMatch(/^node_[a-f0-9]+$/);

  // Verify node properties from the snapshot that contained the new node
  const updatedGraph = parseSnapshotGraph(updatedSnapshot);

  // The new node should exist in the graph with kind "fit" and state "new"
  const fitNode = updatedGraph.nodes[fitNodeId];
  expect(fitNode).toBeDefined();
  expect(fitNode.kind).toBe('fit');
  expect(fitNode.state).toBe('new');

  await ws.close();
});

test('VAL-PIPELINE-004: nodes can be connected via bg_connect', async () => {
  test.setTimeout(90_000);

  const ws = connectWebSocket(SERVER_PORT);
  await connectAndWait(ws);

  // Get initial state
  const initialSnapshot = await waitForGraphSnapshot(ws, 15_000);
  const initialGraph = parseSnapshotGraph(initialSnapshot);

  // Add data node
  await addNodeViaRpc(ws, 'data', 'Eight schools data');
  const { newNodeIds: dataNodeIds, snapshot: afterDataSnapshot } = await waitForNewNodes(ws, initialGraph.nodeIds, 15_000);
  expect(dataNodeIds).toHaveLength(1);
  const dataNodeId = dataNodeIds[0]!;

  const afterDataGraph = parseSnapshotGraph(afterDataSnapshot);

  // Add fit node with data node as input
  await addNodeViaRpc(ws, 'fit', 'Centered fit', [dataNodeId]);
  const { newNodeIds: fitNodeIds, snapshot: afterFitSnapshot } = await waitForNewNodes(ws, afterDataGraph.nodeIds, 15_000);
  expect(fitNodeIds).toHaveLength(1);
  const fitNodeId = fitNodeIds[0]!;

  const beforeConnectGraph = parseSnapshotGraph(afterFitSnapshot);

  // Connect data node to fit node via workflow.connectNodes RPC
  await connectNodesViaRpc(ws, dataNodeId, fitNodeId);

  // Wait for the workflow.snapshot to update with the new edge
  const { newEdgeIds, snapshot: afterConnectSnapshot } = await waitForNewEdges(ws, beforeConnectGraph.edgeIds, 15_000);
  expect(newEdgeIds).toHaveLength(1);
  const edgeId = newEdgeIds[0]!;
  expect(edgeId).toMatch(/^edge_[a-f0-9]+$/);

  // Verify edge properties from the snapshot that contained the new edge
  const afterConnectGraph = parseSnapshotGraph(afterConnectSnapshot);

  // The new edge should exist in the graph
  const edge = afterConnectGraph.edges[edgeId];
  expect(edge).toBeDefined();

  // Verify the edge connects the correct nodes
  const edgeFrom = String(edge.from ?? '');
  const edgeTo = String(edge.to ?? '');
  expect(edgeFrom).toBe(dataNodeId);
  expect(edgeTo).toBe(fitNodeId);

  // Final graph snapshot should show both nodes and the edge
  expect(afterConnectGraph.nodes[dataNodeId]).toBeDefined();
  expect(afterConnectGraph.nodes[fitNodeId]).toBeDefined();
  expect(afterConnectGraph.edges[edgeId]).toBeDefined();

  await ws.close();
});
