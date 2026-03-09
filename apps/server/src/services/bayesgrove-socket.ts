import { WebSocket } from 'ws';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Queue from 'effect/Queue';
import * as Ref from 'effect/Ref';
import * as Runtime from 'effect/Runtime';
import * as Schedule from 'effect/Schedule';
import * as Schema from 'effect/Schema';
import * as Stream from 'effect/Stream';

import {
  decodeBayesgroveCommandResult,
  decodeGraphSnapshot,
  decodeProtocolEvent,
  type BayesgroveCommand,
  type BayesgroveCommandResult,
  type GraphSnapshot,
  type ProtocolEvent,
  type SessionStatus,
} from '@glade/contracts';

import { ServerConfig } from '../config';
import { ProtocolDecodeError, SessionStartupError } from '../errors';
import { FrontendBroadcast } from './frontend-broadcast';
import { SessionStatusStore } from './session-status';

export type BayesgroveInboundMessage = GraphSnapshot | ProtocolEvent | BayesgroveCommandResult;

export class BayesgroveSocket extends Context.Tag('glade/BayesgroveSocket')<
  BayesgroveSocket,
  {
    readonly connect: Effect.Effect<void, SessionStartupError>;
    readonly disconnect: Effect.Effect<void>;
    readonly isConnected: Effect.Effect<boolean>;
    readonly send: (command: BayesgroveCommand) => Effect.Effect<void, SessionStartupError>;
    readonly messages: Stream.Stream<BayesgroveInboundMessage>;
  }
>() {}

function statusMessage(state: SessionStatus['state'], reason?: string): SessionStatus {
  return reason ? { type: 'SessionStatus', state, reason } : { type: 'SessionStatus', state };
}

const decodeJsonString = Schema.decodeUnknown(Schema.parseJson());

export const BayesgroveSocketLive = Layer.scoped(
  BayesgroveSocket,
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const statusStore = yield* SessionStatusStore;
    const broadcast = yield* FrontendBroadcast;
    const effectRuntime = yield* Effect.runtime<never>();
    const socketRef = yield* Ref.make<WebSocket | null>(null);
    const closingRef = yield* Ref.make(false);
    const messageQueue = yield* Queue.unbounded<BayesgroveInboundMessage>();

    const publishStatus = (state: SessionStatus['state'], reason?: string) =>
      Effect.gen(function* () {
        const next = statusMessage(state, reason);
        yield* statusStore.set(next);
        yield* broadcast.broadcast(next);
      });

    const parseInbound = (raw: string) =>
      Effect.gen(function* () {
        const payload = yield* decodeJsonString(raw).pipe(
          Effect.mapError((cause) =>
            new ProtocolDecodeError({
              message: 'Unable to parse bayesgrove websocket message as JSON.',
              cause,
            })),
        );
        const snapshotAttempt = yield* Effect.either(decodeGraphSnapshot(payload));
        if (snapshotAttempt._tag === 'Right') {
          return snapshotAttempt.right;
        }

        const eventAttempt = yield* Effect.either(decodeProtocolEvent(payload));
        if (eventAttempt._tag === 'Right') {
          return eventAttempt.right;
        }

        const resultAttempt = yield* Effect.either(decodeBayesgroveCommandResult(payload));
        if (resultAttempt._tag === 'Right') {
          return resultAttempt.right;
        }

        return yield* new ProtocolDecodeError({
          message: 'Unable to decode bayesgrove websocket message.',
          cause: payload,
        });
      });

    const establishConnection = Effect.async<void, SessionStartupError>((resume) => {
      const socket = new WebSocket(`ws://${config.rHost}:${config.rPort}/websocket`);
      let settled = false;
      const supportsUnexpectedResponse = !('Bun' in globalThis);

      const failStartup = (message: string, cause?: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanupStartupListeners();
        resume(
          Effect.fail(
            new SessionStartupError({
              message,
              cause,
            }),
          ),
        );
      };

      const onStartupError = (error: Error) => {
        failStartup(`Failed to connect to bg_serve websocket: ${error.message}`, error);
      };

      const onStartupClose = () => {
        failStartup('bg_serve websocket closed before the session became ready.');
      };

      const onUnexpectedResponse = (request: unknown, response: { statusCode?: number; statusMessage?: string }) => {
        const status = [response.statusCode, response.statusMessage].filter(Boolean).join(' ');
        failStartup(
          `bg_serve websocket handshake failed${status ? `: ${status}` : '.'}`,
          response,
        );
      };

      const cleanupStartupListeners = () => {
        socket.off('error', onStartupError);
        socket.off('close', onStartupClose);
        if (supportsUnexpectedResponse) {
          socket.off('unexpected-response', onUnexpectedResponse);
        }
      };

      socket.on('error', onStartupError);
      socket.on('close', onStartupClose);
      if (supportsUnexpectedResponse) {
        socket.on('unexpected-response', onUnexpectedResponse);
      }

      socket.once('open', () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanupStartupListeners();

        socket.on('message', (data) => {
          void Runtime.runPromise(
            effectRuntime,
            parseInbound(String(data)).pipe(
              Effect.flatMap((message) => Queue.offer(messageQueue, message)),
              Effect.catchAll((error) => publishStatus('error', `protocol_decode_error:${error.message}`)),
            ),
          );
        });
        socket.on('close', () => {
          void Runtime.runPromise(
            effectRuntime,
            Effect.gen(function* () {
              const closing = yield* Ref.get(closingRef);
              yield* Ref.set(socketRef, null);
              if (!closing) {
                yield* publishStatus('error', 'bayesgrove_socket_closed');
              }
            }),
          );
        });
        socket.on('error', (error) => {
          void Runtime.runPromise(
            effectRuntime,
            publishStatus('error', `bayesgrove_socket_error:${error.message}`),
          );
        });
        void Runtime.runPromise(effectRuntime, Ref.set(socketRef, socket));
        resume(Effect.void);
      });
    });

    const connect = Effect.gen(function* () {
      const current = yield* Ref.get(socketRef);
      if (current) {
        return;
      }
      yield* Ref.set(closingRef, false);
      yield* establishConnection.pipe(
        Effect.retry(
          Schedule.compose(
            Schedule.recurs(40),
            Schedule.exponential('100 millis'),
          ),
        ),
      );
    });

    const disconnect = Effect.gen(function* () {
      yield* Ref.set(closingRef, true);
      const current = yield* Ref.get(socketRef);
      if (!current) {
        return;
      }

      yield* Effect.tryPromise(
        () =>
          new Promise<void>((resolve) => {
            current.once('close', () => resolve());
            current.close();
            setTimeout(resolve, 1_000).unref();
          }),
      ).pipe(Effect.orDie);
      yield* Ref.set(socketRef, null);
    });

    const send = (command: BayesgroveCommand) =>
      Effect.gen(function* () {
        const current = yield* Ref.get(socketRef);
        if (!current || current.readyState !== current.OPEN) {
          return yield* new SessionStartupError({
            message: 'bg_serve websocket is not connected.',
          });
        }
        yield* Effect.try({
          try: () => current.send(JSON.stringify(command)),
          catch: (cause) =>
            new SessionStartupError({
              message: 'Failed to send command to bg_serve.',
              cause,
            }),
        });
      });
    yield* Effect.addFinalizer(() => disconnect);

    return {
      connect,
      disconnect,
      isConnected: Ref.get(socketRef).pipe(Effect.map((socket) => socket !== null)),
      send,
      messages: Stream.fromQueue(messageQueue),
    };
  }),
);
