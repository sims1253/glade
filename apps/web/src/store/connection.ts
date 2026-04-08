import { create } from 'zustand';

import type { DesktopEnvironmentState, ServerBootstrap, SessionStatus } from '@glade/contracts';

type SessionState = SessionStatus['state'];

export type ConnectionPhase = 'idle' | 'connecting' | 'connected' | 'disconnected';
export type ReconnectPhase = 'idle' | 'attempting' | 'waiting' | 'exhausted';

export interface ConnectionState {
  readonly serverConnected: boolean;
  readonly serverVersion: string | null;
  readonly sessionState: SessionState;
  readonly sessionReason: string | null;
  readonly projectPath: string | null;
  readonly desktopEnvironment: DesktopEnvironmentState | null;
  readonly bootstrapped: boolean;
  readonly phase: ConnectionPhase;
  readonly reconnectPhase: ReconnectPhase;
  readonly reconnectAttempt: number;
  readonly nextRetryAt: string | null;
  readonly hasConnected: boolean;
  readonly connectedAt: string | null;
  readonly disconnectedAt: string | null;
  readonly lastError: string | null;
  readonly markConnecting: () => void;
  readonly markConnected: () => void;
  readonly markDisconnected: (reason: string) => void;
  readonly markReconnectAttempt: () => void;
  readonly markReconnectWaiting: (nextRetryAt: string) => void;
  readonly markReconnectExhausted: () => void;
  readonly resetReconnect: () => void;
  readonly applyBootstrap: (bootstrap: ServerBootstrap) => void;
  readonly setDesktopEnvironment: (environment: DesktopEnvironmentState) => void;
  readonly setSessionStatus: (status: SessionStatus) => void;
}

const MAX_RECONNECT_ATTEMPTS = 7;
const TOTAL_RECONNECT_ATTEMPTS = MAX_RECONNECT_ATTEMPTS + 1;

export const RECONNECT_DELAYS_MS: ReadonlyArray<number> = Array.from(
  { length: TOTAL_RECONNECT_ATTEMPTS },
  (_, i) => Math.min(1000 * Math.pow(2, i), 64_000),
);

export const useConnectionStore = create<ConnectionState>((set) => ({
  serverConnected: false,
  serverVersion: null,
  sessionState: 'connecting',
  sessionReason: null,
  projectPath: null,
  desktopEnvironment: null,
  bootstrapped: false,
  phase: 'idle',
  reconnectPhase: 'idle',
  reconnectAttempt: 0,
  nextRetryAt: null,
  hasConnected: false,
  connectedAt: null,
  disconnectedAt: null,
  lastError: null,
  markConnecting: () =>
    set((state) => ({
      serverConnected: false,
      phase: 'connecting',
      sessionState: state.bootstrapped ? state.sessionState : 'connecting',
      sessionReason: null,
      reconnectPhase: 'attempting',
    })),
  markConnected: () =>
    set({
      serverConnected: true,
      phase: 'connected',
      reconnectPhase: 'idle',
      reconnectAttempt: 0,
      nextRetryAt: null,
      hasConnected: true,
      connectedAt: new Date().toISOString(),
      lastError: null,
    }),
  markDisconnected: (reason) =>
    set((state) => ({
      serverConnected: false,
      phase: 'disconnected',
      sessionState: 'error',
      sessionReason: reason,
      disconnectedAt: new Date().toISOString(),
      lastError: reason,
      reconnectPhase: state.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS ? 'exhausted' : 'waiting',
    })),
  markReconnectAttempt: () =>
    set((state) => ({
      phase: 'connecting',
      reconnectPhase: 'attempting',
      reconnectAttempt: state.reconnectAttempt + 1,
    })),
  markReconnectWaiting: (nextRetryAt) =>
    set({
      phase: 'disconnected',
      reconnectPhase: 'waiting',
      nextRetryAt,
    }),
  markReconnectExhausted: () =>
    set({
      reconnectPhase: 'exhausted',
      nextRetryAt: null,
    }),
  resetReconnect: () =>
    set({
      reconnectAttempt: 0,
      reconnectPhase: 'idle',
      nextRetryAt: null,
    }),
  applyBootstrap: (bootstrap) =>
    set({
      serverConnected: true,
      phase: 'connected',
      serverVersion: bootstrap.version,
      sessionState: bootstrap.sessionStatus.state,
      sessionReason: bootstrap.sessionStatus.reason ?? null,
      projectPath: bootstrap.projectPath,
      desktopEnvironment: bootstrap.desktopEnvironment ?? null,
      bootstrapped: true,
      hasConnected: true,
      connectedAt: new Date().toISOString(),
      reconnectPhase: 'idle',
      reconnectAttempt: 0,
      nextRetryAt: null,
      lastError: null,
    }),
  setDesktopEnvironment: (desktopEnvironment) => set({ desktopEnvironment }),
  setSessionStatus: (status) =>
    set((state) => {
      if (!state.serverConnected) {
        return state;
      }

      return {
        sessionState: status.state,
        sessionReason: status.reason ?? null,
      };
    }),
}));
