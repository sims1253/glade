import path from 'node:path';

import { Schema } from 'effect';
import * as Context from 'effect/Context';
import * as Layer from 'effect/Layer';

import { DEFAULT_SERVER_PORT } from '@glade/shared';
import { version } from '../package.json' with { type: 'json' };

const ServerConfigSchema = Schema.Struct({
  host: Schema.String,
  nodeEnv: Schema.Literal('development', 'production'),
  port: Schema.Number,
  rootDir: Schema.String,
  version: Schema.String,
  viteDevServerUrl: Schema.NullOr(Schema.String),
});

export type ServerConfigShape = Schema.Schema.Type<typeof ServerConfigSchema>;

export class ServerConfig extends Context.Tag('glade/ServerConfig')<
  ServerConfig,
  ServerConfigShape
>() {}

export const ServerConfigLive = Layer.sync(ServerConfig, () =>
  Schema.decodeUnknownSync(ServerConfigSchema)({
    host: process.env.BAYESGROVE_SERVER_HOST?.trim() || '127.0.0.1',
    nodeEnv: process.env.NODE_ENV === 'development' ? 'development' : 'production',
    port: Number(process.env.BAYESGROVE_SERVER_PORT ?? DEFAULT_SERVER_PORT),
    rootDir: process.env.BAYESGROVE_APP_ROOT?.trim() || path.resolve(import.meta.dirname, '../../..'),
    version,
    viteDevServerUrl: process.env.VITE_DEV_SERVER_URL?.trim() || null,
  }),
);
