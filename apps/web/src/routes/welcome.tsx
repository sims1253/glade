import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ArrowLeft, FolderOpen, RefreshCw } from 'lucide-react';

import { Button } from '../components/ui/button';
import { setupDesktopIssues } from '../lib/desktop-preflight';
import { useServerSession } from '../lib/server-session-context';
import { useConnectionStore } from '../store/connection';
import { useToastStore } from '../store/toast';

export const Route = createFileRoute('/welcome')({
  component: WelcomeRoute,
});

function navigateTo(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function WelcomeRoute() {
  const { nativeApi } = useServerSession();
  const desktopEnvironment = useConnectionStore((state) => state.desktopEnvironment);
  const sessionReason = useConnectionStore((state) => state.sessionReason);
  const pushNotification = useToastStore((state) => state.pushNotification);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [projectPathDraft, setProjectPathDraft] = useState('');

  const desktopIssues = useMemo(() => setupDesktopIssues(desktopEnvironment, sessionReason), [desktopEnvironment, sessionReason]);
  const canPickDirectory = Boolean(nativeApi.bridge?.pickDirectory);

  const bootstrapProjectMutation = useMutation({
    mutationFn: async ({ mode, projectPath }: { readonly mode: 'open' | 'create'; readonly projectPath: string }) => {
      console.log('[welcome] bootstrapProject start', { mode, projectPath });
      const environment = await nativeApi.environment.bootstrapProject(projectPath);
      console.log('[welcome] bootstrapProject resolved', {
        mode,
        projectPath,
        nextProjectPath: environment.preflight.projectPath,
        preflightStatus: environment.preflight.status,
      });
      useConnectionStore.getState().setDesktopEnvironment(environment);
      return {
        mode,
        projectPath,
      };
    },
    onMutate: (variables) => {
      console.log('[welcome] bootstrapProject mutate', variables);
      setSetupError(null);
    },
    onSuccess: (result) => {
      console.log('[welcome] bootstrapProject success', result);
      if (!result) {
        return;
      }

      pushNotification({
        tone: 'success',
        title: result.mode === 'create' ? 'Project ready' : 'Project opened',
        description: result.projectPath,
      });
      navigateTo('/');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[welcome] bootstrapProject error', message);
      setSetupError(message);
      pushNotification({
        tone: 'error',
        title: 'Could not prepare project',
        description: message,
      });
    },
  });

  const normalizedProjectPath = projectPathDraft.trim();

  return (
    <section className="min-h-screen bg-[linear-gradient(145deg,#eff6ff_0%,#f8fafc_35%,#ecfeff_100%)] px-6 py-6 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">Project setup</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-950">Open an existing project or initialize a new one</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Glade will update the active project directory, run Bayesgrove&apos;s normal `bg_open()` / `bg_init()` bootstrap, then restart the session back into the workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100" variant="ghost" onClick={() => navigateTo('/')}>
                <ArrowLeft className="size-4" />
                Back to workspace
              </Button>
              <Button
                className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                disabled={bootstrapProjectMutation.isPending}
                variant="ghost"
                onClick={() => {
                  void nativeApi.environment.refresh()
                    .then((environment) => {
                      useConnectionStore.getState().setDesktopEnvironment(environment);
                    })
                    .catch((error) => {
                      const message = error instanceof Error ? error.message : String(error);
                      pushNotification({
                        tone: 'error',
                        title: 'Could not refresh desktop checks',
                        description: message,
                      });
                    });
                }}
              >
                <RefreshCw className="size-4" />
                Refresh checks
              </Button>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <article className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                <h2 className="text-xl font-semibold text-slate-950">Open project</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Pick a directory that already contains a Bayesgrove project and switch the app to it.
                </p>
                <Button
                  className="mt-5 w-full"
                  disabled={normalizedProjectPath.length === 0 || bootstrapProjectMutation.isPending}
                  onClick={() => bootstrapProjectMutation.mutate({ mode: 'open', projectPath: normalizedProjectPath })}
                >
                  <FolderOpen className="size-4" />
                  Open project
                </Button>
              </article>

              <article className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                <h2 className="text-xl font-semibold text-slate-950">Create project</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Pick an empty directory and Glade will initialize it as a new Bayesgrove project before returning to the workspace.
                </p>
                <Button
                  className="mt-5 w-full"
                  disabled={normalizedProjectPath.length === 0 || bootstrapProjectMutation.isPending}
                  onClick={() => bootstrapProjectMutation.mutate({ mode: 'create', projectPath: normalizedProjectPath })}
                >
                  <FolderOpen className="size-4" />
                  Create project
                </Button>
              </article>
            </div>

            <label className="mt-5 block" htmlFor="project-path-input">
              <span className="text-sm font-medium text-slate-900">Project path</span>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                <input
                  aria-label="Project path"
                  id="project-path-input"
                  className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-sky-500"
                  placeholder="/path/to/project"
                  value={projectPathDraft}
                  onChange={(event) => setProjectPathDraft(event.target.value)}
                />
                <Button
                  className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                  disabled={!canPickDirectory || bootstrapProjectMutation.isPending}
                  variant="ghost"
                  onClick={() => {
                    void nativeApi.pickDirectory()
                      .then((selectedPath) => {
                        if (selectedPath) {
                          setProjectPathDraft(selectedPath);
                        }
                      })
                      .catch((error) => {
                        const message = error instanceof Error ? error.message : String(error);
                        pushNotification({
                          tone: 'error',
                          title: 'Could not browse for a project folder',
                          description: message,
                        });
                      });
                  }}
                >
                  Browse
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Paste an existing project path to open it, or enter a new directory path and choose Create project to initialize it.
              </p>
            </label>

            {!canPickDirectory ? (
              <div className="mt-5 rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                Native directory browsing is only available in the desktop runtime, but you can still paste a project path here.
              </div>
            ) : null}

            {setupError ? (
              <div className="mt-5 rounded-[1.5rem] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950">
                {setupError}
              </div>
            ) : null}
          </section>

          <aside className="space-y-6">
            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Current project</p>
              <p className="mt-3 break-all text-sm text-slate-700">
                {desktopEnvironment?.preflight.projectPath ?? 'No project directory configured.'}
              </p>
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Extensions</p>
              <p className="mt-3 text-sm text-slate-600">
                Install extension packages outside Glade, then use the Extension Manager in the workspace to load them and inspect their node sets.
              </p>
            </section>

            {desktopIssues.length > 0 ? (
              <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-amber-950">Current setup issues</h2>
                <div className="mt-4 space-y-3">
                  {desktopIssues.map((issue) => (
                    <article key={`${issue.code}-${issue.title}`} className="rounded-[1.25rem] border border-amber-200 bg-white p-4">
                      <h3 className="font-medium text-slate-900">{issue.title}</h3>
                      <p className="mt-2 text-sm text-slate-600">{issue.description}</p>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    </section>
  );
}
