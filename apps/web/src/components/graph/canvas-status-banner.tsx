import { AlertTriangle, LoaderCircle } from 'lucide-react';

import { cn } from '../../lib/utils';

interface CanvasStatusBannerProps {
  readonly sessionState: 'connecting' | 'ready' | 'error';
  readonly sessionReason: string | null;
}

export function CanvasStatusBanner({ sessionState, sessionReason }: CanvasStatusBannerProps) {
  if (sessionState === 'ready') {
    return null;
  }

  const isConnecting = sessionState === 'connecting';
  const Icon = isConnecting ? LoaderCircle : AlertTriangle;

  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2">
      <div
        className={cn(
          'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm shadow-lg backdrop-blur',
          isConnecting
            ? 'border-sky-400/40 bg-sky-950/75 text-sky-100'
            : 'border-rose-400/40 bg-rose-950/80 text-rose-100',
        )}
      >
        <Icon className={cn('size-4', isConnecting && 'animate-spin')} />
        <span>
          {isConnecting ? 'Connecting to bayesgrove… showing last known graph.' : 'Session unavailable. Showing last known graph.'}
        </span>
        {sessionReason ? <span className="max-w-xs truncate text-xs opacity-80">{sessionReason}</span> : null}
      </div>
    </div>
  );
}
