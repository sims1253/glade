import { create } from 'zustand';

type SessionState = 'connecting' | 'ready' | 'error';

interface AppState {
  readonly serverConnected: boolean;
  readonly serverVersion: string | null;
  readonly sessionState: SessionState;
  readonly sessionReason: string | null;
  readonly setServerConnected: (serverConnected: boolean) => void;
  readonly setServerVersion: (serverVersion: string | null) => void;
  readonly setSessionState: (sessionState: SessionState) => void;
  readonly setSessionReason: (sessionReason: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  serverConnected: false,
  serverVersion: null,
  sessionState: 'connecting',
  sessionReason: null,
  setServerConnected: (serverConnected) => set({ serverConnected }),
  setServerVersion: (serverVersion) => set({ serverVersion }),
  setSessionState: (sessionState) => set({ sessionState }),
  setSessionReason: (sessionReason) => set({ sessionReason }),
}));
