// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  canDetachTerminal,
  hasNativeFilePicker,
  isDesktopRuntime,
  SessionRestartAfterEnvironmentUpdateError,
  websocketUrl,
} from './runtime';

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as Record<string, unknown>).desktopBridge;
});

describe('isDesktopRuntime', () => {
  it('returns false when no desktopBridge is present', () => {
    expect(isDesktopRuntime()).toBe(false);
  });

  it('returns true when desktopBridge is defined', () => {
    (window as unknown as Record<string, unknown>).desktopBridge = {};
    expect(isDesktopRuntime()).toBe(true);
  });
});

describe('hasNativeFilePicker', () => {
  it('returns false without a bridge', () => {
    expect(hasNativeFilePicker()).toBe(false);
  });

  it('returns false when pickFile is not a function', () => {
    (window as unknown as Record<string, unknown>).desktopBridge = {};
    expect(hasNativeFilePicker()).toBe(false);
  });

  it('returns true when pickFile is a function', () => {
    (window as unknown as Record<string, unknown>).desktopBridge = { pickFile: vi.fn() };
    expect(hasNativeFilePicker()).toBe(true);
  });
});

describe('canDetachTerminal', () => {
  it('returns false without a bridge', () => {
    expect(canDetachTerminal()).toBe(false);
  });

  it('returns true when openDetachedTerminal is a function', () => {
    (window as unknown as Record<string, unknown>).desktopBridge = { openDetachedTerminal: vi.fn() };
    expect(canDetachTerminal()).toBe(true);
  });
});

describe('websocketUrl', () => {
  it('returns ws:// URL based on window.location when no bridge', () => {
    const url = websocketUrl();
    expect(url).toMatch(/^wss?:\/\//);
    expect(url).toContain('/ws');
  });

  it('uses the bridge WS URL when available', () => {
    (window as unknown as Record<string, unknown>).desktopBridge = { getWsUrl: () => 'ws://localhost:9000/ws' };
    expect(websocketUrl()).toBe('ws://localhost:9000/ws');
  });

  it('falls back to window.location when bridge returns null', () => {
    (window as unknown as Record<string, unknown>).desktopBridge = { getWsUrl: () => null };
    const url = websocketUrl();
    expect(url).toContain('/ws');
    expect(url).toMatch(/^wss?:\/\//);
  });
});

describe('SessionRestartAfterEnvironmentUpdateError', () => {
  it('is an Error with the correct name and properties', () => {
    const env = {} as never;
    const cause = new Error('cause');
    const err = new SessionRestartAfterEnvironmentUpdateError('msg', env, cause);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('SessionRestartAfterEnvironmentUpdateError');
    expect(err.message).toBe('msg');
    expect(err.environment).toBe(env);
    expect(err.cause).toBe(cause);
  });
});
