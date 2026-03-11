// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ServerBootstrap } from '@glade/contracts';

import { useRpcClient } from './useRpcClient';
import { useConnectionStore } from '../store/connection';
import { useReplStore } from '../store/repl';
import { useToastStore } from '../store/toast';

class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: Array<MockWebSocket> = [];

  readonly sent: Array<string> = [];
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  emitOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  emitJson(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent<string>);
  }

  emitRaw(payload: string) {
    this.onmessage?.({ data: payload } as MessageEvent<string>);
  }
}

const bootstrap: ServerBootstrap = {
  _tag: 'ServerBootstrap',
  version: '0.12.3',
  projectPath: null,
  sessionStatus: {
    _tag: 'SessionStatus',
    state: 'ready',
  },
  replHistory: ['boot'],
};

beforeEach(() => {
  MockWebSocket.instances = [];
  useConnectionStore.setState({
    serverConnected: false,
    serverVersion: null,
    sessionState: 'connecting',
    sessionReason: null,
    projectPath: null,
    desktopEnvironment: null,
    bootstrapped: false,
  });
  useReplStore.setState({ replLines: [], replDetached: false });
  useToastStore.setState({ notifications: [] });
  vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useRpcClient', () => {
  it('queues requests until the websocket opens', async () => {
    const { result } = renderHook(() => useRpcClient());
    const socket = MockWebSocket.instances[0];

    const requestPromise = result.current.session.restart();
    expect(socket?.sent).toHaveLength(0);

    act(() => {
      socket?.emitOpen();
    });

    const envelope = JSON.parse(socket?.sent[0] ?? '{}') as { id: string };
    act(() => {
      socket?.emitJson({
        _tag: 'WebSocketSuccess',
        id: envelope.id,
        method: 'session.restart',
        result: { _tag: 'AckResult' },
      });
    });

    await expect(requestPromise).resolves.toMatchObject({ success: true });
  });

  it('keeps requests queued during reconnect windows', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result } = renderHook(() => useRpcClient());
    const firstSocket = MockWebSocket.instances[0];

    act(() => {
      firstSocket?.emitOpen();
      firstSocket?.close();
    });

    const requestPromise = result.current.session.restart();
    expect(firstSocket?.sent).toHaveLength(0);

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    const secondSocket = MockWebSocket.instances[1];
    expect(secondSocket).toBeTruthy();

    act(() => {
      secondSocket?.emitOpen();
    });

    expect(secondSocket?.sent).toHaveLength(1);
    const envelope = JSON.parse(secondSocket?.sent[0] ?? '{}') as { id: string };
    act(() => {
      secondSocket?.emitJson({
        _tag: 'WebSocketSuccess',
        id: envelope.id,
        method: 'session.restart',
        result: { _tag: 'AckResult' },
      });
    });

    await expect(requestPromise).resolves.toMatchObject({ success: true });
  });

  it('reports malformed inbound messages and continues processing later pushes', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderHook(() => useRpcClient());
    const socket = MockWebSocket.instances[0];

    act(() => {
      socket?.emitOpen();
      socket?.emitRaw('{ invalid-json');
      socket?.emitJson({
        _tag: 'WsPush',
        channel: 'server.bootstrap',
        payload: bootstrap,
      });
    });

    await waitFor(() => expect(useConnectionStore.getState().bootstrapped).toBe(true));
    expect(useReplStore.getState().replLines).toEqual(['boot']);
    expect(useToastStore.getState().notifications.at(-1)).toMatchObject({
      tone: 'error',
      title: 'Could not process server message',
    });
    expect(warnSpy).toHaveBeenCalledWith(
      '[websocket] dropped inbound server message',
      expect.any(String),
    );
  });
});
