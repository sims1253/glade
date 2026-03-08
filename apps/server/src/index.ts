import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import { AppServer, AppServerLive } from './app-server';
import { ServerConfigLive } from './config';
import { SqliteLive } from './persistence/sqlite';
import { BayesgroveSocketLive } from './services/bayesgrove-socket';
import { FrontendBroadcastLive } from './services/frontend-broadcast';
import { GraphStateCacheLive } from './services/graph-state-cache';
import { ProtocolRouterLive } from './services/protocol-router';
import { RProcessServiceLive } from './services/r-process';
import { SessionStatusStoreLive } from './services/session-status';

const BaseLayer = Layer.mergeAll(
  ServerConfigLive,
  SessionStatusStoreLive,
  FrontendBroadcastLive,
);

const SqliteLayer = Layer.provide(SqliteLive, BaseLayer);
const CacheLayer = Layer.provide(GraphStateCacheLive, SqliteLayer);
const RProcessLayer = Layer.provide(RProcessServiceLive, Layer.mergeAll(BaseLayer, CacheLayer));
const SocketLayer = Layer.provide(BayesgroveSocketLive, BaseLayer);
const RouterLayer = Layer.provide(
  ProtocolRouterLive,
  Layer.mergeAll(BaseLayer, CacheLayer, RProcessLayer, SocketLayer),
);
const RuntimeLayer = Layer.provide(AppServerLive, Layer.mergeAll(BaseLayer, RouterLayer));

const program = Effect.gen(function* () {
  const server = yield* AppServer;
  yield* Effect.sync(() => console.log(`Glade server listening at ${server.url}`));
  return yield* Effect.never;
});

NodeRuntime.runMain(Effect.scoped(Effect.provide(program, RuntimeLayer)).pipe(Effect.orDie));
