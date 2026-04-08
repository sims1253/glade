import { create } from 'zustand';

import { type DebouncedStorage, createDebouncedStorage, createMemoryStorage, type StateStorage } from '@glade/shared';

const UI_PREFS_STORAGE_KEY = 'glade:web-ui:v1';

interface StoredUiPrefs {
  readonly replPanelOpen: boolean;
  readonly replPanelHeight: number;
}

interface UiPrefsState extends StoredUiPrefs {
  readonly setReplPanelOpen: (replPanelOpen: boolean) => void;
  readonly setReplPanelHeight: (replPanelHeight: number) => void;
}

const DEFAULT_UI_PREFS: StoredUiPrefs = {
  replPanelOpen: true,
  replPanelHeight: 320,
};

function clampPanelHeight(value: number) {
  return Math.max(180, Math.min(640, Math.round(value)));
}

function readStorage(): StateStorage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const storage = window.localStorage;
  return storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function'
    ? storage
    : null;
}

const fallbackUiPrefsStorage: DebouncedStorage = {
  ...createMemoryStorage(),
  flush: () => undefined,
};

const uiPrefsStorage: DebouncedStorage = (() => {
  const storage = readStorage();
  return storage ? createDebouncedStorage(storage) : fallbackUiPrefsStorage;
})();

function flushPendingUiPrefsWrites() {
  uiPrefsStorage.flush();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPendingUiPrefsWrites);
}

function readStoredUiPrefs(storage: StateStorage | null = uiPrefsStorage): StoredUiPrefs {
  if (!storage) {
    return DEFAULT_UI_PREFS;
  }

  const raw = storage.getItem(UI_PREFS_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_UI_PREFS;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredUiPrefs> | null;
    return {
      replPanelOpen: typeof parsed?.replPanelOpen === 'boolean' ? parsed.replPanelOpen : DEFAULT_UI_PREFS.replPanelOpen,
      replPanelHeight: typeof parsed?.replPanelHeight === 'number'
        ? clampPanelHeight(parsed.replPanelHeight)
        : DEFAULT_UI_PREFS.replPanelHeight,
    };
  } catch {
    storage.removeItem(UI_PREFS_STORAGE_KEY);
    return DEFAULT_UI_PREFS;
  }
}

function writeStoredUiPrefs(value: StoredUiPrefs, storage: StateStorage | null = uiPrefsStorage) {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify({
      replPanelOpen: value.replPanelOpen,
      replPanelHeight: clampPanelHeight(value.replPanelHeight),
    }));
  } catch {
    return;
  }
}

const initialState = readStoredUiPrefs();

export const useUiPrefsStore = create<UiPrefsState>((set, get) => ({
  ...initialState,
  setReplPanelOpen: (replPanelOpen) => {
    set({ replPanelOpen });
    writeStoredUiPrefs({
      replPanelOpen,
      replPanelHeight: get().replPanelHeight,
    });
  },
  setReplPanelHeight: (replPanelHeight) => {
    const next = clampPanelHeight(replPanelHeight);
    set({ replPanelHeight: next });
    writeStoredUiPrefs({
      replPanelOpen: get().replPanelOpen,
      replPanelHeight: next,
    });
  },
}));
