import path from 'node:path';

import { Schema } from 'effect';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import { DEFAULT_SERVER_PORT } from '@glade/shared';
import { readBootstrapEnvelope, type BootstrapEnvelope } from './bootstrap';
import { version } from '../package.json' with { type: 'json' };

const ServerConfigSchema = Schema.Struct({
  host: Schema.String,
  nodeEnv: Schema.Literal('development', 'production'),
  port: Schema.Number,
  rootDir: Schema.String,
  stateDir: Schema.String,
  version: Schema.String,
  viteDevServerUrl: Schema.NullOr(Schema.String),
  projectPath: Schema.NullOr(Schema.String),
  editorCommand: Schema.String,
  rExecutable: Schema.String,
  rHost: Schema.String,
  rPort: Schema.Number,
  rPollInterval: Schema.Number,
  replReplayLimit: Schema.Number,
  toolExecutionTimeoutMs: Schema.Number,
  authToken: Schema.NullOr(Schema.String),
});

export type ServerConfigShape = Schema.Schema.Type<typeof ServerConfigSchema>;

export class ServerConfig extends Context.Tag('glade/ServerConfig')<
  ServerConfig,
  ServerConfigShape
>() {}

function readBootstrapFd(): number | null {
  const raw = process.env.BAYESGROVE_BOOTSTRAP_FD?.trim();
  if (!raw) return null;
  const fd = Number(raw);
  return Number.isFinite(fd) && fd >= 0 ? fd : null;
}

export const ServerConfigLive = Layer.effect(
  ServerConfig,
  Effect.gen(function* () {
    const rootDir = process.env.BAYESGROVE_APP_ROOT?.trim() || path.resolve(import.meta.dirname, '../../..');
    const nodeEnv = process.env.NODE_ENV === 'development' ? 'development' : 'production';

    let bootstrap: BootstrapEnvelope | null = null;
    const fd = readBootstrapFd();
    if (fd !== null) {
      bootstrap = yield* readBootstrapEnvelope(fd);
    }

    const projectPath = nodeEnv === 'development'
      ? (bootstrap?.projectPath?.trim() || null)
      : (process.env.BAYESGROVE_PROJECT_PATH?.trim() || bootstrap?.projectPath?.trim() || null);

    return Schema.decodeUnknownSync(ServerConfigSchema)({
      host: bootstrap?.host?.trim() || process.env.BAYESGROVE_SERVER_HOST?.trim() || '127.0.0.1',
      nodeEnv,
      port: bootstrap?.port ?? Number(process.env.BAYESGROVE_SERVER_PORT ?? DEFAULT_SERVER_PORT),
      rootDir,
      stateDir: process.env.BAYESGROVE_STATE_DIR?.trim() || path.join(rootDir, '.glade'),
      version,
      viteDevServerUrl: process.env.VITE_DEV_SERVER_URL?.trim() || null,
      projectPath,
      editorCommand: process.env.BAYESGROVE_EDITOR?.trim() || process.env.EDITOR?.trim() || 'code',
      rExecutable: process.env.BAYESGROVE_R_PATH?.trim() || 'Rscript',
      rHost: process.env.BAYESGROVE_R_HOST?.trim() || '127.0.0.1',
      rPort: Number(process.env.BAYESGROVE_R_PORT ?? Number(process.env.BAYESGROVE_SERVER_PORT ?? DEFAULT_SERVER_PORT) + 10),
      rPollInterval: Number(process.env.BAYESGROVE_R_POLL_INTERVAL ?? 0.2),
      replReplayLimit: Number(process.env.BAYESGROVE_REPL_REPLAY_LIMIT ?? 500),
      toolExecutionTimeoutMs: Number(process.env.BAYESGROVE_TOOL_TIMEOUT_MS ?? 30_000),
      authToken: bootstrap?.authToken?.trim() || process.env.BAYESGROVE_AUTH_TOKEN?.trim() || null,
    });
  }),
);
