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
  readonly setServerConnected: (serverConnected: boolean) => void;
  readonly setServerVersion: (serverVersion: string | null) => void;
  readonly setSessionState: (sessionState: SessionState) => void;
  readonly setSessionReason: (sessionReason: string | null) => void;
  readonly pushNotification: (notification: Omit<ToastMessage, 'id'> & { id?: string }) => string;
  readonly dismissNotification: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  serverConnected: false,
  serverVersion: null,
  sessionState: 'connecting',
  sessionReason: null,
  notifications: [],
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
}));
