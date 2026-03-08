import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { createFileRoute } from '@tanstack/react-router';

import { APP_DISPLAY_NAME } from '@glade/shared';

import { WorkflowCanvas } from '../components/graph/workflow-canvas';
import {
  PostActionGuidanceBanner,
  WorkflowActionPreviewDialog,
  WorkflowActionsPanel,
  WorkflowObligationsPanel,
  useTransientGuidanceReset,
} from '../components/workflow/protocol-panels';
import type { WorkflowActionRecord } from '../lib/graph-types';
import { Button } from '../components/ui/button';
import { ToastViewport } from '../components/ui/toast-viewport';
import { useServerConnection } from '../hooks/useServerConnection';
import { useAppStore } from '../store/app';
import { useGraphStore } from '../store/graph';

export const Route = createFileRoute('/')({
  component: IndexRoute,
});

export function IndexRoute() {
  const { dispatchCommand, dispatchHostCommand, reconnect } = useServerConnection();
  const serverConnected = useAppStore((state) => state.serverConnected);
  const serverVersion = useAppStore((state) => state.serverVersion);
  const sessionState = useAppStore((state) => state.sessionState);
  const graph = useGraphStore((state) => state.graph);
  const highlightedNodeIds = useGraphStore((state) => state.highlightedNodeIds);
  const setHighlightedNodeIds = useGraphStore((state) => state.setHighlightedNodeIds);
  const setSelectedNodeId = useGraphStore((state) => state.setSelectedNodeId);
  const [previewAction, setPreviewAction] = useState<WorkflowActionRecord | null>(null);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [awaitingGuidance, setAwaitingGuidance] = useState<{
    readonly actionId: string;
    readonly snapshotAt: string | null;
    readonly actionSignature: string;
  } | null>(null);
  const [guidanceActions, setGuidanceActions] = useState<ReadonlyArray<WorkflowActionRecord> | null>(null);
  const actionSignature = useMemo(
    () => graph?.actions.map((action) => action.id).join('|') ?? '',
    [graph],
  );

  const handleSelectObligation = useCallback((nodeIds: ReadonlyArray<string>) => {
    setHighlightedNodeIds(nodeIds);
    setSelectedNodeId(nodeIds[0] ?? null);
  }, [setHighlightedNodeIds, setSelectedNodeId]);

  const handleConfirmAction = useCallback(async () => {
    if (!previewAction || !graph) {
      return;
    }

    setRunningActionId(previewAction.id);
    const snapshotAt = graph.emittedAt;
    const previousActionSignature = actionSignature;
    const result = await dispatchCommand({
      type: 'ExecuteAction',
      actionId: previewAction.id,
      payload: previewAction.payload ?? undefined,
    });
    setRunningActionId(null);
    setPreviewAction(null);

    if (result.success) {
      setAwaitingGuidance({
        actionId: previewAction.id,
        snapshotAt,
        actionSignature: previousActionSignature,
      });
    }
  }, [actionSignature, dispatchCommand, graph, previewAction]);

  useEffect(() => {
    if (!awaitingGuidance || !graph) {
      return;
    }

    const sameSnapshot = awaitingGuidance.snapshotAt === graph.emittedAt;
    const sameActions = awaitingGuidance.actionSignature === actionSignature;
    if (sameSnapshot && sameActions) {
      return;
    }

    setAwaitingGuidance(null);
    setGuidanceActions(graph.actions.slice(0, 2));
  }, [actionSignature, awaitingGuidance, graph]);

  useTransientGuidanceReset(guidanceActions, () => setGuidanceActions(null));

  return (
    <section className="flex min-h-screen flex-col gap-6 px-6 py-6 sm:px-8">
      <ToastViewport />
      <WorkflowActionPreviewDialog
        action={previewAction}
        graph={graph}
        pending={runningActionId === previewAction?.id}
        onCancel={() => setPreviewAction(null)}
        onConfirm={() => void handleConfirmAction()}
      />
      <header className="grid gap-4 rounded-3xl border border-slate-800/80 bg-slate-950/70 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">phase 6 · node detail panel</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">{APP_DISPLAY_NAME}</h1>
          <p className="mt-3 max-w-3xl text-base text-slate-300">
            Review obligations, dispatch guided workflow actions, and inspect the full state of any node without dropping to the REPL.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 lg:justify-end">
          <Button onClick={reconnect}>
            <RefreshCw className="size-4" />
            Refresh connection
          </Button>
          <Button render={<a href="/health" />} variant="ghost">
            Open /health
          </Button>
        </div>
      </header>

      <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatusCard label="Version" value={serverVersion ?? 'checking…'} />
        <StatusCard label="Server" value={serverConnected ? 'connected' : 'disconnected'} />
        <StatusCard label="Session" value={sessionState} />
        <StatusCard label="Project" value={graph?.projectName ?? 'waiting…'} />
        <StatusCard
          label="Workflow"
          value={graph ? `${graph.status.workflowState} · ${graph.obligations.length} obligations / ${graph.actions.length} actions` : 'no snapshot'}
        />
      </dl>

      {guidanceActions?.length ? (
        <PostActionGuidanceBanner actions={guidanceActions} onDismiss={() => setGuidanceActions(null)} />
      ) : null}

      <div className="grid min-h-[40rem] flex-1 gap-6 xl:grid-cols-[22rem_minmax(0,1fr)_22rem]">
        <WorkflowObligationsPanel
          graph={graph}
          highlightedNodeIds={highlightedNodeIds}
          onSelectObligation={(obligation) => handleSelectObligation(obligation.affectedNodeIds)}
        />
        <div className="min-h-[40rem]">
          <WorkflowCanvas
            className="h-[calc(100vh-18rem)] min-h-[40rem]"
            dispatchCommand={dispatchCommand}
            dispatchHostCommand={dispatchHostCommand}
          />
        </div>
        <WorkflowActionsPanel
          graph={graph}
          runningActionId={runningActionId}
          onRunAction={(action) => setPreviewAction(action)}
        />
      </div>
    </section>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className="mt-2 text-lg font-medium text-slate-100">{value}</dd>
    </div>
  );
}
