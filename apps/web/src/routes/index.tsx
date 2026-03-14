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
import { useReplStore } from '../store/repl';
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

const BUILTIN_WORKFLOW_PACKS = [
  {
    id: 'bayesguide.default_bayesian',
    title: 'Default Bayesian workflow',
    description: 'Computation review, fit criticism, candidate comparison, and branch disposition.',
  },
  {
    id: 'bayesgrove.process_guidance',
    title: 'Process guidance',
    description: 'Workflow preflight, iteration planning, and out-of-sample stability review.',
  },
  {
    id: 'bayesgrove.model_taxonomy',
    title: 'Model taxonomy',
    description: 'PAD classification and utility trade-off review.',
  },
  {
    id: 'bayesgrove.prior_workflow',
    title: 'Prior workflow',
    description: 'Prior rationale and prior predictive review.',
  },
  {
    id: 'bayesgrove.model_checks',
    title: 'Model checks',
    description: 'Posterior predictive checks, SBC, and calibration review.',
  },
  {
    id: 'bayesgrove.model_selection',
    title: 'Model selection',
    description: 'Comparison evidence and stacking-weight review.',
  },
  {
    id: 'bayesgrove.stan_workflow',
    title: 'Stan workflow',
    description: 'Stan-oriented bundle covering the default loop plus diagnostics and projection review.',
  },
  {
    id: 'bayesgrove.causal_dagitty',
    title: 'Causal DAGitty',
    description: 'DAG-backed adjustment review and causal selection contracts.',
  },
] as const;

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
  const [isWorkflowPacksDialogOpen, setIsWorkflowPacksDialogOpen] = useState(false);
  const [selectedWorkflowPacks, setSelectedWorkflowPacks] = useState<ReadonlyArray<string>>(['bayesguide.default_bayesian']);
  const closeHealthDialogButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const actionSignature = useMemo(() => graph?.actions.map((action) => action.id).join('|') ?? '', [graph]);
  const desktopIssues = useMemo(() => setupDesktopIssues(desktopEnvironment, sessionReason), [desktopEnvironment, sessionReason]);
  const hasBootstrappedProject = desktopEnvironment?.preflight.status === 'ok';
  const showProjectSetupBanner = graph === null && !hasBootstrappedProject;
  const showWorkflowSetupBanner = graph !== null && graph.nodeKinds.length === 0;
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
      const command = `library(${JSON.stringify(packageName)}, character.only = TRUE)`;
      useReplStore.getState().appendLine(`> ${command}`);
      useReplStore.getState().appendRawLine(`> ${command}`);
      useReplStore.getState().appendCommandHistory(command);
      const result = await rpc.repl.write(`${command}\n`);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return packageName;
    },
    onSuccess: (packageName) => {
      pushNotification({
        tone: 'success',
        title: 'Load command sent',
        description: `Asked R to load ${packageName}. Glade will refresh the Bayesgrove snapshot automatically.`,
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

  const useDefaultWorkflowMutation = useMutation({
    mutationFn: async () => {
      console.log('[index] useDefaultWorkflow start');
      const result = await rpc.workflow.useDefaultWorkflow();
      console.log('[index] useDefaultWorkflow rpc result', result);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return result.result;
    },
    onSuccess: () => {
      const nextGraph = useGraphStore.getState().graph;
      console.log('[index] useDefaultWorkflow success', {
        nodeKinds: nextGraph?.nodeKinds.length ?? null,
        nodes: nextGraph?.nodes.length ?? null,
        emittedAt: nextGraph?.emittedAt ?? null,
      });
    },
    onError: (error) => {
      console.error('[index] useDefaultWorkflow error', error instanceof Error ? error.message : String(error));
    },
  });

  const useWorkflowPacksMutation = useMutation({
    mutationFn: async (workflowPacks: ReadonlyArray<string>) => {
      const result = await rpc.workflow.useWorkflowPacks({ workflowPacks: [...workflowPacks] });
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return result.result;
    },
    onSuccess: () => {
      setIsWorkflowPacksDialogOpen(false);
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
    ...(graph
      ? [
          {
            id: 'use-default-workflow',
            label: 'Use default workflow',
            group: 'Project',
            action: () => {
              void useDefaultWorkflowMutation.mutateAsync();
            },
          },
          {
            id: 'enable-workflow-packs',
            label: 'Enable workflow packs',
            group: 'Project',
            action: () => setIsWorkflowPacksDialogOpen(true),
          },
        ] satisfies ReadonlyArray<CommandItem>
      : []),
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
  ], [graph, rpc, setActiveTab, toggleInspector, useDefaultWorkflowMutation]);

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
        nodeKinds={graph?.nodeKinds ?? []}
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

      {isWorkflowPacksDialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4 backdrop-blur-sm"
          onClick={() => setIsWorkflowPacksDialogOpen(false)}
        >
          <div
            aria-labelledby="workflow-packs-dialog-title"
            aria-modal="true"
            className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900" id="workflow-packs-dialog-title">Enable workflow packs</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Projects start empty by default. Choose the built-in Bayesgrove review packs you want to persist for this project.
                </p>
              </div>
              <Button
                className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                variant="ghost"
                onClick={() => setIsWorkflowPacksDialogOpen(false)}
              >
                Close
              </Button>
            </div>

            <div className="mt-5 grid gap-3">
              {BUILTIN_WORKFLOW_PACKS.map((pack) => {
                const checked = selectedWorkflowPacks.includes(pack.id);

                return (
                  <label key={pack.id} className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <input
                      checked={checked}
                      className="mt-1 size-4 rounded border-slate-300 text-sky-600"
                      type="checkbox"
                      onChange={(event) => {
                        setSelectedWorkflowPacks((current) => {
                          if (event.target.checked) {
                            return [...current, pack.id];
                          }
                          return current.filter((entry) => entry !== pack.id);
                        });
                      }}
                    />
                    <div>
                      <p className="font-medium text-slate-900">{pack.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{pack.description}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-400">{pack.id}</p>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                variant="ghost"
                onClick={() => setIsWorkflowPacksDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                disabled={selectedWorkflowPacks.length === 0 || useWorkflowPacksMutation.isPending}
                onClick={() => {
                  void useWorkflowPacksMutation.mutateAsync(selectedWorkflowPacks);
                }}
              >
                Activate selected packs
              </Button>
            </div>
          </div>
        </div>
      ) : null}

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

      {showProjectSetupBanner ? (
        <section className="border-b border-sky-200 bg-[linear-gradient(135deg,#eff6ff_0%,#f8fafc_55%,#ecfeff_100%)] px-4 py-4">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 rounded-[1.75rem] border border-white/80 bg-white/80 p-5 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">No project open</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">Choose a project before starting the workspace.</h2>
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

      {showWorkflowSetupBanner ? (
        <section className="border-b border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5_0%,#f8fafc_60%,#eff6ff_100%)] px-4 py-4">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 rounded-[1.75rem] border border-white/80 bg-white/85 p-5 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Empty Bayesgrove project</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">Choose a starter workflow or enable review packs.</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                This project has no node kinds yet. Use the default workflow to register starter node types, or enable built-in workflow packs for your own project setup.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                className="bg-emerald-600 hover:bg-emerald-500"
                disabled={useDefaultWorkflowMutation.isPending || useWorkflowPacksMutation.isPending}
                onClick={() => {
                  void useDefaultWorkflowMutation.mutateAsync();
                }}
              >
                <Boxes className="size-4" />
                Use default workflow
              </Button>
              <Button
                className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                disabled={useDefaultWorkflowMutation.isPending || useWorkflowPacksMutation.isPending}
                variant="ghost"
                onClick={() => setIsWorkflowPacksDialogOpen(true)}
              >
                <Settings2 className="size-4" />
                Enable workflow packs
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
