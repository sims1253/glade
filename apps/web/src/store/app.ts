import { create } from 'zustand';

type SessionState = 'connecting' | 'ready' | 'error';
export type ToastTone = 'success' | 'error';

export interface ToastMessage {
  readonly id: string;
  readonly tone: ToastTone;
  readonly title: string;
  readonly description: string | null;
}

interface AppState {
  readonly serverConnected: boolean;
  readonly serverVersion: string | null;
  readonly sessionState: SessionState;
  readonly sessionReason: string | null;
  readonly notifications: ReadonlyArray<ToastMessage>;
  readonly replLines: ReadonlyArray<string>;
  readonly replPanelOpen: boolean;
  readonly replPanelHeight: number;
  readonly replDetached: boolean;
  readonly setServerConnected: (serverConnected: boolean) => void;
  readonly setServerVersion: (serverVersion: string | null) => void;
  readonly setSessionState: (sessionState: SessionState) => void;
  readonly setSessionReason: (sessionReason: string | null) => void;
  readonly pushNotification: (notification: Omit<ToastMessage, 'id'> & { id?: string }) => string;
  readonly dismissNotification: (id: string) => void;
  readonly appendReplLine: (line: string) => void;
  readonly clearReplLines: () => void;
  readonly setReplPanelOpen: (replPanelOpen: boolean) => void;
  readonly setReplPanelHeight: (replPanelHeight: number) => void;
  readonly setReplDetached: (replDetached: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  serverConnected: false,
  serverVersion: null,
  sessionState: 'connecting',
  sessionReason: null,
  notifications: [],
  replLines: [],
  replPanelOpen: true,
  replPanelHeight: 320,
  replDetached: false,
  setServerConnected: (serverConnected) => set({ serverConnected }),
  setServerVersion: (serverVersion) => set({ serverVersion }),
  setSessionState: (sessionState) => set({ sessionState }),
  setSessionReason: (sessionReason) => set({ sessionReason }),
  pushNotification: (notification) => {
    const id = notification.id ?? crypto.randomUUID();
    set((state) => ({
      notifications: [...state.notifications, { ...notification, id }],
    }));
    return id;
  },
  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((notification) => notification.id !== id),
    })),
  appendReplLine: (line) =>
    set((state) => ({
      replLines: [...state.replLines, line],
    })),
  clearReplLines: () => set({ replLines: [] }),
  setReplPanelOpen: (replPanelOpen) => set({ replPanelOpen }),
  setReplPanelHeight: (replPanelHeight) => set({ replPanelHeight: Math.max(180, Math.min(640, Math.round(replPanelHeight))) }),
  setReplDetached: (replDetached) => set({ replDetached }),
}));
