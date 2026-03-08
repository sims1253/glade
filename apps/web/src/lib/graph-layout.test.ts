import { describe, expect, it } from 'vitest';

import { layoutWorkflowGraph } from './graph-layout';
import type { WorkflowGraph } from './graph-types';

const baseNode = {
  branchScope: null,
  branchScopeLabel: null,
  notes: '',
  linkedFilePath: null,
  summaries: [],
  decisions: [],
  metadata: null,
  raw: {},
} as const;

const sampleGraph: WorkflowGraph = {
  projectId: 'proj_1',
  projectName: 'Demo',
  emittedAt: new Date().toISOString(),
  status: {
    workflowState: 'open',
    runnableNodes: 0,
    blockedNodes: 0,
    pendingGates: 0,
    activeJobs: 0,
    health: 'ok',
    messages: [],
    lastRunId: null,
  },
  protocolSummary: {
    scopeCount: 0,
    obligationCount: 0,
    actionCount: 0,
    blockingCount: 0,
    scopes: [],
  },
  topologySignature: 'layout-test',
  nodeKinds: [],
  nodeKindsByKind: {},
  nodesById: {
    source: { id: 'source', label: 'Source', kind: 'data_source', rendererKind: 'data_source', status: 'ok', blockReason: null, obligationCount: 0, blockingObligationCount: 0, ...baseNode },
    fit: { id: 'fit', label: 'Fit', kind: 'fit', rendererKind: 'fit', status: 'ok', blockReason: null, obligationCount: 0, blockingObligationCount: 0, ...baseNode },
    export: { id: 'export', label: 'Export', kind: 'export', rendererKind: 'export', status: 'ok', blockReason: null, obligationCount: 0, blockingObligationCount: 0, ...baseNode },
  },
  protocolScopes: [],
  obligations: [],
  actions: [],
  obligationsByNodeId: {},
  nodes: [
    { id: 'source', label: 'Source', kind: 'data_source', rendererKind: 'data_source', status: 'ok', blockReason: null, obligationCount: 0, blockingObligationCount: 0, ...baseNode },
    { id: 'fit', label: 'Fit', kind: 'fit', rendererKind: 'fit', status: 'ok', blockReason: null, obligationCount: 0, blockingObligationCount: 0, ...baseNode },
    { id: 'export', label: 'Export', kind: 'export', rendererKind: 'export', status: 'ok', blockReason: null, obligationCount: 0, blockingObligationCount: 0, ...baseNode },
  ],
  edges: [
    { id: 'edge_1', source: 'source', target: 'fit', kind: 'data', label: 'data', raw: {} },
    { id: 'edge_2', source: 'fit', target: 'export', kind: 'artifact', label: 'artifact', raw: {} },
  ],
};

describe('layoutWorkflowGraph', () => {
  it('returns stable top-to-bottom positions for the workflow DAG', async () => {
    const positions = await layoutWorkflowGraph(sampleGraph);

    expect(positions.source).toBeDefined();
    expect(positions.fit).toBeDefined();
    expect(positions.export).toBeDefined();
    expect(Number.isFinite(positions.fit!.x)).toBe(true);
    expect(Number.isFinite(positions.fit!.y)).toBe(true);
    expect(positions.fit!.y).toBeGreaterThanOrEqual(positions.source!.y);
    expect(positions.export!.y).toBeGreaterThanOrEqual(positions.fit!.y);
  });

  it('spreads disconnected nodes instead of stacking them at the origin', async () => {
    const positions = await layoutWorkflowGraph({
      ...sampleGraph,
      edges: [],
    });

    expect(positions.source).toBeDefined();
    expect(positions.fit).toBeDefined();
    expect(positions.export).toBeDefined();
    expect(new Set([
      `${positions.source!.x}:${positions.source!.y}`,
      `${positions.fit!.x}:${positions.fit!.y}`,
      `${positions.export!.x}:${positions.export!.y}`,
    ]).size).toBe(3);
  });
});
