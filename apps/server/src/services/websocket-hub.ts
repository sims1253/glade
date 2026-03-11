import type { WebSocket } from 'ws';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Ref from 'effect/Ref';

import type { WebSocketResponse, WsPush } from '@glade/contracts';

type OutboundMessage = WebSocketResponse | WsPush;
type ReplayableChannel = Extract<WsPush['channel'], 'desktop.environment' | 'session.status' | 'workflow.snapshot'>;

const REPLAYABLE_CHANNELS: ReadonlyArray<ReplayableChannel> = [
  'session.status',
  'desktop.environment',
  'workflow.snapshot',
];

export class WebSocketHub extends Context.Tag('glade/WebSocketHub')<
  WebSocketHub,
  {
    readonly add: (socket: WebSocket) => Effect.Effect<void>;
    readonly remove: (socket: WebSocket) => Effect.Effect<void>;
    readonly send: (socket: WebSocket, message: OutboundMessage) => Effect.Effect<boolean>;
    readonly broadcast: (message: OutboundMessage) => Effect.Effect<void>;
    readonly replayLatest: (socket: WebSocket) => Effect.Effect<void>;
  }
>() {}

export const WebSocketHubLive = Layer.effect(
  WebSocketHub,
  Effect.gen(function* () {
    const sockets = yield* Ref.make(new Set<WebSocket>());
    const latestPushes = yield* Ref.make(new Map<ReplayableChannel, WsPush>());
    const serialize = (message: OutboundMessage) => JSON.stringify(message);
    const rememberLatestPush = (message: OutboundMessage) => {
      if (
        message._tag !== 'WsPush'
        || !REPLAYABLE_CHANNELS.includes(message.channel as ReplayableChannel)
      ) {
        return Effect.void;
      }

      return Ref.update(
        latestPushes,
        (current) => new Map(current).set(message.channel as ReplayableChannel, message),
      );
    };

    const sendSerialized = (socket: WebSocket, payload: string) =>
      Effect.sync(() => {
        if (socket.readyState !== socket.OPEN) {
          return false;
        }

        try {
          socket.send(payload);
          return true;
        } catch {
          return false;
        }
      });

    return {
      add: (socket: WebSocket) => Ref.update(sockets, (current) => new Set(current).add(socket)),
      remove: (socket: WebSocket) =>
        Ref.update(sockets, (current) => {
          const next = new Set(current);
          next.delete(socket);
          return next;
        }),
      send: (socket: WebSocket, message: OutboundMessage) =>
        rememberLatestPush(message).pipe(Effect.zipRight(sendSerialized(socket, serialize(message)))),
      broadcast: (message: OutboundMessage) =>
        rememberLatestPush(message).pipe(
          Effect.zipRight(Ref.get(sockets)),
          Effect.flatMap((current) =>
            Effect.forEach(current, (socket) => sendSerialized(socket, serialize(message))).pipe(Effect.asVoid),
          ),
        ),
      replayLatest: (socket: WebSocket) =>
        Effect.flatMap(Ref.get(latestPushes), (current) =>
          Effect.forEach(REPLAYABLE_CHANNELS, (channel) => {
            const message = current.get(channel);
            return message ? sendSerialized(socket, serialize(message)).pipe(Effect.asVoid) : Effect.void;
          }).pipe(Effect.asVoid),
        ),
    };
  }),
);
