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
      browserBundlePath: null,
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
          browser_bundle_path: '/extension-bundles/test-extension.js',
          node_types: {
            posterior_summary: {
              kind: 'posterior_summary',
              title: 'Posterior summary',
              description: 'Summarize posterior draws.',
              browser_bundle_path: '/extension-bundles/test-extension.js',
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
        browserBundlePath: '/extension-bundles/test-extension.js',
        nodeKinds: ['posterior_summary'],
      }),
    ]);

    expect(graph.nodeKindsByKind.posterior_summary).toMatchObject({
      kind: 'posterior_summary',
      runtime: 'r_session',
      extensionId: 'test.extension',
      extensionPackageName: 'test.extension',
      browserBundlePath: '/extension-bundles/test-extension.js',
      parameterSchema: {
        type: 'object',
        properties: {
          draws: { type: 'number', title: 'Draw count' },
        },
      },
    });

    expect(graph.nodesById.ext_1).toMatchObject({
      kind: 'posterior_summary',
      runtime: 'r_session',
      extensionId: 'test.extension',
      extensionPackageName: 'test.extension',
      browserBundlePath: '/extension-bundles/test-extension.js',
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

  it('hydrates multi-runtime extension descriptors onto node kinds and nodes', async () => {
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
          elicito_1: {
            id: 'elicito_1',
            kind: 'prior_elicitation',
            label: 'Prior elicitation',
            params: {
              shape: 'normal',
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
      extension_registry: [
        {
          id: 'elicito.node.pack',
          package_name: 'elicito.node.pack',
          node_types: [
            {
              kind: 'prior_elicitation',
              runtime: 'uvx',
              command: 'elicito',
            },
          ],
          domain_packs: [],
        },
      ],
    }));

    const graph = adaptSnapshotToGraph(snapshot);

    expect(graph.nodeKindsByKind.prior_elicitation).toMatchObject({
      runtime: 'uvx',
      command: 'elicito',
    });
    expect(graph.nodesById.elicito_1).toMatchObject({
      runtime: 'uvx',
      command: 'elicito',
    });
  });
});
