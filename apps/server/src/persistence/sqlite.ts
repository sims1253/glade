import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import type { Database as BunDatabase } from 'bun:sqlite';
import type { DatabaseSync as NodeDatabaseSync } from 'node:sqlite';

import { ServerConfig } from '../config';
import { runCacheMigrations } from './migrations';

type UnknownParams = Array<unknown>;

export interface SqliteStatement {
  readonly run: (...params: UnknownParams) => void;
  readonly get: <TRow>(...params: UnknownParams) => TRow | null;
}

export interface SqliteDatabaseService {
  readonly exec: (sql: string) => void;
  readonly prepare: (sql: string) => SqliteStatement;
  readonly transaction: (callback: () => void) => () => void;
  readonly close: () => void;
}

export class SqliteDatabase extends Context.Tag('glade/SqliteDatabase')<
  SqliteDatabase,
  SqliteDatabaseService
>() {}

const require = createRequire(import.meta.url);

function wrapBunDatabase(database: BunDatabase): SqliteDatabaseService {
  return {
    exec: (sql) => database.exec(sql),
    prepare: (sql) => {
      const query = database.query(sql);
      return {
        run: (...params) => {
          query.run(...(params as Parameters<typeof query.run>));
        },
        get: <TRow>(...params: UnknownParams) =>
          (query.get(...(params as Parameters<typeof query.get>)) as TRow | null | undefined) ?? null,
      };
    },
    transaction: (callback) => database.transaction(callback),
    close: () => database.close(),
  };
}

function wrapNodeDatabase(database: NodeDatabaseSync): SqliteDatabaseService {
  return {
    exec: (sql) => database.exec(sql),
    prepare: (sql) => {
      const statement = database.prepare(sql);
      return {
        run: (...params) => {
          statement.run(...(params as Array<string | number | bigint | Uint8Array | null>));
        },
        get: <TRow>(...params: UnknownParams) =>
          (statement.get(...(params as Array<string | number | bigint | Uint8Array | null>)) as TRow | undefined) ?? null,
      };
    },
    transaction: (callback) => () => {
      database.exec('BEGIN');
      try {
        callback();
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => database.close(),
  };
}

const createDatabase = (filename: string) =>
  Effect.tryPromise({
    try: async () => {
      if (typeof process !== 'undefined' && typeof process.versions.bun === 'string') {
        const module = require('bun:sqlite') as { Database: new (path: string) => BunDatabase };
        return wrapBunDatabase(new module.Database(filename));
      }

      const module = (await import('node:sqlite')) as {
        DatabaseSync: new (path: string) => NodeDatabaseSync;
      };
      return wrapNodeDatabase(new module.DatabaseSync(filename));
    },
    catch: (cause) =>
      new Error(`Failed to initialize sqlite database for ${filename}: ${cause instanceof Error ? cause.message : String(cause)}`),
  });

const openDatabase = (filename: string) =>
  Effect.acquireRelease(
    Effect.gen(function* () {
      if (filename !== ':memory:') {
        yield* Effect.tryPromise(() => mkdir(path.dirname(filename), { recursive: true }));
      }

      const database = yield* createDatabase(filename);
      database.exec('PRAGMA journal_mode = WAL;');
      database.exec('PRAGMA foreign_keys = ON;');
      runCacheMigrations(database);
      return database;
    }),
    (database) => Effect.sync(() => database.close()).pipe(Effect.orDie),
  );

export const makeSqliteLayer = (filename: string) => Layer.scoped(SqliteDatabase, openDatabase(filename));

export const SqliteLive = Layer.scoped(
  SqliteDatabase,
  Effect.gen(function* () {
    const { stateDir } = yield* ServerConfig;
    return yield* openDatabase(path.join(stateDir, 'glade.sqlite'));
  }),
);
