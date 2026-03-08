import { RefreshCw } from 'lucide-react';
import { createFileRoute } from '@tanstack/react-router';

import { APP_DISPLAY_NAME } from '@glade/shared';

import { WorkflowCanvas } from '../components/graph/workflow-canvas';
import { Button } from '../components/ui/button';
import { useServerConnection } from '../hooks/useServerConnection';
import { useAppStore } from '../store/app';
import { useGraphStore } from '../store/graph';

export const Route = createFileRoute('/')({
  component: IndexRoute,
});

function IndexRoute() {
  const { reconnect } = useServerConnection();
  const serverConnected = useAppStore((state) => state.serverConnected);
  const serverVersion = useAppStore((state) => state.serverVersion);
  const sessionState = useAppStore((state) => state.sessionState);
  const graph = useGraphStore((state) => state.graph);

  return (
    <section className="flex min-h-screen flex-col gap-6 px-6 py-6 sm:px-8">
      <header className="grid gap-4 rounded-3xl border border-slate-800/80 bg-slate-950/70 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">phase 3 · canvas foundation</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">{APP_DISPLAY_NAME}</h1>
          <p className="mt-3 max-w-3xl text-base text-slate-300">
            Live workflow DAG rendering for bayesgrove with ELK layout, xyflow navigation, and last-known graph retention during reconnects.
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
        <StatusCard label="Graph" value={graph ? `${graph.nodes.length} nodes / ${graph.edges.length} edges` : 'no snapshot'} />
      </dl>

      <div className="min-h-[40rem] flex-1">
        <WorkflowCanvas className="h-[calc(100vh-18rem)] min-h-[40rem]" />
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
