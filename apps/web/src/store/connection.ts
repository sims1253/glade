import { create } from 'zustand';

import type { ServerBootstrap, SessionStatus } from '@glade/contracts';

type SessionState = SessionStatus['state'];

interface ConnectionState {
  readonly serverConnected: boolean;
  readonly serverVersion: string | null;
  readonly sessionState: SessionState;
  readonly sessionReason: string | null;
  readonly runtime: string | null;
  readonly hostedMode: boolean | null;
  readonly projectPath: string | null;
  readonly bootstrapped: boolean;
  readonly markConnecting: () => void;
  readonly markDisconnected: (reason: string) => void;
  readonly applyBootstrap: (bootstrap: ServerBootstrap) => void;
  readonly setSessionStatus: (status: SessionStatus) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  serverConnected: false,
  serverVersion: null,
  sessionState: 'connecting',
  sessionReason: null,
  runtime: null,
  hostedMode: null,
  projectPath: null,
  bootstrapped: false,
  markConnecting: () =>
    set((state) => ({
      serverConnected: true,
      sessionState: state.bootstrapped ? state.sessionState : 'connecting',
      sessionReason: null,
    })),
  markDisconnected: (reason) =>
    set({
      serverConnected: false,
      sessionState: 'error',
      sessionReason: reason,
    }),
  applyBootstrap: (bootstrap) =>
    set({
      serverConnected: true,
      serverVersion: bootstrap.version,
      sessionState: bootstrap.sessionStatus.state,
      sessionReason: bootstrap.sessionStatus.reason ?? null,
      runtime: bootstrap.runtime,
      hostedMode: bootstrap.hostedMode,
      projectPath: bootstrap.projectPath,
      bootstrapped: true,
    }),
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
