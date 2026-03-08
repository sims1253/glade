// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Position, ReactFlowProvider, type NodeProps } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import type { WorkflowFlowNode, WorkflowNodeData } from '../../lib/graph-types';
import { FitNode } from './nodes/fit-node';
import { WorkflowCanvasContextProvider } from './workflow-canvas-context';

function makeProps(): NodeProps<WorkflowFlowNode> {
  const data: WorkflowNodeData = {
    id: 'fit_1',
    label: 'Baseline fit',
    kind: 'fit',
    rendererKind: 'fit',
    status: 'ok',
    blockReason: null,
    obligationCount: 0,
    raw: {},
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

describe('NodeShell rename flow', () => {
  it('opens an inline rename input on double-click and submits on blur', () => {
    const commitRename = vi.fn();

    function Harness() {
      const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
      const [renameDraft, setRenameDraft] = useState('');

      return (
        <WorkflowCanvasContextProvider
          value={{
            renamingNodeId,
            renameDraft,
            renamePending: false,
            connectionPreview: null,
            beginRename: (nodeId, label) => {
              setRenamingNodeId(nodeId);
              setRenameDraft(label);
            },
            cancelRename: () => setRenamingNodeId(null),
            commitRename,
            setRenameDraft,
          }}
        >
          <ReactFlowProvider>
            <FitNode {...makeProps()} />
          </ReactFlowProvider>
        </WorkflowCanvasContextProvider>
      );
    }

    render(<Harness />);

    fireEvent.doubleClick(screen.getByRole('heading', { name: 'Baseline fit' }));
    const input = screen.getByDisplayValue('Baseline fit');
    fireEvent.change(input, { target: { value: 'Updated fit' } });
    fireEvent.blur(input);

    expect(commitRename).toHaveBeenCalledTimes(1);
  });
});
