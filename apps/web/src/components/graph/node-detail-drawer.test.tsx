// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowGraph, WorkflowNodeData } from '../../lib/graph-types';
import { useGraphStore } from '../../store/graph';
import { NodeDetailDrawer } from './node-detail-drawer';

const dispatchCommand = vi.fn();
const dispatchHostCommand = vi.fn();

const relatedNodes = {
  source: {
    id: 'source',
    label: 'Source data',
    kind: 'data_source',
    rendererKind: 'data_source',
    status: 'ok',
    blockReason: null,
    obligationCount: 0,
    blockingObligationCount: 0,
    branchScope: null,
    branchScopeLabel: 'Project',
    notes: '',
    linkedFilePath: null,
    summaries: [],
    decisions: [],
    metadata: null,
    raw: {},
  },
  fit: {
    id: 'fit',
    label: 'Baseline fit',
    kind: 'fit',
    rendererKind: 'fit',
    status: 'warning',
    blockReason: 'review_required',
    obligationCount: 1,
    blockingObligationCount: 1,
    branchScope: 'branch:alpha',
    branchScopeLabel: 'Branch alpha',
    notes: 'Check posterior predictive diagnostics.',
    linkedFilePath: '/tmp/project/model.R',
    summaries: [
      {
        id: 'sum_2',
        kind: 'fit_summary',
        label: 'Fit Summary',
        severity: 'warning',
        recordedAt: '2026-03-08T10:01:00.000Z',
        passed: false,
        metrics: { loo: 123.4 },
        metadata: { run_id: 'run_2' },
        raw: {},
      },
      {
        id: 'sum_1',
        kind: 'ppc',
        label: 'Ppc',
        severity: 'advisory',
        recordedAt: '2026-03-08T10:00:00.000Z',
        passed: true,
        metrics: { p_value: 0.42 },
        metadata: null,
        raw: {},
      },
    ],
    decisions: [
      {
        id: 'dec_1',
        kind: 'fit_criticism',
        recordedAt: '2026-03-08T10:02:00.000Z',
        basisExcerpt: 'Posterior predictive checks indicate a misfit in the tail behavior.',
        raw: {},
      },
    ],
    metadata: { notes: 'Check posterior predictive diagnostics.' },
    raw: {},
  },
  export: {
    id: 'export',
    label: 'Export report',
    kind: 'export',
    rendererKind: 'export',
    status: 'ok',
    blockReason: null,
    obligationCount: 0,
    blockingObligationCount: 0,
    branchScope: 'branch:alpha',
    branchScopeLabel: 'Branch alpha',
    notes: '',
    linkedFilePath: null,
    summaries: [],
    decisions: [],
    metadata: null,
    raw: {},
  },
} satisfies Record<string, WorkflowNodeData>;

const graph: WorkflowGraph = {
  projectId: 'proj_phase_6',
  projectName: 'phase-6',
  emittedAt: '2026-03-08T10:03:00.000Z',
  status: {
    workflowState: 'blocked',
    runnableNodes: 0,
    blockedNodes: 1,
    pendingGates: 0,
    activeJobs: 0,
    health: 'ok',
    messages: ['review required'],
    lastRunId: null,
  },
  protocolSummary: {
    scopeCount: 1,
    obligationCount: 1,
    actionCount: 0,
    blockingCount: 1,
    scopes: ['project'],
  },
  nodes: [relatedNodes.source, relatedNodes.fit, relatedNodes.export],
  nodesById: relatedNodes,
  edges: [
    { id: 'edge_source_fit', source: 'source', target: 'fit', kind: 'data', label: 'data', raw: {} },
    { id: 'edge_fit_export', source: 'fit', target: 'export', kind: 'artifact', label: 'artifact', raw: {} },
  ],
  nodeKinds: [],
  nodeKindsByKind: {},
  protocolScopes: [],
  obligations: [],
  actions: [],
  obligationsByNodeId: {},
  topologySignature: 'phase-6-detail',
};

beforeEach(() => {
  dispatchCommand.mockReset();
  dispatchHostCommand.mockReset();
  dispatchCommand.mockResolvedValue({ type: 'CommandResult', id: 'cmd', success: true });
  dispatchHostCommand.mockResolvedValue({ type: 'CommandResult', id: 'host', success: true });
  useGraphStore.getState().clear();
  vi.stubGlobal('ResizeObserver', class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  window.desktopBridge = {
    pickFile: vi.fn(async () => '/tmp/project/model.R'),
  };
});

afterEach(() => {
  cleanup();
  delete window.desktopBridge;
  vi.unstubAllGlobals();
});

describe('NodeDetailDrawer', () => {
  it('renders all phase 6 sections with node detail data', async () => {
    render(
      <NodeDetailDrawer
        graph={graph}
        node={graph.nodesById.fit!}
        dispatchCommand={dispatchCommand}
        dispatchHostCommand={dispatchHostCommand}
        onClose={() => {}}
        onSelectNode={() => {}}
      />,
    );

    expect(screen.getByDisplayValue('Baseline fit')).toBeInTheDocument();
    expect(screen.getByText('Summary Log')).toBeInTheDocument();
    expect(screen.getByText('Decisions')).toBeInTheDocument();
    expect(screen.getAllByText('Notes')[0]).toBeInTheDocument();
    expect(screen.getByText('Linked File')).toBeInTheDocument();
    expect(screen.getByText('Branch Lineage')).toBeInTheDocument();
    expect(screen.queryByText('No summaries recorded yet.')).not.toBeInTheDocument();
    expect(screen.getByText('Posterior predictive checks indicate a misfit in the tail behavior.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Check posterior predictive diagnostics.')).toBeInTheDocument();
    expect(screen.getByText('/tmp/project/model.R')).toBeInTheDocument();
    expect(await screen.findByText('Source data')).toBeInTheDocument();
    expect(screen.getByText('Export report')).toBeInTheDocument();
  });

  it('dispatches UpdateNodeNotes on blur', async () => {
    render(
      <NodeDetailDrawer
        graph={graph}
        node={graph.nodesById.fit!}
        dispatchCommand={dispatchCommand}
        dispatchHostCommand={dispatchHostCommand}
        onClose={() => {}}
        onSelectNode={() => {}}
      />,
    );

    const textarea = screen.getByLabelText('Notes');
    fireEvent.change(textarea, { target: { value: 'Updated notes from the drawer.' } });
    fireEvent.blur(textarea);

    await waitFor(() =>
      expect(dispatchCommand).toHaveBeenCalledWith({
        type: 'UpdateNodeNotes',
        nodeId: 'fit',
        notes: 'Updated notes from the drawer.',
      }),
    );
  });

  it('does not overwrite dirty notes when the same node receives a snapshot refresh', async () => {
    const { rerender } = render(
      <NodeDetailDrawer
        graph={graph}
        node={graph.nodesById.fit!}
        dispatchCommand={dispatchCommand}
        dispatchHostCommand={dispatchHostCommand}
        onClose={() => {}}
        onSelectNode={() => {}}
      />,
    );

    const textarea = screen.getByLabelText('Notes');
    fireEvent.change(textarea, { target: { value: 'Locally edited notes that are not saved yet.' } });

    rerender(
      <NodeDetailDrawer
        graph={{
          ...graph,
          emittedAt: '2026-03-08T10:04:00.000Z',
        }}
        node={{
          ...graph.nodesById.fit!,
          notes: 'Server-pushed notes that should not clobber local edits.',
        }}
        dispatchCommand={dispatchCommand}
        dispatchHostCommand={dispatchHostCommand}
        onClose={() => {}}
        onSelectNode={() => {}}
      />,
    );

    expect(screen.getByLabelText('Notes')).toHaveValue('Locally edited notes that are not saved yet.');
  });

  it('dispatches OpenFileInEditor with the linked path', async () => {
    render(
      <NodeDetailDrawer
        graph={graph}
        node={graph.nodesById.fit!}
        dispatchCommand={dispatchCommand}
        dispatchHostCommand={dispatchHostCommand}
        onClose={() => {}}
        onSelectNode={() => {}}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /open in editor/i })[0]!);

    await waitFor(() =>
      expect(dispatchHostCommand).toHaveBeenCalledWith({
        type: 'OpenFileInEditor',
        path: '/tmp/project/model.R',
      }),
    );
  });

  it('navigates lineage entries through zustand selection', async () => {
    useGraphStore.getState().setSelectedNodeId('fit');

    render(
      <NodeDetailDrawer
        graph={graph}
        node={graph.nodesById.fit!}
        dispatchCommand={dispatchCommand}
        dispatchHostCommand={dispatchHostCommand}
        onClose={() => {}}
        onSelectNode={(nodeId) => useGraphStore.getState().setSelectedNodeId(nodeId)}
      />,
    );

    const sourceButton = (await screen.findByText('Source data')).closest('button');
    if (!sourceButton) {
      throw new Error('Expected Source data lineage button.');
    }

    fireEvent.click(sourceButton);

    expect(useGraphStore.getState().selectedNodeId).toBe('source');
  });

  it('surfaces editor capability errors while keeping the path visible', async () => {
    delete window.desktopBridge;
    dispatchHostCommand.mockResolvedValue({
      type: 'CommandResult',
      id: 'host',
      success: false,
      error: {
        code: 'editor_open_failed',
        message: 'OpenFileInEditor failed.',
      },
    });

    render(
      <NodeDetailDrawer
        graph={graph}
        node={graph.nodesById.fit!}
        dispatchCommand={dispatchCommand}
        dispatchHostCommand={dispatchHostCommand}
        onClose={() => {}}
        onSelectNode={() => {}}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /open in editor/i })[0]!);

    expect(await screen.findByText('OpenFileInEditor failed.')).toBeInTheDocument();
    expect(screen.getByText('/tmp/project/model.R')).toBeInTheDocument();
    expect(screen.getByLabelText(/enter file path/i)).toBeInTheDocument();
  });
});
