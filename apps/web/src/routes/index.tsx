import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Activity, Boxes, FolderOpen, RefreshCw, Settings2, TerminalSquare } from 'lucide-react';

import { ExtensionManager } from '../components/extensions/extension-manager';
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
import { setupDesktopIssues } from '../lib/desktop-preflight';
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
  const [actionSubmitError, setActionSubmitError] = useState<string | null>(null);
  const [awaitingGuidance, setAwaitingGuidance] = useState<{
    readonly snapshotAt: string | null;
    readonly actionSignature: string;
  } | null>(null);
  const [guidanceActions, setGuidanceActions] = useState<ReadonlyArray<WorkflowActionRecord> | null>(null);
  const [isHealthDialogOpen, setIsHealthDialogOpen] = useState(false);
  const [isExtensionManagerOpen, setIsExtensionManagerOpen] = useState(false);
  const closeHealthDialogButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const actionSignature = useMemo(() => graph?.actions.map((action) => action.id).join('|') ?? '', [graph]);
  const desktopIssues = useMemo(() => setupDesktopIssues(desktopEnvironment, sessionReason), [desktopEnvironment, sessionReason]);
  const hasEmptyWorkflow = graph !== null && graph.nodes.length === 0;
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

  const loadExtensionMutation = useMutation({
    mutationFn: async (packageName: string) => {
      const result = await rpc.repl.write(`library(${JSON.stringify(packageName)}, character.only = TRUE)\n`);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return packageName;
    },
    onSuccess: (packageName) => {
      pushNotification({
        tone: 'success',
        title: 'Load command sent',
        description: `Asked R to load ${packageName}. The extension list updates after the next Bayesgrove snapshot.`,
      });
    },
    onError: (error) => {
      pushNotification({
        tone: 'error',
        title: 'Could not load extension package',
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const handleRunAction = useCallback((action: WorkflowActionRecord) => {
    setActionSubmitError(null);
    setPreviewAction(action);
  }, []);

  const handleSelectObligation = useCallback((obligation: WorkflowObligationRecord) => {
    setHighlightedNodeIds(obligation.affectedNodeIds);
    setSelectedNodeId(obligation.affectedNodeIds[0] ?? null);
  }, [setHighlightedNodeIds, setSelectedNodeId]);

  const handleConfirmAction = useCallback(async (payload: Record<string, unknown> | null) => {
    if (!previewAction || !graph) {
      return;
    }

    setActionSubmitError(null);
    const snapshotAt = graph.emittedAt;
    const previousActionSignature = actionSignature;
    const result = await executeActionMutation.mutateAsync({
      ...previewAction,
      payload: payload ?? previewAction.payload,
    });

    if (result.success) {
      setActionSubmitError(null);
      setPreviewAction(null);
      setAwaitingGuidance({
        snapshotAt,
        actionSignature: previousActionSignature,
      });
      return;
    }

    setActionSubmitError(result.error.message);
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
      id: 'open-project-setup',
      label: 'Project setup',
      shortcut: 'G P',
      group: 'Navigation',
      action: () => navigateTo('/welcome'),
    },
    {
      id: 'open-terminal',
      label: 'Open detached terminal',
      shortcut: 'G T',
      group: 'Navigation',
      action: openTerminalRoute,
    },
    {
      id: 'open-extensions',
      label: 'Open extensions',
      shortcut: 'G E',
      group: 'Session',
      action: () => setIsExtensionManagerOpen(true),
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
    <div className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-1 shadow-sm">
      <Button
        aria-label="Project setup"
        className="flex-1 border-0 bg-transparent px-2 py-1.5 text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-xs"
        variant="ghost"
        title="Project setup"
        onClick={() => navigateTo('/welcome')}
      >
        <FolderOpen className="size-4" />
      </Button>
      <Button
        aria-label="Extensions"
        className="flex-1 border-0 bg-transparent px-2 py-1.5 text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-xs"
        variant="ghost"
        title="Extensions"
        onClick={() => setIsExtensionManagerOpen(true)}
      >
        <Boxes className="size-4" />
      </Button>
      <Button className="flex-1 px-2 py-1.5 border-0 bg-transparent text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-xs" variant="ghost" title="Terminal" onClick={openTerminalRoute}>
        <TerminalSquare className="size-4" />
      </Button>
      <Button className="flex-1 px-2 py-1.5 border-0 bg-transparent text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-xs" variant="ghost" title="Settings" onClick={() => navigateTo('/settings')}>
        <Settings2 className="size-4" />
      </Button>
      <Button className="flex-1 px-2 py-1.5 border-0 bg-transparent text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-xs" variant="ghost" title="Refresh connection" onClick={rpc.reconnect}>
        <RefreshCw className="size-4" />
      </Button>
      <Button className="flex-1 px-2 py-1.5 border-0 bg-transparent text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-xs" variant="ghost" title="System health" onClick={() => setIsHealthDialogOpen(true)}>
        <Activity className="size-4" />
      </Button>
    </div>
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
    <div className="flex h-screen flex-col overflow-hidden">
      <ToastViewport />
      <ExtensionManager
        extensions={graph?.extensionRegistry ?? []}
        isLoadingPackage={loadExtensionMutation.isPending}
        open={isExtensionManagerOpen}
        onClose={() => setIsExtensionManagerOpen(false)}
        onLoadPackage={(packageName) => loadExtensionMutation.mutateAsync(packageName)}
      />
      <WorkflowActionPreviewDialog
        action={previewAction}
        graph={graph}
        pending={runningActionId === previewAction?.id}
        submitError={actionSubmitError}
        onCancel={() => {
          setActionSubmitError(null);
          setPreviewAction(null);
        }}
        onConfirm={(payload) => void handleConfirmAction(payload)}
      />

      {isHealthDialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4 backdrop-blur-sm"
          onClick={() => setIsHealthDialogOpen(false)}
        >
          <div
            aria-labelledby="health-dialog-title"
            aria-modal="true"
            className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]"
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
            <pre className="mt-5 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              {healthPayload}
            </pre>
          </div>
        </div>
      ) : null}

      {desktopEnvironment && desktopIssues.length > 0 ? (
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-amber-300 bg-amber-50 px-4 py-2">
          <p className="text-sm font-medium text-amber-900">
            <span className="font-semibold">Setup required:</span>{' '}
            {desktopIssues.length} check{desktopIssues.length !== 1 ? 's' : ''} need attention before running workflows.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button className="h-7 border-amber-300 bg-white px-3 text-xs text-amber-900 hover:bg-amber-100" variant="ghost" onClick={() => navigateTo('/settings')}>
              <Settings2 className="size-3" />
              Settings
            </Button>
            <Button
              className="h-7 px-3 text-xs"
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
              <RefreshCw className="size-3" />
              Retry
            </Button>
          </div>
        </div>
      ) : null}

      {guidanceActions?.length ? <PostActionGuidanceBanner actions={guidanceActions} onDismiss={() => setGuidanceActions(null)} /> : null}

      {hasEmptyWorkflow ? (
        <section className="border-b border-sky-200 bg-[linear-gradient(135deg,#eff6ff_0%,#f8fafc_55%,#ecfeff_100%)] px-4 py-4">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 rounded-[1.75rem] border border-white/80 bg-white/80 p-5 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Empty workspace</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">Start by choosing a project or loading a node pack.</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Use Project setup to open or initialize a Bayesgrove directory, then load installed extension packages to register node types for this session.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button className="bg-sky-600 hover:bg-sky-500" onClick={() => navigateTo('/welcome')}>
                <FolderOpen className="size-4" />
                Project setup
              </Button>
              <Button
                className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                variant="ghost"
                onClick={() => setIsExtensionManagerOpen(true)}
              >
                <Boxes className="size-4" />
                Extensions
              </Button>
            </div>
          </div>
        </section>
      ) : null}

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
  );
}
