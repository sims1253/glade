// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { WorkflowInspectorTab } from '../../lib/workflow-workspace';
import { WorkflowInspector } from './workflow-inspector';

function WorkflowInspectorHarness() {
  const [activeTab, setActiveTab] = useState<WorkflowInspectorTab>('obligations');

  return (
    <WorkflowInspector
      graph={null}
      activeTab={activeTab}
      highlightedNodeIds={[]}
      runningActionId={null}
      onSelectObligation={vi.fn()}
      onRunAction={vi.fn()}
      onTabChange={setActiveTab}
    />
  );
}

describe('WorkflowInspector', () => {
  it('wires tabs to tabpanels and supports keyboard navigation', () => {
    render(<WorkflowInspectorHarness />);

    const obligationsTab = screen.getByRole('tab', { name: /Obligations/i });
    const actionsTab = screen.getByRole('tab', { name: /Actions/i });

    expect(obligationsTab).toHaveAttribute('id', 'workflow-inspector-tab-obligations');
    expect(obligationsTab).toHaveAttribute('aria-controls', 'workflow-inspector-panel-obligations');
    expect(obligationsTab).toHaveAttribute('aria-selected', 'true');

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('id', 'workflow-inspector-panel-obligations');
    expect(panel).toHaveAttribute('aria-labelledby', 'workflow-inspector-tab-obligations');

    obligationsTab.focus();
    fireEvent.keyDown(obligationsTab, { key: 'ArrowRight' });

    expect(actionsTab).toHaveFocus();
    expect(actionsTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'workflow-inspector-panel-actions');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'workflow-inspector-tab-actions');
  });
});
