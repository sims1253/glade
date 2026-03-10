import { afterEach, describe, expect, it, vi } from 'vitest';

import { randomUUID } from './utils';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('randomUUID', () => {
  it('uses crypto.randomUUID when available', () => {
    const nativeUuid = 'native-uuid-0000-0000-0000-000000000000' as const;
    const nativeRandomUUID = vi.fn<() => `${string}-${string}-${string}-${string}-${string}`>(() => nativeUuid);
    const getRandomValues = vi.fn(<T extends ArrayBufferView>(array: T) => array);

    vi.stubGlobal('crypto', {
      randomUUID: nativeRandomUUID,
      getRandomValues,
    });

    expect(randomUUID()).toBe(nativeUuid);
    expect(nativeRandomUUID).toHaveBeenCalledTimes(1);
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  it('falls back to crypto.getRandomValues when randomUUID is unavailable', () => {
    const getRandomValues = vi.fn(<T extends ArrayBufferView>(array: T) => {
      if (array instanceof Uint8Array) {
        array.set(Uint8Array.from({ length: 16 }, (_, index) => index));
      }

      return array;
    });

    vi.stubGlobal('crypto', { getRandomValues });

    expect(randomUUID()).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });
});
