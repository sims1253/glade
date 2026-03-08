import { beforeEach, describe, expect, it } from 'vitest';

import type { GraphSnapshot, ProtocolEvent } from '@glade/contracts';

import { useGraphStore } from './graph';

const snapshot: GraphSnapshot = {
  protocol_version: '0.1.0',
  message_type: 'GraphSnapshot',
  emitted_at: new Date().toISOString(),
  project_id: 'proj_graph',
  project_name: 'graph-test',
  graph: {
    version: 1,
    registry: {
      kinds: {
        data_source: { name: 'data_source', input_contract: [], output_type: 'data.frame' },
        fit: { name: 'fit', input_contract: ['data.frame'], output_type: 'fit' },
      },
    },
    nodes: {
      source: { id: 'source', kind: 'data_source', label: 'Source', status: 'ok', block_reason: 'none' },
      fit: { id: 'fit', kind: 'fit', label: 'Fit', status: 'warning', block_reason: 'pending_input' },
    },
    edges: {
      edge_1: { id: 'edge_1', from: 'source', to: 'fit', type: 'data' },
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
      n_actions: 0,
      n_blocking: 0,
      scopes: ['project'],
    },
    project: {
      scope: 'project',
      scope_label: 'Project',
      obligations: {
        review_fit: {
          obligation_id: 'review_fit',
          kind: 'review',
          scope: 'project',
          severity: 'warning',
          title: 'Review fit',
          basis: { node_ids: ['fit'] },
        },
      },
      actions: {},
    },
  },
};

const event: ProtocolEvent = {
  protocol_version: '0.1.0',
  message_type: 'ProtocolEvent',
  event_id: 'evt_1',
  event_kind: 'node_updated',
  command_id: 'cmd_1',
  source: 'bayesgrove',
  emitted_at: new Date().toISOString(),
  graph_version: 2,
  status: {
    workflow_state: 'open',
    runnable_nodes: 1,
    blocked_nodes: 0,
    pending_gates: 0,
    active_jobs: 0,
    health: 'ok',
    messages: ['updated'],
  },
};

describe('useGraphStore', () => {
  beforeEach(() => {
    useGraphStore.getState().clear();
  });

  it('hydrates workflow graph state from snapshots', () => {
    useGraphStore.getState().applySnapshot(snapshot);
    const graph = useGraphStore.getState().graph;

    expect(graph?.projectId).toBe('proj_graph');
    expect(graph?.nodes).toHaveLength(2);
    expect(graph?.edges).toHaveLength(1);
    expect(graph?.nodeKinds).toHaveLength(2);
    expect(graph?.obligationsByNodeId.fit).toHaveLength(1);
  });

  it('records the latest protocol event incrementally', () => {
    useGraphStore.getState().applyProtocolEvent(event);
    expect(useGraphStore.getState().lastProtocolEvent?.event_id).toBe('evt_1');
  });
});
