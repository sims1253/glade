import { create } from 'zustand';

export const UI_PREFS_STORAGE_KEY = 'glade:web-ui:v1';
export const LEGACY_UI_PREF_KEYS: ReadonlyArray<string> = [];
const UI_PREFS_PERSIST_DEBOUNCE_MS = 300;

interface StoredUiPrefs {
  readonly replPanelOpen: boolean;
  readonly replPanelHeight: number;
}

interface StorageLike {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
}

interface DebouncedStorage extends StorageLike {
  readonly flush: () => void;
}

interface UiPrefsState extends StoredUiPrefs {
  readonly setReplPanelOpen: (replPanelOpen: boolean) => void;
  readonly setReplPanelHeight: (replPanelHeight: number) => void;
}

const DEFAULT_UI_PREFS: StoredUiPrefs = {
  replPanelOpen: true,
  replPanelHeight: 320,
};

let legacyUiPrefsCleanedUp = false;

function clampPanelHeight(value: number) {
  return Math.max(180, Math.min(640, Math.round(value)));
}

function readStorage(): StorageLike | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const storage = window.localStorage;
  return storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function'
    ? storage
    : null;
}

export function createDebouncedStorage(
  baseStorage: StorageLike,
  debounceMs = UI_PREFS_PERSIST_DEBOUNCE_MS,
): DebouncedStorage {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingName: string | null = null;
  let pendingValue: string | null = null;

  const clearPending = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    pendingName = null;
    pendingValue = null;
  };

  return {
    getItem: (name) => baseStorage.getItem(name),
    setItem: (name, value) => {
      pendingName = name;
      pendingValue = value;
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        const nextName = pendingName;
        const nextValue = pendingValue;
        clearPending();
        if (nextName !== null && nextValue !== null) {
          baseStorage.setItem(nextName, nextValue);
        }
      }, debounceMs);
    },
    removeItem: (name) => {
      if (pendingName === name) {
        clearPending();
      }
      baseStorage.removeItem(name);
    },
    flush: () => {
      if (timer === null || pendingName === null || pendingValue === null) {
        return;
      }

      const nextName = pendingName;
      const nextValue = pendingValue;
      clearPending();
      baseStorage.setItem(nextName, nextValue);
    },
  };
}

const fallbackUiPrefsStorage: DebouncedStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  flush: () => undefined,
};

const uiPrefsStorage = (() => {
  const storage = readStorage();
  return storage ? createDebouncedStorage(storage) : fallbackUiPrefsStorage;
})();

export function flushPendingUiPrefsWrites() {
  uiPrefsStorage.flush();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPendingUiPrefsWrites);
}

export function cleanupLegacyUiPrefs(storage = readStorage()) {
  if (!storage || legacyUiPrefsCleanedUp) {
    return;
  }

  legacyUiPrefsCleanedUp = true;
  for (const key of LEGACY_UI_PREF_KEYS) {
    storage.removeItem(key);
  }
}

export function readStoredUiPrefs(storage: StorageLike | null = uiPrefsStorage): StoredUiPrefs {
  cleanupLegacyUiPrefs(storage);
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

export function writeStoredUiPrefs(value: StoredUiPrefs, storage: StorageLike | null = uiPrefsStorage) {
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
