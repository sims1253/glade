import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Effect from 'effect/Effect';

import type { SessionStatus, WsPush } from '@glade/contracts';

import { WebSocketHub, WebSocketHubLive } from './websocket-hub';

class MockSocket {
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 3;

  readyState = this.OPEN;
  readonly sent: Array<string> = [];

  send(payload: string) {
    this.sent.push(payload);
  }
}

async function makeHub() {
  return await Effect.runPromise(WebSocketHub.pipe(Effect.provide(WebSocketHubLive)));
}

function sessionStatusPush(state: SessionStatus['state']): WsPush {
  return {
    _tag: 'WsPush',
    channel: 'session.status',
    payload: {
      _tag: 'SessionStatus',
      state,
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('WebSocketHub.send', () => {
  it('retries briefly while a socket is still connecting', async () => {
    vi.useFakeTimers();

    const hub = await makeHub();
    const socket = new MockSocket();
    socket.readyState = socket.CONNECTING;

    const sendPromise = Effect.runPromise(hub.send(socket as never, sessionStatusPush('connecting')));

    setTimeout(() => {
      socket.readyState = socket.OPEN;
    }, 10);

    await vi.advanceTimersByTimeAsync(50);

    await expect(sendPromise).resolves.toBe(true);
    expect(socket.sent).toHaveLength(1);
    const [firstMessage] = socket.sent;
    expect(firstMessage).toBeDefined();
    expect(JSON.parse(firstMessage!)).toMatchObject({
      _tag: 'WsPush',
      channel: 'session.status',
      payload: { _tag: 'SessionStatus', state: 'connecting' },
    });
  });

  it('fails immediately when a socket is already closed', async () => {
    const hub = await makeHub();
    const socket = new MockSocket();
    socket.readyState = socket.CLOSED;

    await expect(Effect.runPromise(hub.send(socket as never, sessionStatusPush('error')))).resolves.toBe(false);
    expect(socket.sent).toHaveLength(0);
  });
});
