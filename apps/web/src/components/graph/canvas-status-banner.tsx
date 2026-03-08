import { AlertTriangle, LoaderCircle } from 'lucide-react';

import { cn } from '../../lib/utils';

function describeSessionReason(reason: string | null) {
  switch (reason) {
    case 'project_path_not_configured':
      return 'Set BAYESGROVE_PROJECT_PATH before starting the server.';
    case 'health_check_failed':
      return 'The app server did not answer /health.';
    case 'websocket_closed':
      return 'The websocket closed before the session finished starting.';
    case 'websocket_error':
      return 'The websocket hit a transport error.';
    case 'bayesgrove_socket_closed':
      return 'The bayesgrove websocket closed unexpectedly.';
    case 'snapshot_refresh_failed':
      return 'The server could not fetch a fresh graph snapshot.';
    default:
      return reason;
  }
}

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

  const reasonText = describeSessionReason(sessionReason);

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
        {reasonText ? <span className="max-w-sm truncate text-xs opacity-80">{reasonText}</span> : null}
      </div>
    </div>
  );
}
