import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowRight, Lock, Sparkles, TriangleAlert } from 'lucide-react';

import {
  type WorkflowActionRecord,
  type WorkflowGraph,
  type WorkflowObligationRecord,
} from '../../lib/graph-types';
import {
  describeTemplate,
  formatPreviewValue,
  formatScopeBadge,
  isBlockingSeverity,
} from '../../lib/workflow-protocol';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

type ObligationRow =
  | {
    readonly type: 'scope';
    readonly id: string;
    readonly label: string;
    readonly count: number;
  }
  | {
    readonly type: 'obligation';
    readonly id: string;
    readonly obligation: WorkflowObligationRecord;
  };

function nodeLabelsFor(graph: WorkflowGraph | null, nodeIds: ReadonlyArray<string>) {
  if (!graph) {
    return [];
  }

  return nodeIds.map((nodeId) => graph.nodesById[nodeId]?.label ?? nodeId);
}

function obligationsSummary(graph: WorkflowGraph | null) {
  return graph?.obligations.length
    ? `${graph.obligations.length} active workflow obligations`
    : 'No active obligations in the current snapshot.';
}

function actionsSummary(graph: WorkflowGraph | null) {
  const actions = graph?.actions ?? [];
  return actions.length
    ? `${actions.length} next step${actions.length === 1 ? '' : 's'} from bayesgrove`
    : `Nothing to do right now while workflow state is ${graph?.status.workflowState ?? 'unknown'}.`;
}

export function WorkflowPanelShell({
  title,
  icon,
  accentClassName,
  description,
  children,
  className,
}: {
  readonly title: string;
  readonly icon: ReactNode;
  readonly accentClassName: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <aside className={cn('flex h-full flex-col rounded-3xl border bg-slate-950/80 shadow-2xl shadow-slate-950/30 backdrop-blur', className)}>
      <div className="border-b border-slate-800/90 px-5 py-4">
        <div className={cn('flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em]', accentClassName)}>
          {icon}
          {title}
        </div>
        <p className="mt-2 text-sm text-slate-300">{description}</p>
      </div>
      {children}
    </aside>
  );
}

export function WorkflowObligationsContent({
  graph,
  highlightedNodeIds,
  onSelectObligation,
  className,
}: {
  readonly graph: WorkflowGraph | null;
  readonly highlightedNodeIds: ReadonlyArray<string>;
  readonly onSelectObligation: (obligation: WorkflowObligationRecord) => void;
  readonly className?: string;
}) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const rows = useMemo<Array<ObligationRow>>(() => {
    if (!graph) {
      return [];
    }

    return graph.protocolScopes
      .filter((scope) => scope.obligations.length > 0)
      .flatMap((scope) => [
        {
          type: 'scope',
          id: `scope:${scope.scope}`,
          label: scope.scopeLabel,
          count: scope.obligations.length,
        } satisfies ObligationRow,
        ...scope.obligations.map((obligation) => ({
          type: 'obligation',
          id: obligation.id,
          obligation,
        } satisfies ObligationRow)),
      ]);
  }, [graph]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (rows[index]?.type === 'scope' ? 40 : 136),
    overscan: 8,
  });

  if (!graph?.obligations.length) {
    return (
      <div className={cn('px-5 py-5 text-sm text-slate-400', className)}>
        The canvas is currently clear of blocking and advisory review work.
      </div>
    );
  }

  return (
    <div ref={parentRef} className={cn('min-h-0 flex-1 overflow-auto px-3 py-3', className)}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          if (!row) {
            return null;
          }

          if (row.type === 'scope') {
            return (
              <div
                key={row.id}
                className="absolute left-0 top-0 w-full px-2 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                {row.label} · {row.count}
              </div>
            );
          }

          const { obligation } = row;
          const isBlocking = isBlockingSeverity(obligation.severity);
          const nodeLabels = nodeLabelsFor(graph, obligation.affectedNodeIds);
          const isHighlighted = obligation.affectedNodeIds.every((nodeId) => highlightedNodeIds.includes(nodeId));

          return (
            <button
              key={row.id}
              className={cn(
                'absolute left-0 top-0 w-full rounded-2xl border px-4 py-4 text-left transition-colors',
                isBlocking
                  ? 'border-rose-500/50 bg-rose-950/25 hover:bg-rose-950/40'
                  : 'border-amber-500/35 bg-amber-950/20 hover:bg-amber-950/30',
                isHighlighted && 'ring-2 ring-sky-400/60',
              )}
              style={{ transform: `translateY(${item.start}px)` }}
              onClick={() => onSelectObligation(obligation)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-50">{obligation.title}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{obligation.kind}</p>
                </div>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]',
                    isBlocking
                      ? 'border-rose-400/60 bg-rose-400/12 text-rose-100'
                      : 'border-amber-400/50 bg-amber-400/10 text-amber-100',
                  )}
                >
                  {isBlocking ? <Lock className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
                  {obligation.severity ?? 'advisory'}
                </span>
              </div>

              <p className="mt-3 text-sm text-slate-300">
                {obligation.description ?? 'No additional explanation was included in this snapshot.'}
              </p>

              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                <span className="rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-1">
                  {formatScopeBadge(obligation.scope, obligation.scopeLabel)}
                </span>
                {nodeLabels.length ? (
                  <span className="rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-1">
                    Nodes: {nodeLabels.join(', ')}
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WorkflowActionsContent({
  graph,
  runningActionId,
  onRunAction,
  className,
}: {
  readonly graph: WorkflowGraph | null;
  readonly runningActionId: string | null;
  readonly onRunAction: (action: WorkflowActionRecord) => void;
  readonly className?: string;
}) {
  const actions = graph?.actions ?? [];

  if (!actions.length) {
    return (
      <div className={cn('px-5 py-5 text-sm text-slate-400', className)}>
        {graph?.status.runnableNodes
          ? `Bayesgrove reports ${graph.status.runnableNodes} runnable node${graph.status.runnableNodes === 1 ? '' : 's'}, but this build does not expose a direct "Run workflow" command yet. Use a bayesgrove action when one is offered or run from the shared REPL.`
          : 'Bayesgrove did not include any suggested actions in this snapshot.'}
      </div>
    );
  }

  return (
    <div className={cn('min-h-0 flex-1 overflow-auto space-y-3 px-4 py-4', className)}>
      {actions.map((action) => (
        <div key={action.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-50">{action.title}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{action.kind}</p>
            </div>
            <Button onClick={() => onRunAction(action)} disabled={runningActionId === action.id}>
              <ArrowRight className="size-4" />
              {runningActionId === action.id ? 'Running…' : 'Run'}
            </Button>
          </div>

          <p className="mt-3 text-sm text-slate-300">
            {action.description ?? 'No extra action description was included in this snapshot.'}
          </p>

          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
            <span className="rounded-full border border-slate-700 bg-slate-950/80 px-2.5 py-1">
              {formatScopeBadge(action.scope, action.scopeLabel)}
            </span>
            {action.templateRef ? (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-100">
                template: {action.templateRef}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function WorkflowObligationsPanel({
  graph,
  highlightedNodeIds,
  onSelectObligation,
}: {
  readonly graph: WorkflowGraph | null;
  readonly highlightedNodeIds: ReadonlyArray<string>;
  readonly onSelectObligation: (obligation: WorkflowObligationRecord) => void;
}) {
  return (
    <WorkflowPanelShell
      title="Obligations"
      icon={<TriangleAlert className="size-4" />}
      accentClassName="text-rose-200"
      description={obligationsSummary(graph)}
      className="border-rose-950/60"
    >
      <WorkflowObligationsContent
        graph={graph}
        highlightedNodeIds={highlightedNodeIds}
        onSelectObligation={onSelectObligation}
      />
    </WorkflowPanelShell>
  );
}

export function WorkflowActionsPanel({
  graph,
  runningActionId,
  onRunAction,
}: {
  readonly graph: WorkflowGraph | null;
  readonly runningActionId: string | null;
  readonly onRunAction: (action: WorkflowActionRecord) => void;
}) {
  return (
    <WorkflowPanelShell
      title="Recommended Actions"
      icon={<Sparkles className="size-4" />}
      accentClassName="text-emerald-200"
      description={actionsSummary(graph)}
      className="border-slate-800/90"
    >
      <WorkflowActionsContent
        graph={graph}
        runningActionId={runningActionId}
        onRunAction={onRunAction}
      />
    </WorkflowPanelShell>
  );
}

export function WorkflowActionPreviewDialog({
  action,
  graph,
  pending,
  onCancel,
  onConfirm,
}: {
  readonly action: WorkflowActionRecord | null;
  readonly graph: WorkflowGraph | null;
  readonly pending: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  if (!action) {
    return null;
  }

  const nodeLabels = nodeLabelsFor(graph, action.affectedNodeIds);
  const templateDescription = describeTemplate(action);
  const payloadEntries = Object.entries(action.payload ?? {}).filter(([key]) => key !== 'template_ref');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Action Preview</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-50">{action.title}</h2>
          </div>
          {action.templateRef ? (
            <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">
              {action.templateRef}
            </span>
          ) : null}
        </div>

        <p className="mt-4 text-sm text-slate-300">
          {action.description ?? 'Bayesgrove did not include additional preview text for this action.'}
        </p>

        {templateDescription ? (
          <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-4 text-sm text-emerald-50">
            {templateDescription}
          </div>
        ) : null}

        <dl className="mt-5 grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-slate-400">Kind</dt>
            <dd className="mt-1">{action.kind}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-slate-400">Scope</dt>
            <dd className="mt-1">{formatScopeBadge(action.scope, action.scopeLabel)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-slate-400">Affected nodes</dt>
            <dd className="mt-1">{nodeLabels.length ? nodeLabels.join(', ') : 'No node targets listed.'}</dd>
          </div>
        </dl>

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Parameters</p>
          {payloadEntries.length ? (
            <div className="mt-3 space-y-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              {payloadEntries.map(([key, value]) => (
                <div key={key} className="flex items-start justify-between gap-4 text-sm text-slate-300">
                  <span className="font-medium text-slate-100">{key}</span>
                  <span className="max-w-[24rem] text-right text-slate-400">{formatPreviewValue(value)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">
              No action-specific parameters were exposed in this snapshot.
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? 'Running…' : 'Confirm and run'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PostActionGuidanceBanner({
  actions,
  onDismiss,
}: {
  readonly actions: ReadonlyArray<WorkflowActionRecord> | null;
  readonly onDismiss: () => void;
}) {
  if (!actions?.length) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-50 shadow-lg shadow-emerald-950/20">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Next from bayesgrove</p>
          <div className="mt-2 space-y-2">
            {actions.map((action) => (
              <div key={action.id}>
                <p className="font-semibold">{action.title}</p>
                {action.description ? <p className="text-emerald-100/85">{action.description}</p> : null}
              </div>
            ))}
          </div>
        </div>
        <Button variant="ghost" className="border-emerald-400/30 text-emerald-50 hover:bg-emerald-500/15" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

export function useTransientGuidanceReset(
  actions: ReadonlyArray<WorkflowActionRecord> | null,
  onDismiss: () => void,
  delayMs = 8_000,
) {
  useEffect(() => {
    if (!actions?.length) {
      return;
    }

    const timeout = window.setTimeout(onDismiss, delayMs);
    return () => window.clearTimeout(timeout);
  }, [actions, delayMs, onDismiss]);
}
