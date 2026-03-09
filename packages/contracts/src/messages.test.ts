import * as Effect from 'effect/Effect';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { decodeExtensionDescriptor, decodeGraphSnapshot } from './decode';
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

    roundTrip(CommandEnvelope, {
      id: 'cmd-4',
      command: { type: 'ExecuteNode', nodeId: 'node_1', confirmNonLocalExecution: true },
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
              runtime: 'uvx',
              command: 'elicito',
              args_template: ['--input', '{input_json_path}', '--output', '{output_json_path}'],
              input_serializer: 'json_file',
              output_parser: 'json_file',
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

  it('decodes extension registry descriptors into canonical snake_case fields', async () => {
    const snapshot = await Effect.runPromise(decodeGraphSnapshot({
      protocol_version: '0.1.0',
      message_type: 'GraphSnapshot',
      emitted_at: '2026-03-09T10:00:00.000Z',
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
      extension_registry: {
        test_extension: {
          name: 'test.extension',
          library_path: '/tmp/test.extension',
          node_types: {
            posterior_summary: {
              name: 'posterior_summary',
              runtime: 'r',
              title: 'Posterior summary',
            },
          },
          domain_packs: {
            reporting: {
              title: 'Reporting',
            },
          },
        },
      },
    }));

    expect(snapshot.extension_registry).toEqual([
      {
        id: 'test.extension',
        name: 'test.extension',
        package_name: 'test.extension',
        library_path: '/tmp/test.extension',
        gui_bundle_path: '/tmp/test.extension/inst/gui/index.js',
        node_types: [
          {
            kind: 'posterior_summary',
            name: 'posterior_summary',
            runtime: 'r_session',
            title: 'Posterior summary',
          },
        ],
        domain_packs: [
          {
            title: 'Reporting',
          },
        ],
      },
    ]);
  });

  it('ignores extensionRegistry when extension_registry is absent', async () => {
    const snapshot = await Effect.runPromise(decodeGraphSnapshot({
      protocol_version: '0.1.0',
      message_type: 'GraphSnapshot',
      emitted_at: '2026-03-09T10:00:00.000Z',
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
      extensionRegistry: [],
    }));

    expect(snapshot.extension_registry).toBeUndefined();
  });

  it('accepts an explicit fallback index when decoding a single extension descriptor', async () => {
    const descriptor = await Effect.runPromise(decodeExtensionDescriptor({
      node_types: [
        {
          kind: 'posterior_summary',
        },
      ],
    }, 7));

    expect(descriptor.id).toBe('extension:7');
    expect(descriptor.package_name).toBe('extension:7');
  });

  it('normalizes phase 9 multi-runtime descriptor fields', async () => {
    const descriptor = await Effect.runPromise(decodeExtensionDescriptor({
      package_name: 'elicito.node.pack',
      node_types: [
        {
          kind: 'prior_elicitation',
          runtime: 'uvx',
          command: 'elicito',
          args_template: ['--input', '{input_json_path}', '--output', '{output_json_path}'],
          input_serializer: 'json_file',
          output_parser: 'json_file',
        },
      ],
    }));

    expect(descriptor.node_types).toEqual([
      expect.objectContaining({
        kind: 'prior_elicitation',
        runtime: 'uvx',
        command: 'elicito',
        args_template: ['--input', '{input_json_path}', '--output', '{output_json_path}'],
        input_serializer: 'json_file',
        output_parser: 'json_file',
      }),
    ]);
  });
});
