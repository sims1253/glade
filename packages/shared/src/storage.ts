export interface StateStorage<R = string> {
  readonly getItem: (key: string) => R | null;
  readonly setItem: (key: string, value: R) => void;
  readonly removeItem: (key: string) => void;
}

export interface DebouncedStorage<R = string> extends StateStorage<R> {
  readonly flush: () => void;
}

export function createMemoryStorage<R = string>(): StateStorage<R> {
  const map = new Map<string, R>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
  };
}

export function isStateStorage(value: unknown): value is StateStorage {
  return (
    value != null
    && typeof value === 'object'
    && typeof (value as StateStorage).getItem === 'function'
    && typeof (value as StateStorage).setItem === 'function'
    && typeof (value as StateStorage).removeItem === 'function'
  );
}

export function resolveStorage(storage: StateStorage | null | undefined): StateStorage {
  return storage ?? createMemoryStorage();
}

export function createDebouncedStorage<R = string>(
  baseStorage: StateStorage<R>,
  debounceMs = 300,
): DebouncedStorage<R> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingKey: string | null = null;
  let pendingValue: R | null = null;

  const clearPending = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    pendingKey = null;
    pendingValue = null;
  };

  return {
    getItem: (key) => baseStorage.getItem(key),
    setItem: (key, value) => {
      pendingKey = key;
      pendingValue = value;
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        const nextKey = pendingKey;
        const nextValue = pendingValue;
        clearPending();
        if (nextKey !== null && nextValue !== null) {
          baseStorage.setItem(nextKey, nextValue);
        }
      }, debounceMs);
    },
    removeItem: (key) => {
      if (pendingKey === key) {
        clearPending();
      }
      baseStorage.removeItem(key);
    },
    flush: () => {
      if (timer === null || pendingKey === null || pendingValue === null) {
        return;
      }

      const nextKey = pendingKey;
      const nextValue = pendingValue;
      clearPending();
      baseStorage.setItem(nextKey, nextValue);
    },
  };
}
