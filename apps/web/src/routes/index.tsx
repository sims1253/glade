import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, RotateCcw, Settings2 } from 'lucide-react';
import { createFileRoute } from '@tanstack/react-router';

import {
  APP_DISPLAY_NAME,
  type DesktopUpdateState,
} from '@glade/shared';
import {
  type DesktopEnvironmentState,
  type DesktopPreflightIssue,
  type DesktopSettings,
} from '@glade/contracts';

import { WorkflowCanvas } from '../components/graph/workflow-canvas';
import { ReplTerminalPanel } from '../components/repl/repl-terminal-panel';
import {
  PostActionGuidanceBanner,
  WorkflowActionPreviewDialog,
  WorkflowActionsPanel,
  WorkflowObligationsPanel,
  useTransientGuidanceReset,
} from '../components/workflow/protocol-panels';
import type { WorkflowActionRecord } from '../lib/graph-types';
import { toJsonObject } from '../lib/json';
import { createNativeApi } from '../lib/runtime';
import { Button } from '../components/ui/button';
import { ToastViewport } from '../components/ui/toast-viewport';
import { useRpcClient } from '../hooks/useRpcClient';
import { useConnectionStore } from '../store/connection';
import { useGraphStore } from '../store/graph';
import { useToastStore } from '../store/toast';

export const Route = createFileRoute('/')({
  component: IndexRoute,
});

function sessionIssue(reason: string | null): DesktopPreflightIssue | null {
  if (!reason || reason === 'health_check_failed' || reason === 'websocket_closed' || reason === 'websocket_error') {
    return null;
  }

  const description = reason.startsWith('r_process_error:')
    ? `Glade could not start the embedded R session: ${reason.slice('r_process_error:'.length)}`
    : reason.startsWith('r_process_exit:')
      ? `The embedded R session exited unexpectedly: ${reason.slice('r_process_exit:'.length)}`
      : reason === 'project_path_not_configured'
        ? 'The desktop project directory is not configured.'
        : `The bayesgrove session reported: ${reason}`;

  return {
    code: 'session_connection_failed',
    title: 'Could not establish a bg_serve() session',
    description,
  };
}

function setupIssues(environment: DesktopEnvironmentState | null, reason: string | null) {
  const issues = [...(environment?.preflight.issues ?? [])];
  const followUp = environment?.preflight.status === 'ok' ? sessionIssue(reason) : null;
  if (followUp) {
    issues.push(followUp);
  }
  return issues;
}

function trimCommand(command: string | null | undefined) {
  return command?.trim() ? command : null;
}

export function IndexRoute() {
  const rpc = useRpcClient();
  const detachedTerminalView = new URLSearchParams(window.location.search).get('terminal') === 'detached';
  const serverConnected = useConnectionStore((state) => state.serverConnected);
  const serverVersion = useConnectionStore((state) => state.serverVersion);
  const sessionState = useConnectionStore((state) => state.sessionState);
  const sessionReason = useConnectionStore((state) => state.sessionReason);
  const desktopEnvironment = useConnectionStore((state) => state.desktopEnvironment);
  const pushNotification = useToastStore((state) => state.pushNotification);
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
  const [isHealthDialogOpen, setIsHealthDialogOpen] = useState(false);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [updateState, setUpdateState] = useState<DesktopUpdateState | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<DesktopSettings | null>(null);
  const [desktopBusy, setDesktopBusy] = useState(false);
  const actionSignature = useMemo(
    () => graph?.actions.map((action) => action.id).join('|') ?? '',
    [graph],
  );
  const nativeApi = useMemo(() => createNativeApi(rpc), [rpc]);
  const desktopIssues = useMemo(() => setupIssues(desktopEnvironment, sessionReason), [desktopEnvironment, sessionReason]);
  const healthPayload = useMemo(() => JSON.stringify({
    endpoint: `${window.location.origin}/health`,
    status: serverConnected ? 'ok' : 'error',
    version: serverVersion ?? 'unknown',
    sessionState,
    sessionReason,
  }, null, 2), [serverConnected, serverVersion, sessionReason, sessionState]);

  useEffect(() => {
    if (!desktopEnvironment) {
      return;
    }

    setSettingsDraft((current) => current ?? desktopEnvironment.settings);
  }, [desktopEnvironment]);

  useEffect(() => {
    let active = true;
    void nativeApi.updater.getState()
      .then((state) => {
        if (!active) {
          return;
        }
        setUpdateState(state);
      })
      .catch((error) => {
        console.error('[desktop] failed to load updater state', error);
      });

    const unsubscribe = nativeApi.updater.subscribe((state) => {
      if (!active) {
        return;
      }
      setUpdateState(state);
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [nativeApi]);

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
    const result = await rpc.workflow.executeAction({
      actionId: previewAction.id,
      payload: toJsonObject(previewAction.payload),
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
  }, [actionSignature, graph, previewAction, rpc.workflow]);

  useEffect(() => {
    if (detachedTerminalView) {
      return;
    }

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
  }, [actionSignature, awaitingGuidance, detachedTerminalView, graph]);

  useTransientGuidanceReset(guidanceActions, () => setGuidanceActions(null));

  async function applyDesktopAction<T>(action: () => Promise<T>) {
    setDesktopBusy(true);
    try {
      return await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[desktop] action failed', error);
      pushNotification({
        tone: 'error',
        title: 'Desktop action failed',
        description: message,
      });
    } finally {
      setDesktopBusy(false);
    }
  }

  if (detachedTerminalView) {
    return (
      <section className="min-h-screen bg-[#050b14]">
        <ReplTerminalPanel detachedView repl={rpc.repl} />
      </section>
    );
  }

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
      {isHealthDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-50">Health</h2>
                <p className="mt-2 text-sm text-slate-400">Live server status without navigating away from the app window.</p>
              </div>
              <Button variant="ghost" onClick={() => setIsHealthDialogOpen(false)}>Close</Button>
            </div>
            <pre className="mt-5 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-200">
              {healthPayload}
            </pre>
          </div>
        </div>
      ) : null}
      {isSettingsDialogOpen && settingsDraft && desktopEnvironment ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[2rem] border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/80">Desktop settings</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-50">Environment and updates</h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-400">
                  Configure the local R executable, editor command, and update channel stored in the Electron user data directory.
                </p>
              </div>
              <Button variant="ghost" onClick={() => setIsSettingsDialogOpen(false)}>Close</Button>
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-200">R executable path</span>
                  <div className="mt-2 flex gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400"
                      value={settingsDraft.rExecutablePath}
                      onChange={(event) => setSettingsDraft({ ...settingsDraft, rExecutablePath: event.target.value })}
                    />
                    <Button
                      variant="ghost"
                      disabled={!nativeApi.bridge?.pickExecutable || desktopBusy}
                      onClick={() => {
                        void nativeApi.pickExecutable()
                          .then((selectedPath) => {
                            if (selectedPath) {
                              setSettingsDraft((current) => current ? { ...current, rExecutablePath: selectedPath } : current);
                            }
                          })
                          .catch((error) => {
                            const message = error instanceof Error ? error.message : String(error);
                            console.error('[desktop] failed to select executable path', error);
                            pushNotification({
                              tone: 'error',
                              title: 'Could not browse for R',
                              description: message,
                            });
                          });
                      }}
                    >
                      Browse
                    </Button>
                  </div>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-200">Preferred editor command</span>
                  <input
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400"
                    value={settingsDraft.editorCommand}
                    onChange={(event) => setSettingsDraft({ ...settingsDraft, editorCommand: event.target.value })}
                  />
                  <p className="mt-2 text-xs text-slate-500">Use `auto` to detect `code`, `positron`, `cursor`, or `nvim` automatically.</p>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-200">Update channel</span>
                  <select
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400"
                    value={settingsDraft.updateChannel}
                    onChange={(event) => setSettingsDraft({
                      ...settingsDraft,
                      updateChannel: event.target.value === 'beta' ? 'beta' : 'stable',
                    })}
                  >
                    <option value="stable">stable</option>
                    <option value="beta">beta</option>
                  </select>
                </label>
              </div>

              {nativeApi.updater.supported && updateState ? (
                <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Updater</p>
                  <p className="mt-3 text-lg font-medium text-slate-100">{updateState.status.replaceAll('-', ' ')}</p>
                  <p className="mt-2 text-sm text-slate-400">{updateState.message ?? 'No update activity yet.'}</p>
                  <p className="mt-2 text-xs text-slate-500">Channel: {settingsDraft.updateChannel}</p>
                  {updateState.progressPercent !== null ? (
                    <div className="mt-4 h-2 rounded-full bg-slate-800">
                      <div
                        className="h-2 rounded-full bg-emerald-400 transition-[width] duration-300"
                        style={{ width: `${Math.max(4, Math.min(100, updateState.progressPercent))}%` }}
                      />
                    </div>
                  ) : null}
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      disabled={desktopBusy}
                      onClick={() => {
                        void applyDesktopAction(async () => {
                          await nativeApi.updater.check();
                        });
                      }}
                    >
                      <RefreshCw className="size-4" />
                      Check now
                    </Button>
                    <Button
                      disabled={desktopBusy || updateState.status !== 'available'}
                      onClick={() => {
                        void applyDesktopAction(async () => {
                          await nativeApi.updater.download();
                        });
                      }}
                    >
                      <Download className="size-4" />
                      Download
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={desktopBusy || updateState.status !== 'downloaded'}
                      onClick={() => {
                        void applyDesktopAction(async () => {
                          const started = await nativeApi.updater.install();
                          if (!started) {
                            throw new Error('Could not start update installation.');
                          }
                        });
                      }}
                    >
                      Install and relaunch
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap justify-between gap-3">
              <Button
                variant="ghost"
                disabled={desktopBusy}
                onClick={() => {
                  void applyDesktopAction(async () => {
                    const environment = await nativeApi.environment.resetSettings();
                    setSettingsDraft(environment.settings);
                  });
                }}
              >
                <RotateCcw className="size-4" />
                Reset to defaults
              </Button>
              <div className="flex flex-wrap gap-3">
                <Button variant="ghost" onClick={() => setSettingsDraft(desktopEnvironment.settings)}>Discard</Button>
                <Button
                  disabled={desktopBusy}
                  onClick={() => {
                    if (!settingsDraft) {
                      return;
                    }
                    void applyDesktopAction(async () => {
                      const environment = await nativeApi.environment.saveSettings(settingsDraft);
                      setSettingsDraft(environment.settings);
                    });
                  }}
                >
                  Save and restart session
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {desktopEnvironment && desktopIssues.length > 0 ? (
        <section className="rounded-[2rem] border border-amber-400/30 bg-amber-500/10 p-6 shadow-2xl shadow-slate-950/20">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/80">First launch</p>
              <h2 className="mt-2 text-2xl font-semibold text-amber-50">Complete local setup before running workflows</h2>
              <p className="mt-2 max-w-3xl text-sm text-amber-100/80">
                Glade does not bundle R. Fix the checks below, then retry the session. The embedded Bun server is already bundled by the desktop shell.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="ghost" onClick={() => setIsSettingsDialogOpen(true)}>
                <Settings2 className="size-4" />
                Settings
              </Button>
              <Button
                disabled={desktopBusy}
                onClick={() => {
                  void applyDesktopAction(async () => {
                    const environment = await nativeApi.environment.refresh();
                    setSettingsDraft(environment.settings);
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
              <article key={`${issue.code}-${issue.title}`} className="rounded-3xl border border-amber-300/20 bg-slate-950/70 p-5">
                <h3 className="text-lg font-medium text-slate-50">{issue.title}</h3>
                <p className="mt-2 text-sm text-slate-300">{issue.description}</p>
                {trimCommand(issue.command) ? (
                  <pre className="mt-4 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/80 p-3 text-xs text-amber-100">
                    {issue.command}
                  </pre>
                ) : null}
                {issue.href ? (
                  <button
                    className="mt-4 inline-flex text-sm font-medium text-emerald-300 hover:text-emerald-200"
                    onClick={() => {
                      const href = issue.href;
                      if (href) {
                        void nativeApi.openExternal(href)
                          .then((opened) => {
                            if (!opened) {
                              pushNotification({
                                tone: 'error',
                                title: 'Could not open link',
                                description: 'The external link could not be opened.',
                              });
                            }
                          })
                          .catch((error) => {
                            const message = error instanceof Error ? error.message : String(error);
                            console.error('[desktop] failed to open external link', error);
                            pushNotification({
                              tone: 'error',
                              title: 'Could not open link',
                              description: message,
                            });
                          });
                      }
                    }}
                    type="button"
                  >
                    Open install instructions
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <header className="grid gap-4 rounded-3xl border border-slate-800/80 bg-slate-950/70 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">phase 10 · packaging and distribution</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">{APP_DISPLAY_NAME}</h1>
          <p className="mt-3 max-w-3xl text-base text-slate-300">
            Operate the packaged desktop shell, validate the local bayesgrove environment, manage updates, and keep the workflow canvas and shared R terminal in sync.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 lg:justify-end">
          {desktopEnvironment ? (
            <Button variant="ghost" onClick={() => setIsSettingsDialogOpen(true)}>
              <Settings2 className="size-4" />
              Settings
            </Button>
          ) : null}
          <Button onClick={rpc.reconnect}>
            <RefreshCw className="size-4" />
            Refresh connection
          </Button>
          <Button onClick={() => setIsHealthDialogOpen(true)} variant="ghost">
            View health
          </Button>
        </div>
      </header>

      <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatusCard label="Version" value={serverVersion ?? 'checking…'} />
        <StatusCard label="Server" value={serverConnected ? 'connected' : 'disconnected'} />
        <StatusCard label="Session" value={sessionState} />
        <StatusCard label="Project" value={graph?.projectName ?? desktopEnvironment?.preflight.projectPath ?? 'waiting…'} />
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
            workflow={rpc.workflow}
            host={rpc.host}
          />
        </div>
        <WorkflowActionsPanel
          graph={graph}
          runningActionId={runningActionId}
          onRunAction={(action) => setPreviewAction(action)}
        />
      </div>

      <ReplTerminalPanel repl={rpc.repl} />
    </section>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className="mt-2 break-words text-lg font-medium text-slate-100">{value}</dd>
    </div>
  );
}
