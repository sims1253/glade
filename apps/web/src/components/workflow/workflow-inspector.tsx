import { useMemo, useRef, type KeyboardEvent } from 'react';
import { Sparkles, TriangleAlert, type LucideIcon } from 'lucide-react';

import type { WorkflowActionRecord, WorkflowGraph, WorkflowObligationRecord } from '../../lib/graph-types';
import type { WorkflowInspectorTab } from '../../lib/workflow-workspace';
import { cn } from '../../lib/utils';
import {
  WorkflowActionsContent,
  WorkflowObligationsContent,
  WorkflowPanelShell,
} from './protocol-panels';

interface WorkflowInspectorProps {
  readonly graph: WorkflowGraph | null;
  readonly activeTab: WorkflowInspectorTab;
  readonly highlightedNodeIds: ReadonlyArray<string>;
  readonly runningActionId: string | null;
  readonly layout?: 'side' | 'stacked';
  readonly onSelectObligation: (obligation: WorkflowObligationRecord) => void;
  readonly onRunAction: (action: WorkflowActionRecord) => void;
  readonly onTabChange: (tab: WorkflowInspectorTab) => void;
}

export function WorkflowInspector({
  graph,
  activeTab,
  highlightedNodeIds,
  runningActionId,
  layout = 'side',
  onSelectObligation,
  onRunAction,
  onTabChange,
}: WorkflowInspectorProps) {
  const tabRefs = useRef<Record<WorkflowInspectorTab, HTMLButtonElement | null>>({
    obligations: null,
    actions: null,
  });
  const tabs: ReadonlyArray<{
    readonly id: WorkflowInspectorTab;
    readonly label: string;
    readonly count: number;
    readonly icon: LucideIcon;
  }> = useMemo(() => [
    {
      id: 'obligations',
      label: 'Obligations',
      count: graph?.obligations.length ?? 0,
      icon: TriangleAlert,
    },
    {
      id: 'actions',
      label: 'Actions',
      count: graph?.actions.length ?? 0,
      icon: Sparkles,
    },
  ], [graph?.actions.length, graph?.obligations.length]);

  const activePanelId = `workflow-inspector-panel-${activeTab}`;

  function focusTab(tab: WorkflowInspectorTab) {
    tabRefs.current[tab]?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextTab = tabs[nextIndex]?.id;
    if (!nextTab) {
      return;
    }

    onTabChange(nextTab);
    focusTab(nextTab);
  }

  return (
    <WorkflowPanelShell
      title="Inspector"
      icon={<TriangleAlert className="size-4" />}
      accentClassName="text-sky-200"
      description="Review obligations and recommended actions when the workspace is constrained."
      className={cn('border-slate-800/90', layout === 'stacked' && 'min-h-[20rem]')}
    >
      <div className="border-b border-slate-800/90 px-4 py-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Workflow inspector tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                id={`workflow-inspector-tab-${tab.id}`}
                role="tab"
                type="button"
                aria-selected={activeTab === tab.id}
                aria-controls={`workflow-inspector-panel-${tab.id}`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-colors',
                  activeTab === tab.id
                    ? 'border-sky-400/50 bg-sky-400/10 text-sky-50'
                    : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:bg-slate-900',
                )}
                ref={(element) => {
                  tabRefs.current[tab.id] = element;
                }}
                onClick={() => onTabChange(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, tabs.findIndex((entry) => entry.id === tab.id))}
              >
                <Icon className="size-3.5" />
                {tab.label}
                <span className="rounded-full bg-slate-950/70 px-2 py-0.5 text-[10px] text-slate-300">{tab.count}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div
        id={activePanelId}
        role="tabpanel"
        aria-labelledby={`workflow-inspector-tab-${activeTab}`}
      >
        {activeTab === 'obligations' ? (
          <WorkflowObligationsContent
            graph={graph}
            highlightedNodeIds={highlightedNodeIds}
            onSelectObligation={onSelectObligation}
            {...(layout === 'stacked' ? { className: 'max-h-[20rem]' } : {})}
          />
        ) : (
          <WorkflowActionsContent
            graph={graph}
            runningActionId={runningActionId}
            onRunAction={onRunAction}
            {...(layout === 'stacked' ? { className: 'max-h-[20rem]' } : {})}
          />
        )}
      </div>
    </WorkflowPanelShell>
  );
}
