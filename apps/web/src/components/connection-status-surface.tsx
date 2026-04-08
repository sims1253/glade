import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Loader2, WifiOff, RefreshCw } from 'lucide-react';

import { cn } from '../lib/utils';
import { useToastStore } from '../store/toast';
import { RECONNECT_DELAYS_MS, useConnectionStore } from '../store/connection';

type ConnectionUiState = 'connected' | 'connecting' | 'reconnecting' | 'offline' | 'exhausted';

function getConnectionUiState(): ConnectionUiState {
  const state = useConnectionStore.getState();
  if (state.phase === 'connected' && state.bootstrapped) return 'connected';
  if (!navigator.onLine) return 'offline';
  if (state.reconnectPhase === 'exhausted') return 'exhausted';
  if (state.phase === 'disconnected' && state.hasConnected) return 'reconnecting';
  return 'connecting';
}

export function ConnectionStatusSurface({ children }: { readonly children: ReactNode }) {
  const bootstrapped = useConnectionStore((s) => s.bootstrapped);

  if (!bootstrapped) {
    return <ConnectionBlockingState />;
  }

  return (
    <>
      {children}
      <ConnectionToastCoordinator />
    </>
  );
}

function ConnectionBlockingState() {
  const phase = useConnectionStore((s) => s.phase);
  const reconnectAttempt = useConnectionStore((s) => s.reconnectAttempt);
  const reconnectPhase = useConnectionStore((s) => s.reconnectPhase);

  const isOffline = !navigator.onLine;
  const showExhausted = reconnectPhase === 'exhausted';

  let title: string;
  let description: string;
  let Icon: typeof Loader2;

  if (isOffline) {
    title = 'You are offline';
    description = 'Check your internet connection. Glade will reconnect automatically when you are back online.';
    Icon = WifiOff;
  } else if (showExhausted) {
    title = 'Could not connect to server';
    description = `Failed after ${reconnectAttempt} attempt${reconnectAttempt !== 1 ? 's' : ''}. Click reload to try again.`;
    Icon = AlertTriangle;
  } else {
    title = 'Connecting to Glade';
    description = phase === 'connecting' && reconnectAttempt > 0
      ? `Attempt ${reconnectAttempt + 1}/${RECONNECT_DELAYS_MS.length}…`
      : 'Waiting for the server…';
    Icon = Loader2;
  }

  return (
    <div className="flex h-screen items-center justify-center" style={{ background: 'radial-gradient(ellipse at center, #fef3c7 0%, #f8fafc 70%)' }}>
      <div className="mx-4 w-full max-w-md rounded-2xl border border-slate-200/80 bg-white/80 p-8 text-center shadow-2xl backdrop-blur-sm">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-amber-50">
          <Icon className={cn('size-7 text-amber-600', Icon === Loader2 && 'animate-spin')} />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-3 text-sm text-slate-600">{description}</p>
        {showExhausted ? (
          <button
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-amber-500"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="size-4" />
            Reload app
          </button>
        ) : null}
        <details className="mt-6 text-left">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">Debug info</summary>
          <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-50 p-3 text-[10px] text-slate-500">
            {JSON.stringify({
              phase,
              reconnectPhase,
              reconnectAttempt,
              online: navigator.onLine,
              location: window.location.href,
            }, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}

function ConnectionToastCoordinator() {
  const [uiState, setUiState] = useState<ConnectionUiState>(getConnectionUiState);
  const previousStateRef = useRef<ConnectionUiState>(uiState);
  const countdownToastIdRef = useRef<string | null>(null);
  const countdownTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const unsubscribe = useConnectionStore.subscribe((state) => {
      setUiState(getConnectionUiState());
    });

    setUiState(getConnectionUiState());
    return unsubscribe;
  }, []);

  useEffect(() => {
    const handleOnline = () => setUiState(getConnectionUiState());
    const handleOffline = () => setUiState(getConnectionUiState());
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const previous = previousStateRef.current;
    previousStateRef.current = uiState;

    if (countdownTimerRef.current !== null) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (countdownToastIdRef.current) {
      useToastStore.getState().dismissNotification(countdownToastIdRef.current);
      countdownToastIdRef.current = null;
    }

    if (uiState === 'reconnecting' && previous === 'connected') {
      const state = useConnectionStore.getState();
      const id = useToastStore.getState().pushNotification({
        tone: 'error',
        title: 'Connection lost',
        description: `Reconnecting… (attempt ${state.reconnectAttempt + 1}/${RECONNECT_DELAYS_MS.length})`,
      });
      countdownToastIdRef.current = id;
    } else if (uiState === 'reconnecting' && previous !== 'reconnecting') {
      const state = useConnectionStore.getState();
      if (countdownToastIdRef.current) {
        useToastStore.getState().pushNotification({
          id: countdownToastIdRef.current,
          tone: 'error',
          title: 'Reconnecting',
          description: `Attempt ${state.reconnectAttempt + 1}/${RECONNECT_DELAYS_MS.length}`,
        });
      }
    } else if (uiState === 'connected' && (previous === 'reconnecting' || previous === 'exhausted')) {
      useToastStore.getState().pushNotification({
        tone: 'success',
        title: 'Connected',
        description: 'Back online.',
      });
    } else if (uiState === 'exhausted' && previous === 'reconnecting') {
      const state = useConnectionStore.getState();
      useToastStore.getState().pushNotification({
        tone: 'error',
        title: 'Connection failed',
        description: `Could not reconnect after ${state.reconnectAttempt} attempts. Click "Refresh connection" in the toolbar to retry.`,
      });
    } else if (uiState === 'offline') {
      useToastStore.getState().pushNotification({
        tone: 'error',
        title: 'You are offline',
        description: 'Glade will reconnect automatically when your connection is restored.',
      });
    }
  }, [uiState]);

  useEffect(() => {
    const handleFocus = () => {
      if (document.visibilityState !== 'visible') return;

      const state = useConnectionStore.getState();
      if (state.phase === 'disconnected' && state.hasConnected && state.reconnectPhase !== 'exhausted') {
        setUiState(getConnectionUiState());
      }
    };

    document.addEventListener('visibilitychange', handleFocus);
    return () => document.removeEventListener('visibilitychange', handleFocus);
  }, []);

  return null;
}
