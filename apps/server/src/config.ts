import path from 'node:path';

import { Schema } from 'effect';
import * as Context from 'effect/Context';
import * as Layer from 'effect/Layer';

import { DEFAULT_SERVER_PORT } from '@glade/shared';
import { version } from '../package.json' with { type: 'json' };

const RuntimeSchema = Schema.Literal('desktop', 'server');

const ServerConfigSchema = Schema.Struct({
  host: Schema.String,
  nodeEnv: Schema.Literal('development', 'production'),
  port: Schema.Number,
  rootDir: Schema.String,
  stateDir: Schema.String,
  version: Schema.String,
  viteDevServerUrl: Schema.NullOr(Schema.String),
  projectPath: Schema.NullOr(Schema.String),
  runtime: RuntimeSchema,
  hostedMode: Schema.Boolean,
  editorCommand: Schema.String,
  rExecutable: Schema.String,
  rHost: Schema.String,
  rPort: Schema.Number,
  rPollInterval: Schema.Number,
  replReplayLimit: Schema.Number,
});

export type ServerConfigShape = Schema.Schema.Type<typeof ServerConfigSchema>;

export class ServerConfig extends Context.Tag('glade/ServerConfig')<
  ServerConfig,
  ServerConfigShape
>() {}

export const ServerConfigLive = Layer.sync(ServerConfig, () => {
  const rootDir = process.env.BAYESGROVE_APP_ROOT?.trim() || path.resolve(import.meta.dirname, '../../..');
  const runtime = process.env.BAYESGROVE_RUNTIME === 'desktop' ? 'desktop' : 'server';
  const projectPath = process.env.BAYESGROVE_PROJECT_PATH?.trim() || null;

  return Schema.decodeUnknownSync(ServerConfigSchema)({
    host: process.env.BAYESGROVE_SERVER_HOST?.trim() || '127.0.0.1',
    nodeEnv: process.env.NODE_ENV === 'development' ? 'development' : 'production',
    port: Number(process.env.BAYESGROVE_SERVER_PORT ?? DEFAULT_SERVER_PORT),
    rootDir,
    stateDir: process.env.BAYESGROVE_STATE_DIR?.trim() || path.join(rootDir, '.glade'),
    version,
    viteDevServerUrl: process.env.VITE_DEV_SERVER_URL?.trim() || null,
    projectPath,
    runtime,
    hostedMode: runtime !== 'desktop',
    editorCommand: process.env.BAYESGROVE_EDITOR?.trim() || process.env.EDITOR?.trim() || 'code',
    rExecutable: process.env.BAYESGROVE_R_PATH?.trim() || 'Rscript',
    rHost: process.env.BAYESGROVE_R_HOST?.trim() || '127.0.0.1',
    rPort: Number(process.env.BAYESGROVE_R_PORT ?? Number(process.env.BAYESGROVE_SERVER_PORT ?? DEFAULT_SERVER_PORT) + 10),
    rPollInterval: Number(process.env.BAYESGROVE_R_POLL_INTERVAL ?? 0.2),
    replReplayLimit: Number(process.env.BAYESGROVE_REPL_REPLAY_LIMIT ?? 500),
  });
});
