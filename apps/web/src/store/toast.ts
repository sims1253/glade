import { create } from 'zustand';

import { randomUUID } from '../lib/utils';

export type ToastTone = 'success' | 'error';

export interface ToastMessage {
  readonly id: string;
  readonly tone: ToastTone;
  readonly title: string;
  readonly description: string | null;
}

interface ToastState {
  readonly notifications: ReadonlyArray<ToastMessage>;
  readonly pushNotification: (notification: Omit<ToastMessage, 'id'> & { id?: string }) => string;
  readonly dismissNotification: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  notifications: [],
  pushNotification: (notification) => {
    const id = notification.id ?? randomUUID();
    set((state) => ({
      notifications: state.notifications.some((entry) => entry.id === id)
        ? state.notifications.map((entry) => (entry.id === id ? { ...notification, id } : entry))
        : [...state.notifications, { ...notification, id }],
    }));
    return id;
  },
  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((notification) => notification.id !== id),
    })),
}));
