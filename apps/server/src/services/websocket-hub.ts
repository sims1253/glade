import type { WebSocket } from 'ws';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Ref from 'effect/Ref';

import type { ServerMessage } from '@glade/contracts';

export class WebSocketHub extends Context.Tag('glade/WebSocketHub')<
  WebSocketHub,
  {
    readonly add: (socket: WebSocket) => Effect.Effect<void>;
    readonly remove: (socket: WebSocket) => Effect.Effect<void>;
    readonly send: (socket: WebSocket, message: ServerMessage) => Effect.Effect<void>;
    readonly broadcast: (message: ServerMessage) => Effect.Effect<void>;
  }
>() {}

export const WebSocketHubLive = Layer.effect(
  WebSocketHub,
  Effect.gen(function* () {
    const sockets = yield* Ref.make(new Set<WebSocket>());
    const serialize = (message: ServerMessage) => JSON.stringify(message);

    return {
      add: (socket: WebSocket) => Ref.update(sockets, (current) => new Set(current).add(socket)),
      remove: (socket: WebSocket) =>
        Ref.update(sockets, (current) => {
          const next = new Set(current);
          next.delete(socket);
          return next;
        }),
      send: (socket: WebSocket, message: ServerMessage) =>
        Effect.sync(() => {
          if (socket.readyState === socket.OPEN) {
            socket.send(serialize(message));
          }
        }),
      broadcast: (message: ServerMessage) =>
        Effect.flatMap(Ref.get(sockets), (current) =>
          Effect.forEach(current, (socket) =>
            Effect.sync(() => {
              if (socket.readyState === socket.OPEN) {
                socket.send(serialize(message));
              }
            }),
          ).pipe(Effect.asVoid),
        ),
    };
  }),
);
