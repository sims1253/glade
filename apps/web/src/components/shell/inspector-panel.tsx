import { useCallback, useMemo } from 'react';
import { ArrowLeftRight, FileCode2, Play } from 'lucide-react';

import type { WorkflowActionRecord, WorkflowGraph, WorkflowNodeData, WorkflowObligationRecord } from '../../lib/graph-types';
import { cn } from '../../lib/utils';
import type { WorkflowInspectorTab } from '../../lib/workflow-workspace';
import { useWorkspaceStore } from '../../store/workspace';
import { Button } from '../ui/button';

function isMacPlatform() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const userAgentDataPlatform = (navigator as Navigator & {
    userAgentData?: { platform?: string };
  }).userAgentData?.platform;
  if (userAgentDataPlatform) {
    return userAgentDataPlatform.toLowerCase().includes('mac');
  }

  if (typeof navigator.userAgent === 'string' && /mac|macintosh/i.test(navigator.userAgent)) {
    return true;
  }

  return typeof navigator.platform === 'string' && navigator.platform.includes('Mac');
}

function getStatusBadge(node: WorkflowNodeData) {
  const tone = ({
    blocked: 'bg-amber-100 text-amber-800',
    error: 'bg-rose-100 text-rose-700',
    ok: 'bg-emerald-100 text-emerald-700',
    pending: 'bg-sky-100 text-sky-700',
    stale: 'bg-slate-200 text-slate-700',
    warning: 'bg-amber-100 text-amber-800',
    held: 'bg-violet-100 text-violet-700',
  } as const)[node.status] ?? 'bg-slate-100 text-slate-700';

  return <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em]', tone)}>{node.status}</span>;
}

interface InspectorPanelProps {
  graph: WorkflowGraph | null;
  onRunNode?: ((node: WorkflowNodeData) => void) | undefined;
  onRunAction?: ((action: WorkflowActionRecord) => void) | undefined;
  onSelectObligation?: ((obligation: WorkflowObligationRecord) => void) | undefined;
  onReturnToCanvas?: (() => void) | undefined;
  className?: string | undefined;
}

export function InspectorPanel({ graph, onRunAction, onRunNode, onReturnToCanvas, onSelectObligation, className }: InspectorPanelProps) {
  const selectedNodeId = useWorkspaceStore((state) => state.selectedNodeId);
  const inspectorTab = useWorkspaceStore((state) => state.inspectorTab);
  const setInspectorTab = useWorkspaceStore((state) => state.setInspectorTab);
  const inspectorVisible = useWorkspaceStore((state) => state.inspectorVisible);

  const selectedNode = useMemo(
    () => graph?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [graph?.nodes, selectedNodeId],
  );

  if (!inspectorVisible) {
    return null;
  }

  return (
    <aside className={cn('flex h-full flex-col border-l border-slate-200 bg-white', className)}>
      {selectedNode ? (
        <NodeInspector node={selectedNode} onReturnToCanvas={onReturnToCanvas} onRunNode={onRunNode} />
      ) : (
        <DefaultInspector activeTab={inspectorTab} graph={graph} onRunAction={onRunAction} onSelectObligation={onSelectObligation} onTabChange={setInspectorTab} />
      )}
    </aside>
  );
}

function NodeInspector({
  node,
  onRunNode,
  onReturnToCanvas,
}: {
  node: WorkflowNodeData;
  onRunNode?: ((node: WorkflowNodeData) => void) | undefined;
  onReturnToCanvas?: (() => void) | undefined;
}) {
  const handleRun = useCallback(() => onRunNode?.(node), [node, onRunNode]);
  const shortcut = isMacPlatform() ? '⌘↵' : 'Ctrl+Enter';

  return (
    <>
      <header className="border-b border-slate-200 px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Inspector</p>
        <h2 className="mt-2 text-lg font-semibold text-slate-900">{node.label}</h2>
        <p className="mt-1 text-sm text-slate-500">{node.kind.replaceAll('_', ' ')}</p>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Node status</p>
              <p className="mt-2 text-sm text-slate-600">{node.blockReason ? node.blockReason.replaceAll('_', ' ') : 'Ready for the next workflow action.'}</p>
            </div>
            {getStatusBadge(node)}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-white p-3">
              <dt className="text-slate-500">Linked obligations</dt>
              <dd className="mt-1 font-semibold text-slate-900">{node.obligationCount}</dd>
            </div>
            <div className="rounded-xl bg-white p-3">
              <dt className="text-slate-500">Decisions</dt>
              <dd className="mt-1 font-semibold text-slate-900">{node.decisions.length}</dd>
            </div>
          </dl>
        </section>

        <section className="space-y-2">
          {(node.rendererKind === 'fit' || node.rendererKind === 'model_spec') ? (
            <Button className="w-full justify-center" onClick={handleRun}>
              <Play className="size-4" />
              Run node ({shortcut})
            </Button>
          ) : null}
          {onReturnToCanvas ? (
            <Button className="w-full justify-center border-slate-300 bg-white text-slate-900 hover:bg-slate-100" variant="ghost" onClick={onReturnToCanvas}>
              <ArrowLeftRight className="size-4" />
              Return to canvas
            </Button>
          ) : null}
        </section>

        {node.notes ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Notes</p>
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{node.notes}</p>
          </section>
        ) : null}

        {node.linkedFilePath ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <FileCode2 className="size-4 text-slate-500" />
              Linked file
            </div>
            <p className="mt-2 break-all text-sm text-slate-600">{node.linkedFilePath}</p>
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Recent summaries</p>
          {node.summaries.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {node.summaries.slice(0, 3).map((summary) => (
                <li key={summary.id} className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                  <p className="font-medium text-slate-900">{summary.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{summary.recordedAt ?? 'Unknown time'}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No summaries recorded for this node yet.</p>
          )}
        </section>
      </div>
    </>
  );
}

function DefaultInspector({
  graph,
  activeTab,
  onRunAction,
  onSelectObligation,
  onTabChange,
}: {
  graph: WorkflowGraph | null;
  activeTab: WorkflowInspectorTab;
  onRunAction?: ((action: WorkflowActionRecord) => void) | undefined;
  onSelectObligation?: ((obligation: WorkflowObligationRecord) => void) | undefined;
  onTabChange: (tab: WorkflowInspectorTab) => void;
}) {
  const obligations = graph?.obligations ?? [];
  const actions = graph?.actions ?? [];
  const rows = activeTab === 'obligations' ? obligations : actions;
  const obligationsTabId = 'workspace-inspector-tab-obligations';
  const actionsTabId = 'workspace-inspector-tab-actions';
  const obligationsPanelId = 'workspace-inspector-panel-obligations';
  const actionsPanelId = 'workspace-inspector-panel-actions';

  return (
    <>
      <header className="border-b border-slate-200 px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Inspector</p>
        <div className="mt-3 grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Inspector tabs">
          <button
            aria-controls={obligationsPanelId}
            aria-selected={activeTab === 'obligations'}
            id={obligationsTabId}
            type="button"
            onClick={() => onTabChange('obligations')}
            role="tab"
            tabIndex={activeTab === 'obligations' ? 0 : -1}
            className={cn(
              'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              activeTab === 'obligations' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
            )}
          >
            Obligations ({obligations.length})
          </button>
          <button
            aria-controls={actionsPanelId}
            aria-selected={activeTab === 'actions'}
            id={actionsTabId}
            type="button"
            onClick={() => onTabChange('actions')}
            role="tab"
            tabIndex={activeTab === 'actions' ? 0 : -1}
            className={cn(
              'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              activeTab === 'actions' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
            )}
          >
            Actions ({actions.length})
          </button>
        </div>
      </header>

      <div
        className="flex-1 overflow-y-auto p-4"
        aria-labelledby={activeTab === 'obligations' ? obligationsTabId : actionsTabId}
        id={activeTab === 'obligations' ? obligationsPanelId : actionsPanelId}
        role="tabpanel"
      >
        {rows.length > 0 ? (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-xs">
                <p className="text-sm font-semibold text-slate-900">{row.title}</p>
                {row.description ? <p className="mt-2 text-sm text-slate-600">{row.description}</p> : null}
                <p className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{row.scopeLabel}</p>
                {activeTab === 'actions' && onRunAction ? (
                  <Button className="mt-4 w-full justify-center" onClick={() => onRunAction(row as WorkflowActionRecord)}>
                    <Play className="size-4" />
                    Run
                  </Button>
                ) : null}
                {activeTab === 'obligations' && onSelectObligation ? (
                  <Button
                    className="mt-4 w-full justify-center border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                    variant="ghost"
                    onClick={() => onSelectObligation(row as WorkflowObligationRecord)}
                  >
                    Focus related nodes
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No {activeTab} yet.
          </div>
        )}
      </div>
    </>
  );
}
