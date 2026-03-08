import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import { AppServer, AppServerLive } from './app-server';
import { ServerConfigLive } from './config';
import { SessionStatusStoreLive } from './services/session-status';
import { WebSocketHubLive } from './services/websocket-hub';

const ServerRuntimeLayer = Layer.mergeAll(
  ServerConfigLive,
  SessionStatusStoreLive,
  WebSocketHubLive,
);

const RuntimeLayer = AppServerLive.pipe(Layer.provideMerge(ServerRuntimeLayer));

const program = Effect.gen(function* () {
  const server = yield* AppServer;
  yield* Effect.sync(() => console.log(`Glade server listening at ${server.url}`));
  return yield* Effect.never;
}).pipe(Effect.provide(RuntimeLayer));

NodeRuntime.runMain(program);
