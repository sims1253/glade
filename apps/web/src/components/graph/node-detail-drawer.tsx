import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ExternalLink, FolderOpen, GitBranch, Link2, NotebookPen, PanelRightClose, SlidersHorizontal, SquareDashedMousePointer, Unlink2 } from 'lucide-react';

import type { CommandResult, HostCommand, WorkflowCommand } from '@glade/contracts';

import { getDownstreamNodeIds, getUpstreamNodeIds } from '../../lib/graph-interactions';
import type {
  WorkflowGraph,
  WorkflowNodeData,
  WorkflowNodeDecisionRecord,
  WorkflowNodeSummaryRecord,
} from '../../lib/graph-types';
import { formatKindLabel } from '../../lib/graph-types';
import { hasNativeFilePicker, readDesktopRuntime } from '../../lib/runtime';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { SchemaDrivenForm } from '../extensions/schema-form';

function formatTimestamp(value: string | null) {
  if (!value) {
    return 'Unknown time';
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.valueOf())
    ? value
    : timestamp.toLocaleString();
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function severityTone(severity: string | null) {
  if (severity === 'blocking' || severity === 'error') {
    return 'border-rose-400/40 bg-rose-500/10 text-rose-100';
  }

  if (severity === 'advisory' || severity === 'warning') {
    return 'border-amber-400/40 bg-amber-500/10 text-amber-100';
  }

  return 'border-slate-700 bg-slate-900 text-slate-200';
}

function statusTone(status: WorkflowNodeData['status']) {
  switch (status) {
    case 'error':
      return 'bg-rose-400';
    case 'warning':
    case 'blocked':
      return 'bg-amber-400';
    case 'pending':
      return 'bg-sky-400';
    case 'held':
      return 'bg-violet-400';
    case 'stale':
      return 'bg-slate-500';
    default:
      return 'bg-emerald-400';
  }
}

function emptyJsonObject(value: Record<string, unknown> | null) {
  return value && Object.keys(value).length > 0 ? value : null;
}

function SummaryRow({ summary }: { readonly summary: WorkflowNodeSummaryRecord }) {
  const detail = {
    metrics: emptyJsonObject(summary.metrics),
    metadata: emptyJsonObject(summary.metadata),
  };
  const hasDetail = Boolean(detail.metrics || detail.metadata);

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-50">{summary.label}</p>
          <p className="mt-1 text-xs text-slate-400">{formatTimestamp(summary.recordedAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
          <span className={cn('rounded-full border px-2.5 py-1', severityTone(summary.severity))}>
            {summary.severity ?? 'info'}
          </span>
          {summary.passed !== null ? (
            <span
              className={cn(
                'rounded-full border px-2.5 py-1',
                summary.passed
                  ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                  : 'border-rose-400/40 bg-rose-500/10 text-rose-100',
              )}
            >
              {summary.passed ? 'passed' : 'failed'}
            </span>
          ) : null}
        </div>
      </div>

      {hasDetail ? (
        <details className="mt-3 rounded-xl border border-slate-800/90 bg-slate-900/60 p-3">
          <summary className="cursor-pointer text-sm text-slate-200">Details</summary>
          {detail.metrics ? (
            <div className="mt-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Metrics</p>
              <pre className="mt-2 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-300">{formatJson(detail.metrics)}</pre>
            </div>
          ) : null}
          {detail.metadata ? (
            <div className="mt-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Metadata</p>
              <pre className="mt-2 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-300">{formatJson(detail.metadata)}</pre>
            </div>
          ) : null}
        </details>
      ) : null}
    </article>
  );
}

function DecisionRow({ decision }: { readonly decision: WorkflowNodeDecisionRecord }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-50">{formatKindLabel(decision.kind)}</p>
          <p className="mt-1 text-xs text-slate-400">{formatTimestamp(decision.recordedAt)}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-300">
        {decision.basisExcerpt ?? 'No basis excerpt was recorded for this decision.'}
      </p>
    </article>
  );
}

function EmptyPanelState({ label }: { readonly label: string }) {
  return <p className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 px-4 py-5 text-sm text-slate-400">{label}</p>;
}

function LineageList({
  label,
  nodes,
  expanded,
  onToggle,
  onSelectNode,
}: {
  readonly label: string;
  readonly nodes: ReadonlyArray<WorkflowNodeData>;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly onSelectNode: (nodeId: string) => void;
}) {
  const visibleNodes = expanded ? nodes : nodes.slice(0, 5);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-200">{label}</p>
        <span className="text-xs text-slate-500">{nodes.length}</span>
      </div>
      {nodes.length > 0 ? (
        <div className="mt-3 space-y-2">
          {visibleNodes.map((node) => (
            <button
              key={node.id}
              className="flex w-full items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-3 text-left hover:bg-slate-900"
              onClick={() => onSelectNode(node.id)}
            >
              <span>
                <span className="block text-sm font-medium text-slate-100">{node.label}</span>
                <span className="mt-1 block text-xs text-slate-400">{formatKindLabel(node.kind)}</span>
              </span>
              <GitBranch className="size-4 text-slate-500" />
            </button>
          ))}
          {nodes.length > 5 ? (
            <button className="text-sm text-emerald-300 hover:text-emerald-200" onClick={onToggle}>
              {expanded ? 'Show less' : `Show ${nodes.length - 5} more`}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-400">No {label.toLowerCase()}.</p>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  readonly title: string;
  readonly icon: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-800/80 bg-slate-950/75 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-200">
        {icon}
        {title}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function NodeDetailDrawer({
  graph,
  node,
  dispatchCommand,
  dispatchHostCommand,
  onClose,
  onSelectNode,
}: {
  readonly graph: WorkflowGraph;
  readonly node: WorkflowNodeData;
  readonly dispatchCommand: (command: WorkflowCommand) => Promise<CommandResult>;
  readonly dispatchHostCommand: (command: HostCommand) => Promise<CommandResult>;
  readonly onClose: () => void;
  readonly onSelectNode: (nodeId: string) => void;
}) {
  const summaryParentRef = useRef<HTMLDivElement | null>(null);
  const [renameDraft, setRenameDraft] = useState(node.label);
  const [renamePending, setRenamePending] = useState(false);
  const [notesDraft, setNotesDraft] = useState(node.notes);
  const [notesPending, setNotesPending] = useState(false);
  const [paramsPending, setParamsPending] = useState(false);
  const [manualPathDraft, setManualPathDraft] = useState(node.linkedFilePath ?? '');
  const [filePending, setFilePending] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [showAllAncestors, setShowAllAncestors] = useState(false);
  const [showAllDescendants, setShowAllDescendants] = useState(false);
  const nativeFilePicker = hasNativeFilePicker();
  const lastServerStateRef = useRef({
    id: node.id,
    label: node.label,
    notes: node.notes,
    linkedFilePath: node.linkedFilePath ?? '',
  });

  useEffect(() => {
    const previousServerState = lastServerStateRef.current;
    const nextLinkedFilePath = node.linkedFilePath ?? '';
    const nodeChanged = previousServerState.id !== node.id;

    if (nodeChanged || (!renamePending && renameDraft === previousServerState.label)) {
      setRenameDraft(node.label);
    }

    if (nodeChanged || (!notesPending && notesDraft === previousServerState.notes)) {
      setNotesDraft(node.notes);
    }

    if (nodeChanged || (!filePending && manualPathDraft === previousServerState.linkedFilePath)) {
      setManualPathDraft(nextLinkedFilePath);
    }

    if (nodeChanged) {
      setFileError(null);
      setShowAllAncestors(false);
      setShowAllDescendants(false);
    }

    lastServerStateRef.current = {
      id: node.id,
      label: node.label,
      notes: node.notes,
      linkedFilePath: nextLinkedFilePath,
    };
  }, [
    filePending,
    manualPathDraft,
    node.id,
    node.label,
    node.linkedFilePath,
    node.notes,
    notesDraft,
    notesPending,
    renameDraft,
    renamePending,
  ]);

  const summaryVirtualizer = useVirtualizer({
    count: node.summaries.length,
    getScrollElement: () => summaryParentRef.current,
    estimateSize: () => 156,
    overscan: 6,
  });

  const ancestors = useMemo(
    () =>
      getUpstreamNodeIds(graph, node.id)
        .map((nodeId) => graph.nodesById[nodeId] ?? null)
        .filter((entry): entry is WorkflowNodeData => entry !== null),
    [graph, node.id],
  );

  const descendants = useMemo(
    () =>
      getDownstreamNodeIds(graph, node.id)
        .map((nodeId) => graph.nodesById[nodeId] ?? null)
        .filter((entry): entry is WorkflowNodeData => entry !== null),
    [graph, node.id],
  );
  const nodeOptions = useMemo(
    () => graph.nodes.map((entry) => ({ id: entry.id, label: entry.label })),
    [graph.nodes],
  );

  async function submitRename() {
    const label = renameDraft.trim();
    if (!label || label === node.label) {
      setRenameDraft(node.label);
      return;
    }

    setRenamePending(true);
    const result = await dispatchCommand({
      type: 'RenameNode',
      nodeId: node.id,
      label,
    });
    setRenamePending(false);

    if (!result.success) {
      setRenameDraft(node.label);
    }
  }

  async function submitNotes() {
    if (notesDraft === node.notes) {
      return;
    }

    setNotesPending(true);
    const result = await dispatchCommand({
      type: 'UpdateNodeNotes',
      nodeId: node.id,
      notes: notesDraft,
    });
    setNotesPending(false);

    if (!result.success) {
      setNotesDraft(node.notes);
    }
  }

  async function submitParameters(params: Record<string, unknown>) {
    setParamsPending(true);
    try {
      const result = await dispatchCommand({
        type: 'UpdateNodeParameters',
        nodeId: node.id,
        params,
      });
      if (!result.success) {
        throw new Error(result.error?.message ?? 'Could not update node parameters.');
      }
    } finally {
      setParamsPending(false);
    }
  }

  async function setLinkedFile(path: string | null) {
    setFilePending(true);
    setFileError(null);
    const result = await dispatchCommand({
      type: 'SetNodeFile',
      nodeId: node.id,
      path,
    });
    setFilePending(false);

    if (!result.success) {
      setFileError(result.error?.message ?? 'Could not update the linked file.');
      setManualPathDraft(node.linkedFilePath ?? '');
    }
  }

  async function handleOpenFile() {
    if (!node.linkedFilePath) {
      return;
    }

    setFilePending(true);
    setFileError(null);
    const result = await dispatchHostCommand({
      type: 'OpenFileInEditor',
      path: node.linkedFilePath,
    });
    setFilePending(false);

    if (!result.success) {
      setFileError(result.error?.message ?? 'Could not open the linked file in an editor.');
    }
  }

  async function handlePickFile() {
    const runtime = readDesktopRuntime();
    if (!runtime?.selectFilePath) {
      return;
    }

    const selectedPath = await runtime.selectFilePath();
    if (!selectedPath) {
      return;
    }

    setManualPathDraft(selectedPath);
    await setLinkedFile(selectedPath);
  }

  return (
    <aside className="absolute inset-y-0 right-0 z-20 w-full max-w-xl border-l border-slate-800/90 bg-slate-950/95 shadow-2xl shadow-slate-950/60 backdrop-blur xl:max-w-2xl">
      <div className="flex h-full flex-col">
        <header className="border-b border-slate-800/90 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <label className="text-xs uppercase tracking-[0.18em] text-slate-400" htmlFor="node-detail-label">
                Node label
              </label>
              <input
                id="node-detail-label"
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                onBlur={() => void submitRename()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur();
                  }
                  if (event.key === 'Escape') {
                    setRenameDraft(node.label);
                    event.currentTarget.blur();
                  }
                }}
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-xl font-semibold text-slate-50 outline-hidden"
              />
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
                <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-100">
                  {formatKindLabel(node.kind)}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-100">
                  <span className={cn('size-2 rounded-full', statusTone(node.status))} />
                  {node.status}
                </span>
                {node.branchScopeLabel ? (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-100">
                    {node.branchScopeLabel}
                  </span>
                ) : null}
                {renamePending ? <span className="text-slate-400">saving...</span> : null}
              </div>
            </div>
            <Button variant="ghost" onClick={onClose}>
              <PanelRightClose className="size-4" />
              Close
            </Button>
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-auto px-5 py-4">
          <Section title="Summary Log" icon={<SquareDashedMousePointer className="size-4" />}>
            {node.summaries.length > 0 ? (
              <div ref={summaryParentRef} className="h-80 overflow-auto pr-1">
                <div className="relative" style={{ height: `${summaryVirtualizer.getTotalSize()}px` }}>
                  {summaryVirtualizer.getVirtualItems().map((item) => {
                    const summary = node.summaries[item.index];
                    if (!summary) {
                      return null;
                    }

                    return (
                      <div
                        key={summary.id}
                        data-index={item.index}
                        ref={summaryVirtualizer.measureElement}
                        className="absolute left-0 top-0 w-full pb-3"
                        style={{ transform: `translateY(${item.start}px)` }}
                      >
                        <SummaryRow summary={summary} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <EmptyPanelState label="No summaries recorded yet." />
            )}
          </Section>

          <Section title="Decisions" icon={<NotebookPen className="size-4" />}>
            {node.decisions.length > 0 ? (
              <div className="space-y-3">
                {node.decisions.map((decision) => (
                  <DecisionRow key={decision.id} decision={decision} />
                ))}
              </div>
            ) : (
              <EmptyPanelState label="No decisions recorded." />
            )}
          </Section>

          <Section title="Notes" icon={<NotebookPen className="size-4" />}>
            <label className="sr-only" htmlFor="node-detail-notes">Notes</label>
            <textarea
              id="node-detail-notes"
              value={notesDraft}
              onChange={(event) => setNotesDraft(event.target.value)}
              onBlur={() => void submitNotes()}
              className="min-h-40 w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-slate-100 outline-hidden"
              placeholder="Add working notes for this node."
            />
            <p className="mt-2 text-xs text-slate-400">{notesPending ? 'saving...' : 'Notes save on blur.'}</p>
          </Section>

          {node.parameterSchema ? (
            <Section title="Parameters" icon={<SlidersHorizontal className="size-4" />}>
              <SchemaDrivenForm
                schema={node.parameterSchema}
                initialValue={node.parameters ?? {}}
                resetKey={node.id}
                nodeOptions={nodeOptions}
                submitLabel={paramsPending ? 'Saving parameters...' : 'Save parameters'}
                pending={paramsPending}
                onSubmit={submitParameters}
              />
            </Section>
          ) : null}

          <Section title="Linked File" icon={<Link2 className="size-4" />}>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-sm text-slate-200">{node.linkedFilePath ?? 'No file linked.'}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button onClick={() => void handleOpenFile()} disabled={!node.linkedFilePath || filePending}>
                  <ExternalLink className="size-4" />
                  Open in editor
                </Button>
                {nativeFilePicker ? (
                  <Button variant="ghost" onClick={() => void handlePickFile()} disabled={filePending}>
                    <FolderOpen className="size-4" />
                    Link file
                  </Button>
                ) : null}
                {node.linkedFilePath ? (
                  <Button variant="ghost" onClick={() => void setLinkedFile(null)} disabled={filePending}>
                    <Unlink2 className="size-4" />
                    Unlink
                  </Button>
                ) : null}
              </div>
            </div>

            {!nativeFilePicker ? (
              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <label className="text-xs uppercase tracking-[0.18em] text-slate-400" htmlFor="node-detail-file-path">
                  Enter file path
                </label>
                <div className="mt-3 flex gap-3">
                  <input
                    id="node-detail-file-path"
                    value={manualPathDraft}
                    onChange={(event) => {
                      setFileError(null);
                      setManualPathDraft(event.target.value);
                    }}
                    placeholder="/path/to/file"
                    className="min-w-0 flex-1 rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-hidden"
                  />
                  <Button
                    onClick={() => void setLinkedFile(manualPathDraft.trim() || null)}
                    disabled={filePending}
                  >
                    Set
                  </Button>
                </div>
              </div>
            ) : null}

            {fileError ? <p className="mt-3 text-sm text-rose-200">{fileError}</p> : null}
          </Section>

          <Section title="Branch Lineage" icon={<GitBranch className="size-4" />}>
            <div className="space-y-5">
              <LineageList
                label="Ancestors"
                nodes={ancestors}
                expanded={showAllAncestors}
                onToggle={() => setShowAllAncestors((current) => !current)}
                onSelectNode={onSelectNode}
              />
              <LineageList
                label="Descendants"
                nodes={descendants}
                expanded={showAllDescendants}
                onToggle={() => setShowAllDescendants((current) => !current)}
                onSelectNode={onSelectNode}
              />
            </div>
          </Section>
        </div>
      </div>
    </aside>
  );
}
