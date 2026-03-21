/**
 * E2E test fixture for WebSocket interaction with the Glade server.
 *
 * Provides a wrapper around the native WebSocket that handles:
 * - Connecting to the server's /ws endpoint
 * - Sending `WebSocketRequest` commands with auto-incrementing IDs
 * - Awaiting messages matching a predicate with timeout
 * - Unpacking `WsPush` messages (server.bootstrap, workflow.snapshot, etc.)
 */

const WS_TIMEOUT_MS = 30_000;

/**
 * A WebSocket message from the server.
 */
export type ServerMessage = Record<string, unknown>;

/**
 * Result of connecting to the server WebSocket.
 */
export interface WebSocketHandle {
  /** Send a command and return its request ID. */
  readonly send: (method: string, body?: Record<string, unknown>) => string;
  /**
   * Wait for a message matching the predicate.
   * Checks all accumulated messages and new arrivals up to the timeout.
   */
  readonly waitForMessage: (predicate: (msg: ServerMessage) => boolean, timeoutMs?: number) => Promise<ServerMessage>;
  /** Wait for a WsPush on a specific channel. */
  readonly waitForChannel: (channel: string, timeoutMs?: number) => Promise<ServerMessage>;
  /**
   * Wait for a WebSocketSuccess response matching a given request ID.
   * Returns the response payload.
   */
  readonly waitForResponse: (requestId: string, timeoutMs?: number) => Promise<ServerMessage>;
  /** Get all accumulated messages so far. */
  readonly getMessages: () => readonly ServerMessage[];
  /** Close the WebSocket connection. */
  readonly close: () => Promise<void>;
}

/**
 * Unpack a WsPush message into its constituent parts.
 *
 * For `server.bootstrap`, the embedded snapshot is also pushed as a separate message.
 * For `workflow.snapshot` and `workflow.event`, the payload is also pushed.
 */
function unpackMessage(message: ServerMessage): ServerMessage[] {
  if (message._tag !== 'WsPush') {
    return [message];
  }

  const payload = message.payload;
  if (!payload || typeof payload !== 'object') {
    return [message];
  }

  const normalized: ServerMessage[] = [message];

  if (message.channel === 'server.bootstrap') {
    const snapshot = (payload as { snapshot?: unknown }).snapshot;
    if (snapshot && typeof snapshot === 'object') {
      normalized.push(snapshot as ServerMessage);
    }
    return normalized;
  }

  if (
    message.channel === 'workflow.snapshot' ||
    message.channel === 'workflow.event' ||
    message.channel === 'repl.output' ||
    message.channel === 'repl.rawOutput'
  ) {
    normalized.push(payload as ServerMessage);
  }

  return normalized;
}

/**
 * Connect to the server's WebSocket endpoint.
 *
 * @param port - The server port to connect to.
 * @returns A handle with send, waitForMessage, waitForChannel, waitForResponse, and close methods.
 */
export function connectWebSocket(port: number): WebSocketHandle {
  const messages: ServerMessage[] = [];
  const pendingWaiters: Array<{
    predicate: (msg: ServerMessage) => boolean;
    resolve: (msg: ServerMessage) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  let requestIdCounter = 0;
  let closed = false;

  // Use native WebSocket (available in Node.js 25+)
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  ws.addEventListener('message', (event: MessageEvent) => {
    const parsed = JSON.parse(String(event.data)) as ServerMessage;
    const unpacked = unpackMessage(parsed);

    for (const msg of unpacked) {
      messages.push(msg);

      // Check pending waiters (iterate in reverse to allow splice)
      for (let i = pendingWaiters.length - 1; i >= 0; i--) {
        const waiter = pendingWaiters[i]!;
        if (waiter.predicate(msg)) {
          clearTimeout(waiter.timer);
          pendingWaiters.splice(i, 1);
          waiter.resolve(msg);
        }
      }
    }
  });

  ws.addEventListener('error', (event: Event) => {
    const error = new Error(`WebSocket error: ${(event as ErrorEvent).message ?? 'unknown'}`);
    for (const waiter of pendingWaiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    pendingWaiters.length = 0;
  });

  ws.addEventListener('close', () => {
    closed = true;
    for (const waiter of pendingWaiters) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('WebSocket closed before message was received'));
    }
    pendingWaiters.length = 0;
  });

  function send(method: string, body?: Record<string, unknown>): string {
    if (closed) {
      throw new Error('Cannot send on closed WebSocket');
    }

    const id = String(++requestIdCounter);
    const request = {
      _tag: 'WebSocketRequest',
      id,
      method,
      ...(body !== undefined ? { body } : {}),
    };

    ws.send(JSON.stringify(request));
    return id;
  }

  function waitForMessage(
    predicate: (msg: ServerMessage) => boolean,
    timeoutMs: number = WS_TIMEOUT_MS,
  ): Promise<ServerMessage> {
    // Check already-accumulated messages first
    for (const msg of messages) {
      if (predicate(msg)) {
        return Promise.resolve(msg);
      }
    }

    // Wait for a new message
    return new Promise<ServerMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = pendingWaiters.findIndex((w) => w.resolve === resolve);
        if (idx !== -1) {
          pendingWaiters.splice(idx, 1);
        }
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for WebSocket message`));
      }, timeoutMs);

      pendingWaiters.push({ predicate, resolve, reject, timer });
    });
  }

  function waitForChannel(channel: string, timeoutMs?: number): Promise<ServerMessage> {
    return waitForMessage(
      (msg) => msg._tag === 'WsPush' && msg.channel === channel,
      timeoutMs,
    );
  }

  function waitForResponse(requestId: string, timeoutMs?: number): Promise<ServerMessage> {
    return waitForMessage(
      (msg) =>
        (msg._tag === 'WebSocketSuccess' || msg._tag === 'WebSocketError') &&
        msg.id === requestId,
      timeoutMs,
    );
  }

  function getMessages(): readonly ServerMessage[] {
    return messages;
  }

  async function close(): Promise<void> {
    if (closed) {
      return;
    }

    return new Promise<void>((resolve) => {
      ws.addEventListener('close', () => resolve(), { once: true });
      ws.close();
      // Fallback resolve after 2s in case close event doesn't fire
      setTimeout(resolve, 2_000);
    });
  }

  return { send, waitForMessage, waitForChannel, waitForResponse, getMessages, close };
}
