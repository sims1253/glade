import { RefreshCw } from 'lucide-react';
import { createFileRoute } from '@tanstack/react-router';

import { APP_DISPLAY_NAME } from '@glade/shared';

import { Button } from '../components/ui/button';
import { useServerConnection } from '../hooks/useServerConnection';
import { useAppStore } from '../store/app';

export const Route = createFileRoute('/')({
  component: IndexRoute,
});

function IndexRoute() {
  const { reconnect } = useServerConnection();
  const serverConnected = useAppStore((state) => state.serverConnected);
  const serverVersion = useAppStore((state) => state.serverVersion);
  const sessionState = useAppStore((state) => state.sessionState);

  return (
    <section className="mx-auto flex min-h-[80vh] max-w-4xl items-center justify-center">
      <div className="w-full rounded-3xl border border-slate-800/80 bg-slate-950/70 p-8 shadow-2xl shadow-slate-950/30 backdrop-blur">
        <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">bayesgrove gui scaffold</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">{APP_DISPLAY_NAME}</h1>
        <p className="mt-3 max-w-2xl text-base text-slate-300">
          Phase 1 placeholder shell for the bayesgrove desktop and hosted UI.
        </p>

        <dl className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatusCard label="Version" value={serverVersion ?? 'checking…'} />
          <StatusCard label="Server" value={serverConnected ? 'connected' : 'disconnected'} />
          <StatusCard label="Session" value={sessionState} />
        </dl>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button onClick={reconnect}>
            <RefreshCw className="size-4" />
            Refresh health check
          </Button>
          <Button render={<a href="/health" />} variant="ghost">
            Open /health
          </Button>
        </div>
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
