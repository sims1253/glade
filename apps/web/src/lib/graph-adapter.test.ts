import * as Effect from 'effect/Effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { decodeGraphSnapshot } from '@glade/contracts';

import { adaptSnapshotToGraph } from './graph-adapter';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('adaptSnapshotToGraph', () => {
  it('keeps nodes without extension metadata and handles an empty registry', async () => {
    const snapshot = await Effect.runPromise(decodeGraphSnapshot({
      protocol_version: '0.1.0',
      message_type: 'GraphSnapshot',
      emitted_at: '2026-03-09T12:00:00.000Z',
      project_id: 'proj_extensions',
      project_name: 'extension-ui',
      graph: {
        version: 1,
        registry: {
          kinds: {},
        },
        nodes: {
          ext_1: {
            id: 'ext_1',
            kind: 'posterior_summary',
            label: 'Posterior summary',
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
      extension_registry: [],
    }));

    const graph = adaptSnapshotToGraph(snapshot);

    expect(graph.extensionRegistry).toEqual([]);
    expect(graph.nodesById.ext_1).toMatchObject({
      kind: 'posterior_summary',
      extensionId: null,
    });
  });

  it('hydrates extension registry metadata from the canonical snapshot registry', async () => {
    const snapshot = await Effect.runPromise(decodeGraphSnapshot({
      protocol_version: '0.1.0',
      message_type: 'GraphSnapshot',
      emitted_at: '2026-03-09T12:00:00.000Z',
      project_id: 'proj_extensions',
      project_name: 'extension-ui',
      graph: {
        version: 1,
        registry: {
          kinds: {},
        },
        nodes: {
          ext_1: {
            id: 'ext_1',
            kind: 'posterior_summary',
            label: 'Posterior summary',
            params: {
              draws: 200,
            },
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
      extension_registry: {
        test_extension: {
          package_name: 'test.extension',
          node_types: {
            posterior_summary: {
              kind: 'posterior_summary',
              title: 'Posterior summary',
              description: 'Summarize posterior draws.',
              parameter_schema: {
                type: 'object',
                properties: {
                  draws: { type: 'number', title: 'Draw count' },
                },
              },
            },
          },
        },
      },
    }));

    const graph = adaptSnapshotToGraph(snapshot);

    expect(graph.extensionRegistry).toEqual([
      expect.objectContaining({
        id: 'test.extension',
        packageName: 'test.extension',
        nodeKinds: ['posterior_summary'],
      }),
    ]);

    expect(graph.nodeKindsByKind.posterior_summary).toMatchObject({
      kind: 'posterior_summary',
      extensionId: 'test.extension',
      extensionPackageName: 'test.extension',
      parameterSchema: {
        type: 'object',
        properties: {
          draws: { type: 'number', title: 'Draw count' },
        },
      },
    });

    expect(graph.nodesById.ext_1).toMatchObject({
      kind: 'posterior_summary',
      extensionId: 'test.extension',
      extensionPackageName: 'test.extension',
      parameters: {
        draws: 200,
      },
    });
  });

  it('assigns unique fallback ids when extension descriptors omit identifiers', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const snapshot = {
      protocol_version: '0.1.0',
      message_type: 'GraphSnapshot',
      emitted_at: '2026-03-09T12:00:00.000Z',
      project_id: 'proj_extensions',
      project_name: 'extension-ui',
      graph: {
        version: 1,
        registry: {
          kinds: {},
        },
        nodes: {},
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
          node_types: [{ kind: 'first_kind' }],
        },
        {
          node_types: [{ kind: 'second_kind' }],
        },
      ],
    } as const;

    const graph = adaptSnapshotToGraph(snapshot);

    expect(graph.extensionRegistry?.map((entry) => entry.id)).toEqual(['extension:0', 'extension:1']);
    expect(graph.extensionRegistryById?.['extension:0']).toBeDefined();
    expect(graph.extensionRegistryById?.['extension:1']).toBeDefined();
    expect(warning).toHaveBeenCalledTimes(2);
  });

  it('derives addable node kinds from command_surface when the legacy registry catalog is absent', async () => {
    const snapshot = await Effect.runPromise(decodeGraphSnapshot({
      protocol_version: '0.1.0',
      message_type: 'GraphSnapshot',
      emitted_at: '2026-03-09T12:00:00.000Z',
      project_id: 'proj_command_surface',
      project_name: 'command-surface',
      graph: {
        version: 1,
        registry: {
          kinds: {},
        },
        nodes: {},
        edges: {},
      },
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
      command_surface: {
        workflow: {
          add_node: {
            kinds: {
              compare: {
                title: 'Compare fits',
                description: 'Compare candidate fits.',
                parameter_schema: {
                  type: 'object',
                  properties: {
                    baseline: { type: 'string', title: 'Baseline fit' },
                  },
                },
              },
            },
          },
        },
      },
    }));

    const graph = adaptSnapshotToGraph(snapshot);

    expect(graph.nodeKindsByKind.compare).toMatchObject({
      kind: 'compare',
      label: 'Compare fits',
      description: 'Compare candidate fits.',
      parameterSchema: {
        type: 'object',
        properties: {
          baseline: { type: 'string', title: 'Baseline fit' },
        },
      },
    });
  });
});
