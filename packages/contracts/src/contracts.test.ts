import * as Effect from 'effect/Effect';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  decodeExtensionDescriptor,
  decodeGraphSnapshot,
  decodeRpcError,
  decodeServerBootstrap,
  decodeWebSocketRequest,
  decodeWebSocketResponse,
  decodeWsPush,
} from './decode';
import {
  AckResult,
  BayesgroveCommand,
  DesktopEnvironmentState,
  GraphSnapshot,
  HealthResponse,
  RpcError,
  ServerBootstrap,
  SystemInfoResult,
  WebSocketRequest,
  WebSocketResponse,
  WsPush,
} from './index';

const desktopEnvironment: DesktopEnvironmentState = {
  settings: {
    rExecutablePath: '/usr/bin/Rscript',
    editorCommand: 'auto',
    updateChannel: 'stable',
  },
  preflight: {
    checkedAt: '2026-03-09T10:00:00.000Z',
    projectPath: '/tmp/project',
    status: 'ok',
    issues: [],
  },
};

function roundTrip<TSchema extends Schema.Schema.AnyNoContext>(
  schema: TSchema,
  value: Schema.Schema.Type<TSchema>,
) {
  const encoded = Schema.encodeSync(schema)(value);
  expect(Schema.decodeUnknownSync(schema)(encoded)).toEqual(value);
}

const snapshot: GraphSnapshot = {
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
};

const requestFixtures: ReadonlyArray<Schema.Schema.Type<typeof WebSocketRequest>> = [
  {
    _tag: 'WebSocketRequest',
    id: 'req-0',
    method: 'desktop.getEnvironment',
    body: { _tag: 'desktop.getEnvironment' },
  },
  {
    _tag: 'WebSocketRequest',
    id: 'req-0b',
    method: 'desktop.refreshEnvironment',
    body: { _tag: 'desktop.refreshEnvironment' },
  },
  {
    _tag: 'WebSocketRequest',
    id: 'req-0c',
    method: 'desktop.saveSettings',
    body: {
      _tag: 'desktop.saveSettings',
      settings: desktopEnvironment.settings,
    },
  },
  {
    _tag: 'WebSocketRequest',
    id: 'req-0d',
    method: 'desktop.resetSettings',
    body: { _tag: 'desktop.resetSettings' },
  },
  {
    _tag: 'WebSocketRequest',
    id: 'req-1',
    method: 'workflow.addNode',
    body: {
      _tag: 'workflow.addNode',
      kind: 'source',
      label: 'Source',
      params: { seed: 1 },
      inputs: ['node_a'],
      metadata: { phase: 2 },
    },
  },
  {
    _tag: 'WebSocketRequest',
    id: 'req-2',
    method: 'workflow.deleteNode',
    body: { _tag: 'workflow.deleteNode', nodeId: 'node_a' },
  },
  {
    _tag: 'WebSocketRequest',
    id: 'req-3',
    method: 'workflow.connectNodes',
    body: { _tag: 'workflow.connectNodes', from: 'a', to: 'b', edgeType: 'data', metadata: { order: 1 } },
  },
  {
    _tag: 'WebSocketRequest',
    id: 'req-4',
    method: 'workflow.renameNode',
    body: { _tag: 'workflow.renameNode', nodeId: 'node_a', label: 'Renamed' },
  },
  {
    _tag: 'WebSocketRequest',
    id: 'req-5',
    method: 'workflow.recordDecision',
    body: {
      _tag: 'workflow.recordDecision',
      scope: 'project',
      prompt: 'Ship it?',
      choice: 'yes',
      alternatives: ['no'],
      rationale: 'Looks good.',
      refs: [{ id: 'ref-1' }],
      evidence: ['fit-summary'],
      kind: 'approval',
      metadata: { reviewer: 'qa' },
    },
  },
  {
    _tag: 'WebSocketRequest',
    id: 'req-6',
    method: 'workflow.executeAction',
    body: { _tag: 'workflow.executeAction', actionId: 'act_1', payload: { force: true } },
  },
  {
    _tag: 'WebSocketRequest',
    id: 'req-7',
    method: 'workflow.executeNode',
    body: { _tag: 'workflow.executeNode', nodeId: 'node_a', confirmNonLocalExecution: true },
  },
  {
    _tag: 'WebSocketRequest',
    id: 'req-8',
    method: 'workflow.updateNodeNotes',
    body: { _tag: 'workflow.updateNodeNotes', nodeId: 'node_a', notes: 'Updated notes' },
  },
  {
    _tag: 'WebSocketRequest',
    id: 'req-9',
    method: 'workflow.updateNodeParameters',
    body: { _tag: 'workflow.updateNodeParameters', nodeId: 'node_a', params: { alpha: 0.5 } },
  },
  {
    _tag: 'WebSocketRequest',
    id: 'req-10',
    method: 'workflow.setNodeFile',
    body: { _tag: 'workflow.setNodeFile', nodeId: 'node_a', path: '/tmp/file.R' },
  },
  {
    _tag: 'WebSocketRequest',
    id: 'req-11',
    method: 'session.restart',
    body: { _tag: 'session.restart' },
  },
  {
    _tag: 'WebSocketRequest',
    id: 'req-12',
    method: 'repl.write',
    body: { _tag: 'repl.write', data: '1 + 1\n' },
  },
  {
    _tag: 'WebSocketRequest',
    id: 'req-13',
    method: 'repl.clear',
    body: { _tag: 'repl.clear' },
  },
  {
    _tag: 'WebSocketRequest',
    id: 'req-14',
    method: 'host.openInEditor',
    body: { _tag: 'host.openInEditor', path: '/tmp/file.R' },
  },
  {
    _tag: 'WebSocketRequest',
    id: 'req-15',
    method: 'system.getInfo',
    body: { _tag: 'system.getInfo' },
  },
];

const pushFixtures: ReadonlyArray<Schema.Schema.Type<typeof WsPush>> = [
  {
    _tag: 'WsPush',
    channel: 'server.bootstrap',
    payload: {
      _tag: 'ServerBootstrap',
      version: '0.11.2',
      runtime: 'desktop',
      hostedMode: false,
      projectPath: '/tmp/project',
      sessionStatus: { _tag: 'SessionStatus', state: 'ready' },
      desktopEnvironment,
      snapshot,
      replHistory: ['> 1 + 1', '[1] 2'],
    },
  },
  {
    _tag: 'WsPush',
    channel: 'desktop.environment',
    payload: desktopEnvironment,
  },
  {
    _tag: 'WsPush',
    channel: 'session.status',
    payload: { _tag: 'SessionStatus', state: 'error', reason: 'socket_closed' },
  },
  {
    _tag: 'WsPush',
    channel: 'workflow.snapshot',
    payload: snapshot,
  },
  {
    _tag: 'WsPush',
    channel: 'workflow.event',
    payload: {
      protocol_version: '0.1.0',
      message_type: 'ProtocolEvent',
      event_id: 'evt_1',
      event_kind: 'node.updated',
      command_id: 'cmd_1',
      source: 'bayesgrove',
      emitted_at: '2026-03-09T10:05:00.000Z',
      status: snapshot.status,
      graph_version: 2,
    },
  },
  {
    _tag: 'WsPush',
    channel: 'repl.output',
    payload: { _tag: 'ReplOutput', line: '[1] 2' },
  },
  {
    _tag: 'WsPush',
    channel: 'repl.cleared',
    payload: { _tag: 'ReplCleared' },
  },
];

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
      args: { kind: 'source', label: 'Source', params: { seed: 42 } },
    });
  });

  it('round-trips graph snapshots with protocol partitions', () => {
    roundTrip(GraphSnapshot, snapshot);
  });

  it('round-trips every websocket request shape', () => {
    for (const request of requestFixtures) {
      roundTrip(WebSocketRequest, request);
    }
  });

  it('round-trips websocket responses and rpc errors', () => {
    roundTrip(RpcError, {
      _tag: 'RpcError',
      code: 'invalid_request',
      message: 'Bad body.',
      details: { field: 'body' },
    });

    roundTrip(WebSocketResponse, {
      _tag: 'WebSocketSuccess',
      id: 'req-0',
      method: 'desktop.getEnvironment',
      result: desktopEnvironment,
    });

    roundTrip(WebSocketResponse, {
      _tag: 'WebSocketSuccess',
      id: 'req-1',
      method: 'workflow.addNode',
      result: { _tag: 'AckResult' },
    });

    roundTrip(WebSocketResponse, {
      _tag: 'WebSocketSuccess',
      id: 'req-15',
      method: 'system.getInfo',
      result: {
        _tag: 'SystemInfo',
        platform: 'linux',
        arch: 'x64',
        hostedMode: false,
        runtime: 'desktop',
        projectPath: '/tmp/project',
      },
    });

    roundTrip(WebSocketResponse, {
      _tag: 'WebSocketError',
      id: 'req-2',
      method: 'workflow.deleteNode',
      error: {
        _tag: 'RpcError',
        code: 'unknown_node',
        message: 'Node not found.',
      },
    });
  });

  it('round-trips every websocket push channel payload', () => {
    for (const push of pushFixtures) {
      roundTrip(WsPush, push);
    }
  });

  it('round-trips bootstrap payloads and explicit result schemas', () => {
    const bootstrapFixture = pushFixtures.find(
      (push): push is Extract<(typeof pushFixtures)[number], { readonly channel: 'server.bootstrap' }> =>
        push.channel === 'server.bootstrap',
    );

    if (!bootstrapFixture) {
      throw new Error('Expected a server bootstrap fixture.');
    }

    roundTrip(ServerBootstrap, bootstrapFixture.payload);
    roundTrip(AckResult, { _tag: 'AckResult' });
    roundTrip(SystemInfoResult, {
      _tag: 'SystemInfo',
      platform: 'darwin',
      arch: 'arm64',
      hostedMode: true,
      runtime: 'server',
      projectPath: null,
    });
  });

  it('decodes extension registry descriptors into canonical snake_case fields', async () => {
    const decoded = await Effect.runPromise(decodeGraphSnapshot({
      ...snapshot,
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

    expect(decoded.extension_registry).toEqual([
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
    const { extension_registry: _extensionRegistry, ...snapshotWithoutRegistry } = snapshot;
    const decoded = await Effect.runPromise(decodeGraphSnapshot({
      ...snapshotWithoutRegistry,
      extensionRegistry: [],
    }));

    expect(decoded.extension_registry).toBeUndefined();
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

  it('rejects websocket requests whose method and body tags do not match', async () => {
    await expect(
      Effect.runPromise(decodeWebSocketRequest({
        _tag: 'WebSocketRequest',
        id: 'req-bad',
        method: 'workflow.renameNode',
        body: { _tag: 'workflow.deleteNode', nodeId: 'node_a' },
      })),
    ).rejects.toThrow();
  });

  it('rejects push payloads that do not match their channel schema', async () => {
    await expect(
      Effect.runPromise(decodeWsPush({
        _tag: 'WsPush',
        channel: 'repl.output',
        payload: { _tag: 'ReplOutput' },
      })),
    ).rejects.toThrow();
  });

  it('rejects non-json opaque fields instead of accepting unconstrained unknown values', async () => {
    await expect(
      Effect.runPromise(decodeGraphSnapshot({
        ...snapshot,
        graph: { nodes: { node_a: { invalid: () => 1 } } },
      })),
    ).rejects.toThrow();
  });

  it('decodes bootstrap, rpc error, and response helpers directly', async () => {
    const bootstrap = await Effect.runPromise(decodeServerBootstrap(pushFixtures[0]!.payload));
    const error = await Effect.runPromise(decodeRpcError({
      _tag: 'RpcError',
      code: 'bad',
      message: 'oops',
    }));
    const response = await Effect.runPromise(decodeWebSocketResponse({
      _tag: 'WebSocketSuccess',
      id: 'req-15',
      method: 'system.getInfo',
      result: {
        _tag: 'SystemInfo',
        platform: 'linux',
        arch: 'x64',
        hostedMode: false,
        runtime: 'desktop',
        projectPath: '/tmp/project',
      },
    }));

    expect(bootstrap._tag).toBe('ServerBootstrap');
    expect(error.code).toBe('bad');
    expect(response._tag).toBe('WebSocketSuccess');
  });
});
