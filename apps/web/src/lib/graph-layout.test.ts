import { describe, expect, it } from 'vitest';

import { layoutWorkflowGraph } from './graph-layout';
import type { WorkflowGraph } from './graph-types';

const sampleGraph: WorkflowGraph = {
  projectId: 'proj_1',
  projectName: 'Demo',
  emittedAt: new Date().toISOString(),
  topologySignature: 'layout-test',
  obligationsByNodeId: {},
  nodes: [
    { id: 'source', label: 'Source', kind: 'data_source', rendererKind: 'data_source', status: 'ok', obligationCount: 0, raw: {} },
    { id: 'fit', label: 'Fit', kind: 'fit', rendererKind: 'fit', status: 'ok', obligationCount: 0, raw: {} },
    { id: 'export', label: 'Export', kind: 'export', rendererKind: 'export', status: 'ok', obligationCount: 0, raw: {} },
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
});
