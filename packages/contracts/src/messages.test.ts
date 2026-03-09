import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  BayesgroveCommand,
  CommandEnvelope,
  GraphSnapshot,
  HealthResponse,
  ServerMessage,
} from './messages';

function roundTrip<TSchema extends Schema.Schema.AnyNoContext>(
  schema: TSchema,
  value: Schema.Schema.Type<TSchema>,
) {
  const encoded = Schema.encodeSync(schema)(value);
  expect(Schema.decodeUnknownSync(schema)(encoded)).toEqual(value);
}

describe('contracts', () => {
  it('round-trips health responses', () => {
    roundTrip(HealthResponse, { status: 'ok', version: '0.2.0' });
  });

  it('round-trips bayesgrove command payloads', () => {
    roundTrip(BayesgroveCommand, {
      protocol_version: '0.1.0',
      message_type: 'Command',
      command_id: 'cmd.add',
      command: 'bg_add_node',
      args: { kind: 'source', label: 'Source' },
    });
  });

  it('round-trips frontend command envelopes', () => {
    roundTrip(CommandEnvelope, {
      id: 'cmd-1',
      command: { type: 'RenameNode', nodeId: 'node_1', label: 'Renamed' },
    });

    roundTrip(CommandEnvelope, {
      id: 'cmd-2',
      command: { type: 'ReplInput', data: '1 + 1\n' },
    });

    roundTrip(CommandEnvelope, {
      id: 'cmd-3',
      command: { type: 'UpdateNodeParameters', nodeId: 'node_1', params: { iterations: 4 } },
    });
  });

  it('round-trips graph snapshots with protocol partitions', () => {
    roundTrip(GraphSnapshot, {
      protocol_version: '0.1.0',
      message_type: 'GraphSnapshot',
      emitted_at: new Date().toISOString(),
      project_id: 'proj_1',
      project_name: 'demo',
      graph: { version: 1, nodes: {}, edges: {} },
      status: {
        workflow_state: 'open',
        runnable_nodes: 0,
        blocked_nodes: 0,
        pending_gates: 0,
        active_jobs: 0,
        health: 'ok',
        messages: ['ready'],
      },
      pending_gates: {},
      branches: {},
      branch_goals: {},
      extension_registry: [
        {
          id: 'pkg:test-extension',
          package_name: 'test.extension',
          version: '0.1.0',
          browser_bundle_path: '/extension-bundles/test-extension.js',
          node_types: [
            {
              kind: 'posterior_summary',
              title: 'Posterior summary',
              description: 'Summarize posterior draws.',
              parameter_schema: {
                type: 'object',
                properties: {
                  draws: { type: 'number' },
                },
              },
            },
          ],
          domain_packs: [],
        },
      ],
      protocol: {
        summary: {
          n_scopes: 1,
          n_obligations: 0,
          n_actions: 0,
          n_blocking: 0,
          scopes: ['project'],
        },
        project: {
          scope: 'project',
          scope_label: 'Project',
          obligations: {},
          actions: {},
        },
      },
    });
  });

  it('round-trips server message unions', () => {
    roundTrip(ServerMessage, {
      type: 'SessionStatus',
      state: 'connecting',
    });
  });
});
