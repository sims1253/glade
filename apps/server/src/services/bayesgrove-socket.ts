import { WebSocket } from 'ws';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Queue from 'effect/Queue';
import * as Ref from 'effect/Ref';
import * as Schedule from 'effect/Schedule';
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

export const BayesgroveSocketLive = Layer.effect(
  BayesgroveSocket,
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const statusStore = yield* SessionStatusStore;
    const broadcast = yield* FrontendBroadcast;
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
        const payload = JSON.parse(raw) as unknown;
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

        return yield* Effect.fail(
          new ProtocolDecodeError({
            message: 'Unable to decode bayesgrove websocket message.',
            cause: payload,
          }),
        );
      });

    const establishConnection = Effect.async<void, SessionStartupError>((resume) => {
      const socket = new WebSocket(`ws://${config.rHost}:${config.rPort}/websocket`);
      let settled = false;

      socket.once('open', () => {
        settled = true;
        socket.on('message', (data) => {
          void Effect.runPromise(
            parseInbound(String(data)).pipe(
              Effect.flatMap((message) => Queue.offer(messageQueue, message)),
              Effect.catchAll((error) => publishStatus('error', `protocol_decode_error:${error.message}`)),
            ),
          );
        });
        socket.on('close', () => {
          void Effect.runPromise(
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
          void Effect.runPromise(
            publishStatus('error', `bayesgrove_socket_error:${error.message}`),
          );
        });
        void Effect.runPromise(Ref.set(socketRef, socket));
        resume(Effect.void);
      });

      socket.once('error', (error) => {
        if (!settled) {
          resume(
            Effect.fail(
              new SessionStartupError({
                message: `Failed to connect to bg_serve websocket: ${error.message}`,
                cause: error,
              }),
            ),
          );
        }
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
          return yield* Effect.fail(
            new SessionStartupError({
              message: 'bg_serve websocket is not connected.',
            }),
          );
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
