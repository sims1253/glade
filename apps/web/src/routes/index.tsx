import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Activity, ExternalLink, RefreshCw, Settings2, TerminalSquare } from 'lucide-react';

import { APP_DISPLAY_NAME } from '@glade/shared';

import { WorkspaceShell, type CommandItem } from '../components/shell';
import { Button } from '../components/ui/button';
import { ToastViewport } from '../components/ui/toast-viewport';
import {
  PostActionGuidanceBanner,
  WorkflowActionPreviewDialog,
  useTransientGuidanceReset,
} from '../components/workflow/protocol-panels';
import type { WorkflowActionRecord, WorkflowNodeData, WorkflowObligationRecord } from '../lib/graph-types';
import { toJsonObject } from '../lib/json';
import { setupDesktopIssues, trimCommand } from '../lib/desktop-preflight';
import { useServerSession } from '../lib/server-session-context';
import { useConnectionStore } from '../store/connection';
import { useGraphStore } from '../store/graph';
import { useToastStore } from '../store/toast';
import { useWorkspaceStore } from '../store/workspace';

export const Route = createFileRoute('/')({
  component: IndexRoute,
});

function navigateTo(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function openTerminalRoute() {
  window.open('/terminal', '_blank', 'popup,width=980,height=620');
}

function findNodeAction(graphActionList: ReadonlyArray<WorkflowActionRecord>, nodeIds: ReadonlyArray<string>) {
  return graphActionList.find((action) =>
    nodeIds.every((nodeId) => action.affectedNodeIds.includes(nodeId)),
  ) ?? null;
}

export function IndexRoute() {
  const { rpc, nativeApi, isConnected, serverVersion, sessionState } = useServerSession();
  const sessionReason = useConnectionStore((state) => state.sessionReason);
  const desktopEnvironment = useConnectionStore((state) => state.desktopEnvironment);
  const graph = useGraphStore((state) => state.graph);
  const pushNotification = useToastStore((state) => state.pushNotification);
  const setHighlightedNodeIds = useGraphStore((state) => state.setHighlightedNodeIds);
  const setSelectedNodeId = useGraphStore((state) => state.setSelectedNodeId);
  const toggleInspector = useWorkspaceStore((state) => state.toggleInspector);
  const setActiveTab = useWorkspaceStore((state) => state.setActiveTab);
  const [previewAction, setPreviewAction] = useState<WorkflowActionRecord | null>(null);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [awaitingGuidance, setAwaitingGuidance] = useState<{
    readonly snapshotAt: string | null;
    readonly actionSignature: string;
  } | null>(null);
  const [guidanceActions, setGuidanceActions] = useState<ReadonlyArray<WorkflowActionRecord> | null>(null);
  const [isHealthDialogOpen, setIsHealthDialogOpen] = useState(false);
  const closeHealthDialogButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const actionSignature = useMemo(() => graph?.actions.map((action) => action.id).join('|') ?? '', [graph]);
  const desktopIssues = useMemo(() => setupDesktopIssues(desktopEnvironment, sessionReason), [desktopEnvironment, sessionReason]);
  const healthPayload = useMemo(() => JSON.stringify({
    endpoint: `${window.location.origin}/health`,
    status: isConnected ? 'ok' : 'error',
    version: serverVersion ?? 'unknown',
    sessionState,
    sessionReason,
  }, null, 2), [isConnected, serverVersion, sessionReason, sessionState]);

  const executeActionMutation = useMutation({
    mutationFn: async (action: WorkflowActionRecord) => rpc.workflow.executeAction({
      actionId: action.id,
      payload: toJsonObject(action.payload),
    }),
    onMutate: (action) => {
      setRunningActionId(action.id);
    },
    onSettled: () => {
      setRunningActionId(null);
    },
  });

  const handleRunAction = useCallback((action: WorkflowActionRecord) => {
    setPreviewAction(action);
  }, []);

  const handleSelectObligation = useCallback((obligation: WorkflowObligationRecord) => {
    setHighlightedNodeIds(obligation.affectedNodeIds);
    setSelectedNodeId(obligation.affectedNodeIds[0] ?? null);
  }, [setHighlightedNodeIds, setSelectedNodeId]);

  const handleConfirmAction = useCallback(async () => {
    if (!previewAction || !graph) {
      return;
    }

    const snapshotAt = graph.emittedAt;
    const previousActionSignature = actionSignature;
    const result = await executeActionMutation.mutateAsync(previewAction);
    setPreviewAction(null);

    if (result.success) {
      setAwaitingGuidance({
        snapshotAt,
        actionSignature: previousActionSignature,
      });
    }
  }, [actionSignature, executeActionMutation, graph, previewAction]);

  const handleRunNode = useCallback((node: WorkflowNodeData) => {
    const action = findNodeAction(graph?.actions ?? [], [node.id]);
    if (!action) {
      pushNotification({
        tone: 'error',
        title: 'No node action available',
        description: `No runnable action is currently available for ${node.label}.`,
      });
      return;
    }

    setPreviewAction(action);
  }, [graph?.actions, pushNotification]);

  const handleCompareSelection = useCallback((nodeIds: ReadonlyArray<string>) => {
    const action = findNodeAction(graph?.actions ?? [], nodeIds);
    if (!action) {
      pushNotification({
        tone: 'error',
        title: 'No compare action available',
        description: 'Glade does not currently have a compare action for this selection.',
      });
      return;
    }

    setPreviewAction(action);
  }, [graph?.actions, pushNotification]);

  const commands = useMemo<ReadonlyArray<CommandItem>>(() => [
    {
      id: 'open-settings',
      label: 'Open settings',
      shortcut: 'G S',
      group: 'Navigation',
      action: () => navigateTo('/settings'),
    },
    {
      id: 'open-terminal',
      label: 'Open detached terminal',
      shortcut: 'G T',
      group: 'Navigation',
      action: openTerminalRoute,
    },
    {
      id: 'refresh-connection',
      label: 'Refresh connection',
      shortcut: 'R',
      group: 'Session',
      action: rpc.reconnect,
    },
    {
      id: 'toggle-inspector',
      label: 'Toggle inspector',
      shortcut: 'I',
      group: 'Layout',
      action: toggleInspector,
    },
    {
      id: 'focus-canvas',
      label: 'Focus workflow canvas',
      shortcut: '1',
      group: 'Layout',
      action: () => setActiveTab('canvas-tab'),
    },
    {
      id: 'view-health',
      label: 'View health',
      shortcut: 'H',
      group: 'Session',
      action: () => setIsHealthDialogOpen(true),
    },
  ], [rpc, setActiveTab, toggleInspector]);

  const headerActions = (
    <>
      <Button className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100" variant="ghost" onClick={() => navigateTo('/settings')}>
        <Settings2 className="size-4" />
        Settings
      </Button>
      <Button className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100" variant="ghost" onClick={openTerminalRoute}>
        <TerminalSquare className="size-4" />
        Terminal
      </Button>
      <Button className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100" variant="ghost" onClick={rpc.reconnect}>
        <RefreshCw className="size-4" />
        Refresh
      </Button>
      <Button onClick={() => setIsHealthDialogOpen(true)}>
        <Activity className="size-4" />
        View health
      </Button>
    </>
  );

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

  useEffect(() => {
    if (!isHealthDialogOpen) {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
      return;
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeHealthDialogButtonRef.current?.focus();
  }, [isHealthDialogOpen]);

  useTransientGuidanceReset(guidanceActions, () => setGuidanceActions(null));

  return (
    <section className="min-h-screen bg-slate-100 px-6 py-6 sm:px-8">
      <ToastViewport />
      <WorkflowActionPreviewDialog
        action={previewAction}
        graph={graph}
        pending={runningActionId === previewAction?.id}
        onCancel={() => setPreviewAction(null)}
        onConfirm={() => void handleConfirmAction()}
      />

      {isHealthDialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm"
          onClick={() => setIsHealthDialogOpen(false)}
        >
          <div
            aria-labelledby="health-dialog-title"
            aria-modal="true"
            className="w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setIsHealthDialogOpen(false);
                return;
              }

              if (event.key === 'Tab') {
                const focusableElements = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
                  ),
                ).filter((element) => !element.hasAttribute('disabled'));

                if (focusableElements.length === 0) {
                  event.preventDefault();
                  return;
                }

                const firstElement = focusableElements[0];
                const lastElement = focusableElements[focusableElements.length - 1];
                const activeElement = document.activeElement;

                if (!event.shiftKey && activeElement === lastElement) {
                  event.preventDefault();
                  firstElement?.focus();
                } else if (event.shiftKey && activeElement === firstElement) {
                  event.preventDefault();
                  lastElement?.focus();
                }
              }
            }}
            role="dialog"
            tabIndex={-1}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900" id="health-dialog-title">Health</h2>
                <p className="mt-2 text-sm text-slate-500">Live server status without navigating away from the app window.</p>
              </div>
              <Button
                className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                ref={closeHealthDialogButtonRef}
                variant="ghost"
                onClick={() => setIsHealthDialogOpen(false)}
              >
                Close
              </Button>
            </div>
            <pre className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              {healthPayload}
            </pre>
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-[1700px] flex-col gap-6">
        <header className="grid gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">Phase 05 · workspace shell rebuild</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">{APP_DISPLAY_NAME}</h1>
            <p className="mt-3 max-w-3xl text-base text-slate-600">
              Explorer, tabs, inspector, and the shared REPL now live in the primary workspace shell.
            </p>
          </div>
          <dl className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatusCard label="Version" value={serverVersion ?? 'checking…'} />
            <StatusCard label="Server" value={isConnected ? 'connected' : 'disconnected'} />
            <StatusCard label="Session" value={sessionState} />
            <StatusCard label="Workflow" value={graph ? `${graph.obligations.length} obligations / ${graph.actions.length} actions` : 'waiting…'} />
          </dl>
        </header>

        {desktopEnvironment && desktopIssues.length > 0 ? (
          <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">First launch</p>
                <h2 className="mt-2 text-2xl font-semibold text-amber-950">Complete local setup before running workflows</h2>
                <p className="mt-2 max-w-3xl text-sm text-amber-900/80">
                  Glade does not bundle R. Fix the checks below, then retry the session. The embedded Bun server is already bundled by the desktop shell.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button className="border-amber-300 bg-white text-amber-950 hover:bg-amber-100" variant="ghost" onClick={() => navigateTo('/settings')}>
                  <Settings2 className="size-4" />
                  Settings
                </Button>
                <Button
                  onClick={() => {
                    void nativeApi.environment.refresh()
                      .then((environment) => {
                        useConnectionStore.getState().setDesktopEnvironment(environment);
                      })
                      .catch((error) => {
                        pushNotification({
                          tone: 'error',
                          title: 'Retry checks failed',
                          description: error instanceof Error ? error.message : String(error),
                        });
                      });
                  }}
                >
                  <RefreshCw className="size-4" />
                  Retry checks
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {desktopIssues.map((issue) => (
                <article key={`${issue.code}-${issue.title}`} className="rounded-[1.5rem] border border-amber-200 bg-white p-5">
                  <h3 className="text-lg font-medium text-slate-900">{issue.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{issue.description}</p>
                  {trimCommand(issue.command) ? (
                    <pre className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                      {issue.command}
                    </pre>
                  ) : null}
                  {issue.href ? (
                    <button
                      className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-600"
                      onClick={() => {
                        void nativeApi.openExternal(issue.href!).catch((error) => {
                          pushNotification({
                            tone: 'error',
                            title: 'Could not open link',
                            description: error instanceof Error ? error.message : String(error),
                          });
                        });
                      }}
                      type="button"
                    >
                      <ExternalLink className="size-4" />
                      Open install instructions
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {guidanceActions?.length ? <PostActionGuidanceBanner actions={guidanceActions} onDismiss={() => setGuidanceActions(null)} /> : null}

        <WorkspaceShell
          commands={commands}
          graph={graph}
          headerActions={headerActions}
          host={rpc.host}
          onCompareSelection={handleCompareSelection}
          onRunAction={handleRunAction}
          onRunNode={handleRunNode}
          onSelectObligation={handleSelectObligation}
          repl={rpc.repl}
          workflow={rpc.workflow}
        />
      </div>
    </section>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-2 break-words text-lg font-medium text-slate-900">{value}</dd>
    </div>
  );
}
