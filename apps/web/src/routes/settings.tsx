import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ArrowLeft, Download, ExternalLink, RefreshCw, RotateCcw, Save } from 'lucide-react';

import type { DesktopSettings } from '@glade/contracts';

import { Button } from '../components/ui/button';
import { APP_VERSION } from '../lib/app-version';
import { setupDesktopIssues, trimCommand } from '../lib/desktop-preflight';
import { useServerSession } from '../lib/server-session-context';
import { useConnectionStore } from '../store/connection';
import { useToastStore } from '../store/toast';

export const Route = createFileRoute('/settings')({
  component: SettingsRoute,
});

function navigateTo(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function SettingsRoute() {
  const queryClient = useQueryClient();
  const { nativeApi, isConnected, serverVersion, sessionState } = useServerSession();
  const desktopEnvironment = useConnectionStore((state) => state.desktopEnvironment);
  const sessionReason = useConnectionStore((state) => state.sessionReason);
  const pushNotification = useToastStore((state) => state.pushNotification);
  const [settingsDraft, setSettingsDraft] = useState<DesktopSettings | null>(desktopEnvironment?.settings ?? null);

  const desktopIssues = useMemo(() => setupDesktopIssues(desktopEnvironment, sessionReason), [desktopEnvironment, sessionReason]);
  const updaterQuery = useQuery({
    queryKey: ['desktop', 'updater-state'],
    queryFn: async () => nativeApi.updater.getState(),
    staleTime: 5_000,
  });

  useEffect(() => {
    setSettingsDraft(desktopEnvironment?.settings ?? null);
  }, [desktopEnvironment]);

  useEffect(() => {
    return nativeApi.updater.subscribe((state) => {
      queryClient.setQueryData(['desktop', 'updater-state'], state);
    });
  }, [nativeApi, queryClient]);

  const refreshEnvironmentMutation = useMutation({
    mutationFn: () => nativeApi.environment.refresh(),
    onSuccess: (environment) => {
      useConnectionStore.getState().setDesktopEnvironment(environment);
      setSettingsDraft(environment.settings);
    },
    onError: (error) => {
      pushNotification({
        tone: 'error',
        title: 'Retry checks failed',
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const saveSettingsMutation = useMutation({
    mutationFn: (settings: DesktopSettings) => nativeApi.environment.saveSettings(settings),
    onSuccess: (environment) => {
      useConnectionStore.getState().setDesktopEnvironment(environment);
      setSettingsDraft(environment.settings);
    },
    onError: (error) => {
      pushNotification({
        tone: 'error',
        title: 'Could not save desktop settings',
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const resetSettingsMutation = useMutation({
    mutationFn: () => nativeApi.environment.resetSettings(),
    onSuccess: (environment) => {
      useConnectionStore.getState().setDesktopEnvironment(environment);
      setSettingsDraft(environment.settings);
    },
    onError: (error) => {
      pushNotification({
        tone: 'error',
        title: 'Could not reset desktop settings',
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const checkUpdatesMutation = useMutation({
    mutationFn: () => nativeApi.updater.check(),
    onSuccess: (state) => {
      queryClient.setQueryData(['desktop', 'updater-state'], state);
    },
    onError: (error) => {
      pushNotification({
        tone: 'error',
        title: 'Could not check for updates',
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const downloadUpdateMutation = useMutation({
    mutationFn: () => nativeApi.updater.download(),
    onSuccess: (state) => {
      queryClient.setQueryData(['desktop', 'updater-state'], state);
    },
    onError: (error) => {
      pushNotification({
        tone: 'error',
        title: 'Could not download update',
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const installUpdateMutation = useMutation({
    mutationFn: async () => {
      const started = await nativeApi.updater.install();
      if (!started) {
        throw new Error('Could not start update installation.');
      }
      return started;
    },
    onError: (error) => {
      pushNotification({
        tone: 'error',
        title: 'Could not install update',
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const desktopBusy = refreshEnvironmentMutation.isPending || saveSettingsMutation.isPending || resetSettingsMutation.isPending || checkUpdatesMutation.isPending || downloadUpdateMutation.isPending || installUpdateMutation.isPending;
  const updateState = updaterQuery.data;

  return (
    <section className="min-h-screen bg-slate-100 px-6 py-6 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Settings</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">Desktop Bayesgrove environment</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Manage the local R, bayesgrove, and update settings shared by the workspace and detached terminal.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100" variant="ghost" onClick={() => navigateTo('/')}>
                <ArrowLeft className="size-4" />
                Back to workspace
              </Button>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                App {APP_VERSION}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Server {serverVersion ?? 'checking…'} · {isConnected ? 'connected' : 'disconnected'} · session {sessionState}
              </div>
            </div>
          </div>
        </header>

        {desktopEnvironment && desktopIssues.length > 0 ? (
          <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-amber-950">Bayesgrove desktop checks need attention</h2>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
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

        {settingsDraft ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="space-y-5">
                <label className="block">
                  <span className="text-sm font-medium text-slate-900">Project directory</span>
                  <div className="mt-2 flex gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-400"
                      value={settingsDraft.projectPath ?? ''}
                      placeholder="Default (~/.glade/project)"
                      onChange={(event) => setSettingsDraft({ ...settingsDraft, projectPath: event.target.value || undefined })}
                    />
                    <Button
                      className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                      variant="ghost"
                      disabled={!nativeApi.bridge?.pickDirectory || desktopBusy}
                      onClick={() => {
                        void nativeApi.pickDirectory()
                          .then((selectedPath) => {
                            if (selectedPath) {
                              setSettingsDraft((current) => current ? { ...current, projectPath: selectedPath } : current);
                            }
                          })
                          .catch((error) => {
                            pushNotification({
                              tone: 'error',
                              title: 'Could not browse for project',
                              description: error instanceof Error ? error.message : String(error),
                            });
                          });
                      }}
                    >
                      Browse
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">The directory where your Bayesgrove project is stored.</p>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-900">R executable path</span>
                  <div className="mt-2 flex gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-400"
                      value={settingsDraft.rExecutablePath}
                      onChange={(event) => setSettingsDraft({ ...settingsDraft, rExecutablePath: event.target.value })}
                    />
                    <Button
                      className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
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
                            pushNotification({
                              tone: 'error',
                              title: 'Could not browse for R',
                              description: error instanceof Error ? error.message : String(error),
                            });
                          });
                      }}
                    >
                      Browse
                    </Button>
                  </div>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-900">Preferred editor command</span>
                  <input
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-400"
                    value={settingsDraft.editorCommand}
                    onChange={(event) => setSettingsDraft({ ...settingsDraft, editorCommand: event.target.value })}
                  />
                  <p className="mt-2 text-xs text-slate-500">Use `auto` to detect `code`, `positron`, `cursor`, or `nvim` automatically.</p>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-900">Update channel</span>
                  <select
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-400"
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

              <div className="mt-6 flex flex-wrap justify-between gap-3">
                <Button
                  className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                  variant="ghost"
                  disabled={desktopBusy}
                  onClick={() => void resetSettingsMutation.mutateAsync()}
                >
                  <RotateCcw className="size-4" />
                  Reset to defaults
                </Button>
                <div className="flex flex-wrap gap-3">
                  <Button
                    className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                    disabled={desktopBusy}
                    variant="ghost"
                    onClick={() => setSettingsDraft(desktopEnvironment?.settings ?? null)}
                  >
                    Discard
                  </Button>
                  <Button disabled={desktopBusy} onClick={() => void saveSettingsMutation.mutateAsync(settingsDraft)}>
                    <Save className="size-4" />
                    Save and restart session
                  </Button>
                </div>
              </div>
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Updater</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{updateState?.status?.replaceAll('-', ' ') ?? 'idle'}</p>
                  <p className="mt-2 text-sm text-slate-500">{updateState?.message ?? 'No update activity yet.'}</p>
                </div>
                <Button className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100" variant="ghost" disabled={desktopBusy} onClick={() => void refreshEnvironmentMutation.mutateAsync()}>
                  <RefreshCw className="size-4" />
                  Retry checks
                </Button>
              </div>

              {updateState?.progressPercent !== null && updateState?.progressPercent !== undefined ? (
                <div className="mt-5 h-2 rounded-full bg-slate-200">
                  <div className="h-2 rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${Math.max(4, Math.min(100, updateState.progressPercent))}%` }} />
                </div>
              ) : null}

              <div className="mt-6 flex flex-col gap-3">
                <Button className="justify-center" disabled={desktopBusy} onClick={() => void checkUpdatesMutation.mutateAsync()}>
                  <RefreshCw className="size-4" />
                  Check now
                </Button>
                <Button
                  className="justify-center"
                  disabled={desktopBusy || updateState?.status !== 'available'}
                  onClick={() => void downloadUpdateMutation.mutateAsync()}
                >
                  <Download className="size-4" />
                  Download update
                </Button>
                <Button
                  className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100 justify-center"
                  variant="ghost"
                  disabled={desktopBusy || updateState?.status !== 'downloaded'}
                  onClick={() => void installUpdateMutation.mutateAsync()}
                >
                  Install and relaunch
                </Button>
              </div>
            </section>
          </div>
        ) : (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-10 text-center shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">Desktop settings are only available in the Glade desktop app.</h2>
            <p className="mt-2 text-sm text-slate-500">Open the desktop app to manage local R, bayesgrove, and update checks.</p>
          </section>
        )}
      </div>
    </section>
  );
}
