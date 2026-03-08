import { describe, expect, it } from 'vitest';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';

import type { GraphSnapshot } from '@glade/contracts';

import { makeSqliteLayer } from '../src/persistence/sqlite';
import { GraphStateCache, GraphStateCacheLive } from '../src/services/graph-state-cache';

const sampleSnapshot: GraphSnapshot = {
  protocol_version: '0.1.0',
  message_type: 'GraphSnapshot',
  emitted_at: new Date().toISOString(),
  project_id: 'proj_cache',
  project_name: 'cache-probe',
  graph: {
    version: 2,
    nodes: {
      node_a: { id: 'node_a', kind: 'source', label: 'Source', metadata: { phase: 2 }, state: 'new' },
      node_b: { id: 'node_b', kind: 'fit', label: 'Fit', metadata: {}, state: 'new' },
    },
    edges: {
      edge_a: { id: 'edge_a', from: 'node_a', to: 'node_b', type: 'data', metadata: {} },
    },
  },
  status: {
    workflow_state: 'open',
    runnable_nodes: 1,
    blocked_nodes: 0,
    pending_gates: 0,
    active_jobs: 0,
    health: 'ok',
    messages: ['ready'],
  },
  pending_gates: {},
  branches: {},
  branch_goals: {},
  protocol: {
    summary: {
      n_scopes: 1,
      n_obligations: 1,
      n_actions: 1,
      n_blocking: 0,
      scopes: ['project'],
    },
    project: {
      scope: 'project',
      scope_label: 'Project',
      obligations: {
        obl_a: {
          obligation_id: 'obl_a',
          kind: 'review',
          scope: 'project',
          severity: 'warning',
          title: 'Review fit',
          basis: { node_ids: ['node_b'] },
        },
      },
      actions: {
        act_a: {
          action_id: 'act_a',
          kind: 'record_decision',
          scope: 'project',
          title: 'Record decision',
          basis: { node_ids: ['node_b'] },
          payload: { template_ref: 'demo-template' },
        },
      },
    },
  },
};

const layer = GraphStateCacheLive.pipe(Layer.provideMerge(makeSqliteLayer(':memory:')));

describe('GraphStateCache', () => {
  it('writes and reloads snapshots from sqlite cache', async () => {
    const snapshot = await Effect.runPromise(
      Effect.gen(function* () {
        const cache = yield* GraphStateCache;
        yield* cache.writeSnapshot(sampleSnapshot);
        return yield* cache.getSnapshot;
      }).pipe(Effect.provide(layer)),
    );

    expect(Option.isSome(snapshot)).toBe(true);
    if (Option.isSome(snapshot)) {
      expect(snapshot.value.project_id).toBe('proj_cache');
      expect(snapshot.value.graph).toEqual(sampleSnapshot.graph);
    }
  });

  it('keeps a bounded REPL replay buffer in insertion order', async () => {
    const lines = await Effect.runPromise(
      Effect.gen(function* () {
        const cache = yield* GraphStateCache;
        for (let index = 1; index <= 505; index += 1) {
          yield* cache.appendReplLine(`line ${index}`);
        }
        return yield* cache.getReplLines();
      }).pipe(Effect.provide(layer)),
    );

    expect(lines).toHaveLength(500);
    expect(lines[0]).toBe('line 6');
    expect(lines.at(-1)).toBe('line 505');
  });
});
