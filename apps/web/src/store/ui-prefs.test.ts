// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDebouncedStorage } from './ui-prefs';

function createMockStorage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
}

describe('createDebouncedStorage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('delays writes until the debounce expires', () => {
    const baseStorage = createMockStorage();
    const storage = createDebouncedStorage(baseStorage);

    storage.setItem('key', 'first');

    expect(baseStorage.setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(299);
    expect(baseStorage.setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(baseStorage.setItem).toHaveBeenCalledWith('key', 'first');
  });

  it('coalesces rapid writes into the latest value', () => {
    const baseStorage = createMockStorage();
    const storage = createDebouncedStorage(baseStorage);

    storage.setItem('key', 'first');
    storage.setItem('key', 'second');
    storage.setItem('key', 'third');

    vi.advanceTimersByTime(300);
    expect(baseStorage.setItem).toHaveBeenCalledTimes(1);
    expect(baseStorage.setItem).toHaveBeenCalledWith('key', 'third');
  });

  it('cancels pending writes when removeItem is called for the same key', () => {
    const baseStorage = createMockStorage();
    const storage = createDebouncedStorage(baseStorage);

    storage.setItem('key', 'value');
    storage.removeItem('key');

    vi.advanceTimersByTime(300);
    expect(baseStorage.setItem).not.toHaveBeenCalled();
    expect(baseStorage.removeItem).toHaveBeenCalledWith('key');
  });

  it('flushes a pending write immediately', () => {
    const baseStorage = createMockStorage();
    const storage = createDebouncedStorage(baseStorage);

    storage.setItem('key', JSON.stringify({
      replPanelOpen: false,
      replPanelHeight: 420,
    }));

    expect(baseStorage.setItem).not.toHaveBeenCalled();

    storage.flush();

    expect(baseStorage.setItem).toHaveBeenCalledTimes(1);
    expect(baseStorage.setItem).toHaveBeenCalledWith(
      'key',
      JSON.stringify({
        replPanelOpen: false,
        replPanelHeight: 420,
      }),
    );

    vi.advanceTimersByTime(300);
    expect(baseStorage.setItem).toHaveBeenCalledTimes(1);
  });
});
