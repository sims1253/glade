import { describe, expect, it } from 'vitest';

import { canConnectNodes, getConnectionPreview, getDownstreamNodeIds } from './graph-interactions';
import type { WorkflowGraph } from './graph-types';

const graph: WorkflowGraph = {
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
  topologySignature: 'graph-interactions',
  protocolScopes: [],
  obligations: [],
  actions: [],
  obligationsByNodeId: {},
  nodeKinds: [
    { kind: 'source', label: 'Source', description: 'Source node', inputTypes: [], outputTypes: ['data.frame'], raw: {} },
    { kind: 'fit', label: 'Fit', description: 'Fit node', inputTypes: ['data.frame'], outputTypes: ['fit'], raw: {} },
    { kind: 'ppc', label: 'PPC', description: 'Diagnostic node', inputTypes: ['fit'], outputTypes: [], raw: {} },
  ],
  nodeKindsByKind: {
    source: { kind: 'source', label: 'Source', description: 'Source node', inputTypes: [], outputTypes: ['data.frame'], raw: {} },
    fit: { kind: 'fit', label: 'Fit', description: 'Fit node', inputTypes: ['data.frame'], outputTypes: ['fit'], raw: {} },
    ppc: { kind: 'ppc', label: 'PPC', description: 'Diagnostic node', inputTypes: ['fit'], outputTypes: [], raw: {} },
  },
  nodesById: {
    source: { id: 'source', label: 'Source', kind: 'source', rendererKind: 'data_source', status: 'ok', blockReason: null, obligationCount: 0, blockingObligationCount: 0, raw: {} },
    fit: { id: 'fit', label: 'Fit', kind: 'fit', rendererKind: 'fit', status: 'ok', blockReason: null, obligationCount: 0, blockingObligationCount: 0, raw: {} },
    ppc: { id: 'ppc', label: 'PPC', kind: 'ppc', rendererKind: 'diagnostic', status: 'ok', blockReason: null, obligationCount: 0, blockingObligationCount: 0, raw: {} },
  },
  nodes: [
    { id: 'source', label: 'Source', kind: 'source', rendererKind: 'data_source', status: 'ok', blockReason: null, obligationCount: 0, blockingObligationCount: 0, raw: {} },
    { id: 'fit', label: 'Fit', kind: 'fit', rendererKind: 'fit', status: 'ok', blockReason: null, obligationCount: 0, blockingObligationCount: 0, raw: {} },
    { id: 'ppc', label: 'PPC', kind: 'ppc', rendererKind: 'diagnostic', status: 'ok', blockReason: null, obligationCount: 0, blockingObligationCount: 0, raw: {} },
  ],
  edges: [
    { id: 'edge_1', source: 'source', target: 'fit', kind: 'data', label: 'data', raw: {} },
    { id: 'edge_2', source: 'fit', target: 'ppc', kind: 'diagnostic', label: 'diagnostic', raw: {} },
  ],
};

describe('graph interactions', () => {
  it('validates connections against node type contracts', () => {
    expect(canConnectNodes(graph, 'source', 'fit')).toBe(false);
    expect(canConnectNodes(graph, 'source', 'ppc')).toBe(false);
    expect(canConnectNodes({ ...graph, edges: [] }, 'source', 'fit')).toBe(true);
    expect(canConnectNodes({ ...graph, edges: [] }, 'fit', 'ppc')).toBe(true);
  });

  it('derives connection previews and downstream impact', () => {
    const preview = getConnectionPreview({ ...graph, edges: [] }, 'fit');
    expect(preview.validTargetIds.has('ppc')).toBe(true);
    expect(preview.invalidTargetIds.has('source')).toBe(true);
    expect(getDownstreamNodeIds(graph, 'source')).toEqual(['fit', 'ppc']);
  });
});
