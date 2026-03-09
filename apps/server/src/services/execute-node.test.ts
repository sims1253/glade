import { describe, expect, it } from 'vitest';

import type { GraphSnapshot } from '@glade/contracts';

import {
  isLocalExtensionLibrary,
  mergeToolExecutionMetadata,
  resolveNodeExecution,
  toSubmitNodeCommand,
  toUpdateNodeMetadataCommand,
} from './execute-node';

const snapshot: GraphSnapshot = {
  protocol_version: '0.1.0',
  message_type: 'GraphSnapshot',
  emitted_at: '2026-03-09T12:00:00.000Z',
  project_id: 'proj_phase_09',
  project_name: 'phase-09',
  graph: {
    version: 1,
    registry: {
      kinds: {
        source: {
          kind: 'source',
        },
      },
    },
    nodes: {
      prior_1: {
        id: 'prior_1',
        kind: 'prior_elicitation',
        label: 'Prior elicitation',
        params: {
          family: 'normal',
          draws: 400,
        },
        metadata: {
          notes: 'Existing notes',
          summaries: [
            {
              id: 'sum_existing',
              kind: 'fit_summary',
            },
          ],
        },
      },
      source_1: {
        id: 'source_1',
        kind: 'source',
        label: 'Source',
        params: {},
        metadata: {},
      },
    },
    edges: {},
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
  extension_registry: [
    {
      id: 'elicito.node.pack',
      package_name: 'elicito.node.pack',
      library_path: '/opt/R/library/elicito.node.pack',
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
      domain_packs: [],
    },
    {
      id: 'local.example',
      package_name: 'local.example',
      library_path: '/home/m0hawk/Documents/glade/examples/elicito-node-pack',
      node_types: [
        {
          kind: 'local_runtime',
          runtime: 'shell',
          command: 'echo',
          allowShell: true,
        },
      ],
      domain_packs: [],
    },
  ],
};

describe('execute-node helpers', () => {
  it('resolves multi-runtime extension descriptors from the snapshot', () => {
    const execution = resolveNodeExecution(snapshot, 'prior_1', {
      rootDir: '/home/m0hawk/Documents/glade',
      projectPath: '/tmp/project',
    });

    expect(execution).toMatchObject({
      nodeId: 'prior_1',
      kind: 'prior_elicitation',
      runtime: 'uvx',
      command: 'elicito',
      argsTemplate: ['--input', '{input_json_path}', '--output', '{output_json_path}'],
      inputSerializer: 'json_file',
      outputParser: 'json_file',
      isLocalExtension: false,
      inputs: {
        family: 'normal',
        draws: 400,
      },
    });
  });

  it('defaults unannotated node kinds to r_session execution', () => {
    const execution = resolveNodeExecution(snapshot, 'source_1', {
      rootDir: '/home/m0hawk/Documents/glade',
      projectPath: '/tmp/project',
    });

    expect(execution.runtime).toBe('r_session');
    expect(execution.command).toBeNull();
  });

  it('detects local extension libraries relative to the repo or project path', () => {
    expect(isLocalExtensionLibrary('/home/m0hawk/Documents/glade/examples/elicito-node-pack', '/home/m0hawk/Documents/glade', null)).toBe(true);
    expect(isLocalExtensionLibrary('/tmp/project/extensions/pkg', '/home/m0hawk/Documents/glade', '/tmp/project')).toBe(true);
    expect(isLocalExtensionLibrary('/usr/lib/R/site-library/pkg', '/home/m0hawk/Documents/glade', '/tmp/project')).toBe(false);
  });

  it('merges tool execution summaries into node metadata', () => {
    const merged = mergeToolExecutionMetadata(
      {
        notes: 'Existing notes',
        summaries: [
          {
            id: 'sum_existing',
            kind: 'fit_summary',
          },
        ],
      },
      {
        runtime: 'uvx',
        status: 'ok',
        command: 'uvx',
        args: ['elicito', '--input', '/tmp/in.json'],
        stdout: '{"ok":true}',
        stderr: '',
        output: { ok: true },
        artifactPath: '/tmp/out.json',
        artifactHash: 'abc123',
        metrics: { duration_ms: 42 },
        executedAt: '2026-03-09T12:03:00.000Z',
      },
    );

    expect(merged).toMatchObject({
      notes: 'Existing notes',
      artifact_path: '/tmp/out.json',
      artifact_hash: 'abc123',
      tool_execution: {
        runtime: 'uvx',
        status: 'ok',
      },
    });
    expect(Array.isArray(merged.summaries)).toBe(true);
    expect((merged.summaries as Array<unknown>)[0]).toMatchObject({
      kind: 'tool_output',
      passed: true,
    });
    expect((merged.summaries as Array<unknown>)[1]).toMatchObject({
      id: 'sum_existing',
    });
  });

  it('builds bayesgrove commands for submit and metadata updates', () => {
    expect(toSubmitNodeCommand('cmd.submit', 'node_1')).toMatchObject({
      command_id: 'cmd.submit',
      command: 'bg_submit',
      args: {
        targets: ['node_1'],
      },
    });

    expect(toUpdateNodeMetadataCommand('cmd.update', 'node_1', { ok: true })).toMatchObject({
      command_id: 'cmd.update',
      command: 'bg_update_node',
      args: {
        node_id: 'node_1',
        metadata: { ok: true },
      },
    });
  });
});
