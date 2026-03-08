import type { SqliteDatabaseService } from './sqlite';

export function runCacheMigrations(database: Pick<SqliteDatabaseService, 'exec'>): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS snapshot_cache (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      snapshot_json TEXT NOT NULL,
      graph_version INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS protocol_events (
      event_id TEXT PRIMARY KEY,
      command_id TEXT,
      event_kind TEXT NOT NULL,
      source TEXT NOT NULL,
      emitted_at TEXT NOT NULL,
      graph_version INTEGER NOT NULL,
      event_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      label TEXT,
      status TEXT,
      scope TEXT,
      metadata_json TEXT,
      node_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      kind TEXT,
      metadata_json TEXT,
      edge_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS obligations (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      severity TEXT,
      scope TEXT NOT NULL,
      title TEXT,
      affected_node_ids_json TEXT NOT NULL,
      description TEXT,
      obligation_json TEXT NOT NULL,
      ordering_index INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS actions (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      scope TEXT NOT NULL,
      title TEXT,
      description TEXT,
      template_ref TEXT,
      payload_json TEXT,
      action_json TEXT NOT NULL,
      ordering_index INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS extension_registry (
      id TEXT PRIMARY KEY,
      extension_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS repl_buffer (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      line TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}
