import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import { AppServer, AppServerLive } from './app-server';
import { ServerConfig, ServerConfigLive } from './config';
import { SqliteLive } from './persistence/sqlite';
import { writeServerLogLine } from './runtime-logging';
import { BayesgroveSocketLive } from './services/bayesgrove-socket';
import { DesktopEnvironmentServiceLive } from './services/desktop-environment';
import { GraphStateCacheLive } from './services/graph-state-cache';
import { ProcessSupervisorLive } from './services/process-supervisor';
import { RProcessServiceLive } from './services/r-process';
import { ServerEdgeLive } from './services/server-edge';
import { SessionStatusStoreLive } from './services/session-status';
import { WebSocketHubLive } from './services/websocket-hub';

const BaseLayer = Layer.mergeAll(
  ServerConfigLive,
  SessionStatusStoreLive,
  WebSocketHubLive,
  ProcessSupervisorLive,
);

const DesktopEnvironmentLayer = Layer.provide(DesktopEnvironmentServiceLive, BaseLayer);

const SqliteLayer = Layer.provide(SqliteLive, BaseLayer);
const CacheLayer = Layer.provide(GraphStateCacheLive, SqliteLayer);
const RProcessLayer = Layer.provide(RProcessServiceLive, Layer.mergeAll(BaseLayer, CacheLayer, DesktopEnvironmentLayer));
const SocketLayer = Layer.provide(BayesgroveSocketLive, BaseLayer);
const RouterLayer = Layer.provide(
  ServerEdgeLive,
  Layer.mergeAll(BaseLayer, CacheLayer, RProcessLayer, SocketLayer, DesktopEnvironmentLayer),
);
const RuntimeLayer = Layer.provide(AppServerLive, Layer.mergeAll(BaseLayer, RouterLayer));

const program = Effect.gen(function* () {
  const server = yield* AppServer;
  const config = yield* ServerConfig;
  const message = `Glade server listening at ${server.url}`;

  yield* Effect.tryPromise(() => writeServerLogLine(config.stateDir, message)).pipe(
    Effect.catchAll((error) => Effect.sync(() => {
      console.warn('Failed to write server startup log line.', {
        error,
        stateDir: config.stateDir,
        message,
      });
    })),
  );
  yield* Effect.sync(() => console.log(message));
  return yield* Effect.never;
});

NodeRuntime.runMain(
  Effect.scoped(Effect.provide(program, Layer.mergeAll(BaseLayer, DesktopEnvironmentLayer, RuntimeLayer))).pipe(Effect.orDie),
);
