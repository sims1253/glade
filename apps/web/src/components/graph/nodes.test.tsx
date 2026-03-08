// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { Position, ReactFlowProvider, type NodeProps } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import type { WorkflowFlowNode, WorkflowNodeData } from '../../lib/graph-types';
import { WorkflowCanvasContextProvider } from './workflow-canvas-context';
import { CompareNode } from './nodes/compare-node';
import { CompileNode } from './nodes/compile-node';
import { DataSourceNode } from './nodes/data-source-node';
import { DiagnosticNode } from './nodes/diagnostic-node';
import { ExportNode } from './nodes/export-node';
import { FitNode } from './nodes/fit-node';
import { GenericNode } from './nodes/generic-node';
import { ModelSpecNode } from './nodes/model-spec-node';

function makeProps(overrides: Partial<WorkflowNodeData>): NodeProps<WorkflowFlowNode> {
  const data: WorkflowNodeData = {
    id: 'node_1',
    label: 'Node Label',
    kind: 'fit',
    rendererKind: 'fit',
    status: 'ok',
    blockReason: null,
    obligationCount: 1,
    blockingObligationCount: 0,
    raw: {},
    ...overrides,
  };

  return {
    id: data.id,
    data,
    type: data.rendererKind,
    selected: false,
    dragging: false,
    zIndex: 0,
    isConnectable: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    targetPosition: Position.Top,
    sourcePosition: Position.Bottom,
  } as NodeProps<WorkflowFlowNode>;
}

const contextValue = {
  renamingNodeId: null,
  renameDraft: '',
  renamePending: false,
  connectionPreview: null,
  beginRename: () => {},
  cancelRename: () => {},
  commitRename: () => {},
  setRenameDraft: () => {},
};

describe('workflow node renderers', () => {
  it('renders every built-in node kind without crashing', () => {
    render(
      <WorkflowCanvasContextProvider value={contextValue}>
        <ReactFlowProvider>
          <DataSourceNode {...makeProps({ kind: 'data_source', rendererKind: 'data_source', label: 'Source data' })} />
          <ModelSpecNode {...makeProps({ kind: 'model_spec', rendererKind: 'model_spec', label: 'Model spec' })} />
          <CompileNode {...makeProps({ kind: 'compile', rendererKind: 'compile', label: 'Compile' })} />
          <FitNode {...makeProps({ kind: 'fit', rendererKind: 'fit', label: 'Fit' })} />
          <DiagnosticNode {...makeProps({ kind: 'diagnostic', rendererKind: 'diagnostic', label: 'Diagnostics' })} />
          <CompareNode {...makeProps({ kind: 'compare', rendererKind: 'compare', label: 'Compare' })} />
          <ExportNode {...makeProps({ kind: 'export', rendererKind: 'export', label: 'Export' })} />
          <GenericNode {...makeProps({ kind: 'custom_extension', rendererKind: 'generic', label: 'Custom node' })} />
        </ReactFlowProvider>
      </WorkflowCanvasContextProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Source data' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Model spec' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Compile' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fit' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Diagnostics' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Compare' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Export' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Custom node' })).toBeInTheDocument();
  });

  it('renders stale, held, and blocked states', () => {
    render(
      <WorkflowCanvasContextProvider value={contextValue}>
        <ReactFlowProvider>
          <FitNode {...makeProps({ status: 'stale', label: 'Stale fit' })} />
          <FitNode {...makeProps({ id: 'held', status: 'held', label: 'Held fit' })} />
          <FitNode {...makeProps({ id: 'blocked', status: 'blocked', label: 'Blocked fit' })} />
        </ReactFlowProvider>
      </WorkflowCanvasContextProvider>,
    );

    expect(screen.getByText('stale')).toBeInTheDocument();
    expect(screen.getByText('held')).toBeInTheDocument();
    expect(screen.getByText('blocked')).toBeInTheDocument();
  });

  it('shows a lock overlay when a node has a blocking obligation', () => {
    render(
      <WorkflowCanvasContextProvider value={contextValue}>
        <ReactFlowProvider>
          <FitNode {...makeProps({ blockingObligationCount: 1, obligationCount: 1, label: 'Blocked by review' })} />
        </ReactFlowProvider>
      </WorkflowCanvasContextProvider>,
    );

    expect(screen.getByLabelText('1 blocking obligation')).toBeInTheDocument();
  });

  it('pluralizes the blocking obligation overlay count', () => {
    render(
      <WorkflowCanvasContextProvider value={contextValue}>
        <ReactFlowProvider>
          <FitNode {...makeProps({ blockingObligationCount: 2, obligationCount: 2, label: 'Blocked by reviews' })} />
        </ReactFlowProvider>
      </WorkflowCanvasContextProvider>,
    );

    expect(screen.getByLabelText('2 blocking obligations')).toBeInTheDocument();
  });

  it('does not render a blocking overlay when there are no blocking obligations', () => {
    render(
      <WorkflowCanvasContextProvider value={contextValue}>
        <ReactFlowProvider>
          <FitNode {...makeProps({ blockingObligationCount: 0, obligationCount: 0, label: 'No obligations' })} />
        </ReactFlowProvider>
      </WorkflowCanvasContextProvider>,
    );

    expect(screen.queryByLabelText('0 blocking obligations')).not.toBeInTheDocument();
  });
});
