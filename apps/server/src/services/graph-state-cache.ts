import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';

import type { GraphSnapshot, ProtocolEvent } from '@glade/contracts';

import { SqliteDatabase } from '../persistence/sqlite';

type JsonObject = Record<string, unknown>;

export class GraphStateCache extends Context.Tag('glade/GraphStateCache')<
  GraphStateCache,
  {
    readonly clear: Effect.Effect<void>;
    readonly getSnapshot: Effect.Effect<Option.Option<GraphSnapshot>>;
    readonly getReplLines: (limit?: number) => Effect.Effect<ReadonlyArray<string>>;
    readonly writeSnapshot: (snapshot: GraphSnapshot) => Effect.Effect<void>;
    readonly writeProtocolEvent: (event: ProtocolEvent) => Effect.Effect<void>;
    readonly appendReplLine: (line: string) => Effect.Effect<void>;
  }
>() {}

const asObject = (value: unknown): JsonObject | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const asArray = (value: unknown): Array<unknown> => (Array.isArray(value) ? value : []);

function isDatabaseClosedError(error: Error) {
  const message = error.message.toLowerCase();
  return message.includes('database has closed') || message.includes('database is closed');
}

const graphVersionOf = (snapshot: GraphSnapshot): number => {
  const graph = asObject(snapshot.graph);
  const version = graph?.version;
  return typeof version === 'number' ? version : 0;
};

const extractNodes = (snapshot: GraphSnapshot) => {
  const graph = asObject(snapshot.graph);
  const nodes = asObject(graph?.nodes);
  if (!nodes) return [];

  return Object.entries(nodes)
    .map(([id, value]) => {
      const node = asObject(value);
      if (!node) return null;
      return {
        id,
        kind: asString(node.kind) ?? 'unknown',
        label: asString(node.label),
        status: asString(node.state),
        scope: asString(node.scope),
        metadataJson: JSON.stringify(node.metadata ?? null),
        nodeJson: JSON.stringify(node),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
};

const extractEdges = (snapshot: GraphSnapshot) => {
  const graph = asObject(snapshot.graph);
  const edges = asObject(graph?.edges);
  if (!edges) return [];

  return Object.entries(edges)
    .map(([id, value]) => {
      const edge = asObject(value);
      if (!edge) return null;
      const fromId = asString(edge.from);
      const toId = asString(edge.to);
      if (!fromId || !toId) return null;
      return {
        id,
        fromId,
        toId,
        kind: asString(edge.type),
        metadataJson: JSON.stringify(edge.metadata ?? null),
        edgeJson: JSON.stringify(edge),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
};

const extractObligations = (snapshot: GraphSnapshot) => {
  const protocol = asObject(snapshot.protocol);
  if (!protocol) return [];

  let ordering = 0;
  const rows: Array<{
    id: string;
    kind: string;
    severity: string | null;
    scope: string;
    title: string | null;
    affectedNodeIdsJson: string;
    description: string | null;
    obligationJson: string;
    orderingIndex: number;
  }> = [];

  for (const [scopeKey, partitionValue] of Object.entries(protocol)) {
    if (scopeKey === 'summary') continue;
    const partition = asObject(partitionValue);
    const obligations = asObject(partition?.obligations);
    if (!obligations) continue;

    for (const [obligationKey, obligationValue] of Object.entries(obligations)) {
      const obligation = asObject(obligationValue);
      if (!obligation) continue;
      const basis = asObject(obligation.basis);
      const nodeIds = asArray(basis?.node_ids).filter((value): value is string => typeof value === 'string');
      const explanation = asObject(obligation.explanation);
      rows.push({
        id: asString(obligation.obligation_id) ?? obligationKey,
        kind: asString(obligation.kind) ?? 'unknown',
        severity: asString(obligation.severity),
        scope: asString(obligation.scope) ?? scopeKey,
        title: asString(obligation.title),
        affectedNodeIdsJson: JSON.stringify(nodeIds),
        description: asString(explanation?.why_now) ?? asString(explanation?.why),
        obligationJson: JSON.stringify(obligation),
        orderingIndex: ordering,
      });
      ordering += 1;
    }
  }

  return rows;
};

const extractActions = (snapshot: GraphSnapshot) => {
  const protocol = asObject(snapshot.protocol);
  if (!protocol) return [];

  let ordering = 0;
  const rows: Array<{
    id: string;
    kind: string;
    scope: string;
    title: string | null;
    description: string | null;
    templateRef: string | null;
    payloadJson: string;
    actionJson: string;
    orderingIndex: number;
  }> = [];

  for (const [scopeKey, partitionValue] of Object.entries(protocol)) {
    if (scopeKey === 'summary') continue;
    const partition = asObject(partitionValue);
    const actions = asObject(partition?.actions);
    if (!actions) continue;

    for (const [actionKey, actionValue] of Object.entries(actions)) {
      const action = asObject(actionValue);
      if (!action) continue;
      const payload = asObject(action.payload);
      const explanation = asObject(action.explanation);
      rows.push({
        id: asString(action.action_id) ?? actionKey,
        kind: asString(action.kind) ?? 'unknown',
        scope: asString(action.scope) ?? scopeKey,
        title: asString(action.title),
        description: asString(explanation?.why_now),
        templateRef: asString(payload?.template_ref),
        payloadJson: JSON.stringify(action.payload ?? null),
        actionJson: JSON.stringify(action),
        orderingIndex: ordering,
      });
      ordering += 1;
    }
  }

  return rows;
};

export const GraphStateCacheLive = Layer.effect(
  GraphStateCache,
  Effect.gen(function* () {
    const database = yield* SqliteDatabase;

    const selectSnapshot = database.prepare('SELECT snapshot_json FROM snapshot_cache WHERE id = 1');
    const selectReplLines = database.prepare(`
      SELECT line
      FROM repl_buffer
      ORDER BY sequence DESC
      LIMIT ?
    `);
    const replaceSnapshot = database.prepare(`
      INSERT INTO snapshot_cache (id, snapshot_json, graph_version, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        snapshot_json = excluded.snapshot_json,
        graph_version = excluded.graph_version,
        updated_at = excluded.updated_at
    `);
    const insertNode = database.prepare(`
      INSERT INTO nodes (id, kind, label, status, scope, metadata_json, node_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertEdge = database.prepare(`
      INSERT INTO edges (id, from_id, to_id, kind, metadata_json, edge_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertObligation = database.prepare(`
      INSERT INTO obligations (id, kind, severity, scope, title, affected_node_ids_json, description, obligation_json, ordering_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertAction = database.prepare(`
      INSERT INTO actions (id, kind, scope, title, description, template_ref, payload_json, action_json, ordering_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertProtocolEvent = database.prepare(`
      INSERT OR REPLACE INTO protocol_events (event_id, command_id, event_kind, source, emitted_at, graph_version, event_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertReplLine = database.prepare(`
      INSERT INTO repl_buffer (line, created_at)
      VALUES (?, ?)
    `);

    const clearTables = () => {
      database.exec(`
        DELETE FROM snapshot_cache;
        DELETE FROM protocol_events;
        DELETE FROM nodes;
        DELETE FROM edges;
        DELETE FROM obligations;
        DELETE FROM actions;
        DELETE FROM extension_registry;
        DELETE FROM repl_buffer;
      `);
    };

    const resetGraphTables = () => {
      database.exec(`
        DELETE FROM nodes;
        DELETE FROM edges;
        DELETE FROM obligations;
        DELETE FROM actions;
        DELETE FROM extension_registry;
      `);
    };

    const clear = Effect.sync(() => {
      database.transaction(() => clearTables())();
    }).pipe(Effect.orDie);

    const getSnapshot = Effect.sync(() => {
      const row = selectSnapshot.get() as { snapshot_json: string } | null;
      if (!row) {
        return Option.none<GraphSnapshot>();
      }
      return Option.some(JSON.parse(row.snapshot_json) as GraphSnapshot);
    }).pipe(Effect.orDie);

    const getReplLines = (limit = 500) =>
      Effect.sync(() =>
        selectReplLines
          .all<{ line: string }>(Math.max(0, Math.trunc(limit)))
          .map((row) => row.line)
          .reverse(),
      ).pipe(Effect.orDie);

    const writeSnapshot = (snapshot: GraphSnapshot) =>
      Effect.sync(() => {
        database.transaction(() => {
          resetGraphTables();
          replaceSnapshot.run(1, JSON.stringify(snapshot), graphVersionOf(snapshot), snapshot.emitted_at);

          for (const node of extractNodes(snapshot)) {
            insertNode.run(
              node.id,
              node.kind,
              node.label,
              node.status,
              node.scope,
              node.metadataJson,
              node.nodeJson,
            );
          }

          for (const edge of extractEdges(snapshot)) {
            insertEdge.run(
              edge.id,
              edge.fromId,
              edge.toId,
              edge.kind,
              edge.metadataJson,
              edge.edgeJson,
            );
          }

          for (const obligation of extractObligations(snapshot)) {
            insertObligation.run(
              obligation.id,
              obligation.kind,
              obligation.severity,
              obligation.scope,
              obligation.title,
              obligation.affectedNodeIdsJson,
              obligation.description,
              obligation.obligationJson,
              obligation.orderingIndex,
            );
          }

          for (const action of extractActions(snapshot)) {
            insertAction.run(
              action.id,
              action.kind,
              action.scope,
              action.title,
              action.description,
              action.templateRef,
              action.payloadJson,
              action.actionJson,
              action.orderingIndex,
            );
          }
        })();
      }).pipe(Effect.orDie);

    const writeProtocolEvent = (event: ProtocolEvent) =>
      Effect.sync(() => {
        insertProtocolEvent.run(
          event.event_id,
          event.command_id ?? null,
          event.event_kind,
          event.source,
          event.emitted_at,
          event.graph_version,
          JSON.stringify(event),
        );
      }).pipe(Effect.orDie);

    const appendReplLine = (line: string) =>
      Effect.try({
        try: () => {
          database.transaction(() => {
            insertReplLine.run(line, new Date().toISOString());
            database.exec(`
              DELETE FROM repl_buffer
              WHERE sequence NOT IN (
                SELECT sequence FROM repl_buffer ORDER BY sequence DESC LIMIT 500
              )
            `);
          })();
        },
        catch: (error) => error instanceof Error ? error : new Error(String(error)),
      }).pipe(
        Effect.catchIf(isDatabaseClosedError, () => Effect.void),
        Effect.orDie,
      );

    return {
      clear,
      getSnapshot,
      getReplLines,
      writeSnapshot,
      writeProtocolEvent,
      appendReplLine,
    };
  }),
);
