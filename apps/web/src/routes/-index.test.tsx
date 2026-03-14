// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DesktopEnvironmentState, GraphSnapshot } from '@glade/contracts';
import type { DesktopUpdateState } from '@glade/shared';

import { useAppStore } from '../store/app';
import { useConnectionStore } from '../store/connection';
import { useGraphStore } from '../store/graph';
import { ServerSessionProvider } from '../lib/server-session-context';
import { useWorkspaceStore } from '../store/workspace';
import { IndexRoute } from './index';

const workflowExecuteAction = vi.fn();
const workflowUseDefaultWorkflow = vi.fn();
const workflowUseWorkflowPacks = vi.fn();
const hostOpenInEditor = vi.fn();
const reconnect = vi.fn();
const replWrite = vi.fn();
const replClear = vi.fn();
const fitMock = vi.fn();
const desktopGetEnvironment = vi.fn();
const desktopRefreshEnvironment = vi.fn();
const desktopSaveSettings = vi.fn();
const desktopResetSettings = vi.fn();
const desktopBootstrapProject = vi.fn();
const getUpdateState = vi.fn<() => Promise<DesktopUpdateState>>();

const desktopEnvironment: DesktopEnvironmentState = {
  settings: {
    rExecutablePath: '/usr/bin/Rscript',
    editorCommand: 'auto',
    updateChannel: 'stable',
  },
  preflight: {
    checkedAt: '2026-03-09T10:00:00.000Z',
    projectPath: '/tmp/glade/project',
    status: 'action_required',
    issues: [
      {
        code: 'r_missing',
        title: 'Install R before using Glade',
        description: 'Glade could not find an R executable at "/usr/bin/Rscript". R is required and is not bundled with the app.',
        href: 'https://cran.r-project.org/',
      },
    ],
  },
};

const desktopUpdateState: DesktopUpdateState = {
  status: 'idle',
  version: null,
  message: null,
  progressPercent: null,
};

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    loadAddon = vi.fn();
    open = vi.fn();
    focus = vi.fn();
    write = vi.fn();
    writeln = vi.fn();
    clear = vi.fn();
    onData = vi.fn(() => ({ dispose: vi.fn() }));
    dispose = vi.fn();
  },
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    activate = vi.fn();
    dispose = vi.fn();
    fit = fitMock;
  },
}));

vi.mock('../hooks/useRpcClient', () => ({
  useRpcClient: () => ({
    desktop: {
      getEnvironment: desktopGetEnvironment,
      refreshEnvironment: desktopRefreshEnvironment,
      saveSettings: desktopSaveSettings,
      resetSettings: desktopResetSettings,
      bootstrapProject: desktopBootstrapProject,
    },
    workflow: {
      addNode: vi.fn(),
      deleteNode: vi.fn(),
      connectNodes: vi.fn(),
      renameNode: vi.fn(),
      recordDecision: vi.fn(),
      executeAction: workflowExecuteAction,
      useDefaultWorkflow: workflowUseDefaultWorkflow,
      useWorkflowPacks: workflowUseWorkflowPacks,
      updateNodeNotes: vi.fn(),
      updateNodeParameters: vi.fn(),
      setNodeFile: vi.fn(),
    },
    session: {
      restart: vi.fn(),
    },
    repl: {
      write: replWrite,
      clear: replClear,
    },
    host: {
      openInEditor: hostOpenInEditor,
    },
    reconnect,
  }),
}));

const baseSnapshot: GraphSnapshot = {
  protocol_version: '0.1.0',
  message_type: 'GraphSnapshot',
  emitted_at: '2026-03-08T10:00:00.000Z',
  project_id: 'proj_phase_5',
  project_name: 'workflow-ui',
  graph: {
    version: 1,
    registry: {
      kinds: {
        fit: { name: 'fit', input_contract: ['data.frame'], output_type: 'fit' },
      },
    },
    nodes: {
      fit_1: { id: 'fit_1', kind: 'fit', label: 'Baseline fit', status: 'blocked', block_reason: 'review_required' },
    },
    edges: {},
  },
  status: {
    workflow_state: 'blocked',
    runnable_nodes: 0,
    blocked_nodes: 1,
    pending_gates: 0,
    active_jobs: 0,
    health: 'ok',
    messages: ['review required'],
  },
  pending_gates: {},
  branches: {},
  branch_goals: {},
  protocol: {
    summary: {
      n_scopes: 1,
      n_obligations: 1,
      n_actions: 1,
      n_blocking: 1,
      scopes: ['project'],
    },
    project: {
      scope: 'project',
      scope_label: 'Project',
      obligations: {
        review_fit: {
          obligation_id: 'review_fit',
          kind: 'fit_review',
          scope: 'project',
          severity: 'blocking',
          title: 'Review fit criticism',
          basis: { node_ids: ['fit_1'] },
          explanation: { why_now: 'A fit criticism decision is required before you continue.' },
        },
      },
      actions: {
        act_review: {
          action_id: 'act_review',
          kind: 'record_decision',
          scope: 'project',
          title: 'Record fit criticism decision',
          basis: { node_ids: ['fit_1'] },
          payload: {
            template_ref: 'review_decision',
            decision_type: 'fit_criticism',
            allowed_goal_kinds: ['needs_revision', 'acceptable'],
          },
          invocation: {
            command: 'bg_record_decision',
            prompt: 'What is your fit criticism assessment for these summaries?',
            input: {
              mode: 'form',
              fields: {
                choice: {
                  label: 'Assessment',
                  required: true,
                  choices: ['needs_revision', 'acceptable'],
                },
                choice_label: {
                  label: 'Optional label',
                  required: false,
                },
                rationale: {
                  label: 'Rationale',
                  required: true,
                  multiline: true,
                },
              },
            },
          },
          explanation: { why_now: 'Record the review outcome before branching or comparing.' },
        },
      },
    },
  },
};

const updatedSnapshot: GraphSnapshot = {
  ...baseSnapshot,
  emitted_at: '2026-03-08T10:00:02.000Z',
  status: {
    ...baseSnapshot.status,
    workflow_state: 'open',
    runnable_nodes: 1,
    blocked_nodes: 0,
    messages: ['review recorded'],
  },
  protocol: {
    summary: {
      n_scopes: 1,
      n_obligations: 0,
      n_actions: 1,
      n_blocking: 0,
      scopes: ['project'],
    },
    project: {
      scope: 'project',
      scope_label: 'Project',
      obligations: {},
      actions: {
        act_compare: {
          action_id: 'act_compare',
          kind: 'create_node_from_template',
          scope: 'project',
          title: 'Compare revised branches',
          basis: { node_ids: ['fit_1'] },
          payload: {
            template_ref: 'branch_comparison',
            inputs: ['fit_1'],
            node_kind: 'compare',
            default_label: 'Compare revised fits',
          },
          explanation: { why_now: 'Run a comparison after recording the review decision.' },
        },
      },
    },
  },
};

const extensionSnapshot: GraphSnapshot = {
  ...baseSnapshot,
  emitted_at: '2026-03-08T10:00:04.000Z',
  graph: {
    ...baseSnapshot.graph,
    nodes: {},
  },
  status: {
    ...baseSnapshot.status,
    workflow_state: 'open',
    runnable_nodes: 0,
    blocked_nodes: 0,
    messages: ['ready'],
  },
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
      package_name: 'test.extension',
      version: '0.1.0',
      node_types: [
        {
          kind: 'posterior_summary',
          title: 'Posterior summary',
          description: 'Summarize posterior draws.',
        },
      ],
      domain_packs: [
        {
          id: 'reporting',
          title: 'Reporting',
        },
      ],
    },
  ],
};

const blankProjectSnapshot: GraphSnapshot = {
  ...baseSnapshot,
  emitted_at: '2026-03-08T10:00:06.000Z',
  graph: {
    version: 1,
    registry: {
      kinds: {},
    },
    nodes: {},
    edges: {},
  },
  status: {
    ...baseSnapshot.status,
    workflow_state: 'open',
    runnable_nodes: 0,
    blocked_nodes: 0,
    messages: ['ready'],
  },
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

const reviewActionPayload = {
  prompt: 'What is your fit criticism assessment for these summaries?',
  choice: 'needs_revision',
  choice_label: 'Tighten model before rerun',
  rationale: 'Posterior predictive checks need remediation.',
};

describe('IndexRoute phase 5 workflow UI', () => {
  beforeEach(() => {
    workflowExecuteAction.mockReset();
    workflowUseDefaultWorkflow.mockReset();
    workflowUseWorkflowPacks.mockReset();
    hostOpenInEditor.mockReset();
    reconnect.mockReset();
    replWrite.mockReset();
    replClear.mockReset();
    workflowUseDefaultWorkflow.mockResolvedValue({ success: true, result: { _tag: 'AckResult' } });
    workflowUseWorkflowPacks.mockResolvedValue({ success: true, result: { _tag: 'AckResult' } });
    desktopGetEnvironment.mockReset();
    desktopGetEnvironment.mockResolvedValue({ success: true, result: desktopEnvironment });
    desktopRefreshEnvironment.mockReset();
    desktopRefreshEnvironment.mockResolvedValue({ success: true, result: desktopEnvironment });
    desktopSaveSettings.mockReset();
    desktopSaveSettings.mockResolvedValue({ success: true, result: desktopEnvironment });
    desktopResetSettings.mockReset();
    desktopResetSettings.mockResolvedValue({ success: true, result: desktopEnvironment });
    desktopBootstrapProject.mockReset();
    desktopBootstrapProject.mockResolvedValue({ success: true, result: desktopEnvironment });
    getUpdateState.mockReset();
    getUpdateState.mockResolvedValue(desktopUpdateState);
    useGraphStore.getState().clear();
    useWorkspaceStore.setState({
      tabs: [{ id: 'canvas-tab', type: 'canvas', nodeId: null, label: 'Workflow DAG', icon: '🕸️', closable: false }],
      activeTabId: 'canvas-tab',
      selectedNodeId: null,
      highlightedNodeIds: [],
      multiSelectedNodeIds: [],
      explorerGroups: [
        { id: 'data-sources', title: 'Data Sources', icon: 'database', expanded: true },
        { id: 'model-specs', title: 'Models', icon: 'file-code', expanded: true },
        { id: 'fits', title: 'Fits', icon: 'play', expanded: true },
        { id: 'diagnostics', title: 'Diagnostics', icon: 'stethoscope', expanded: true },
        { id: 'results', title: 'Results', icon: 'git-compare', expanded: true },
      ],
      inspectorTab: 'obligations',
      inspectorVisible: true,
      commandPaletteOpen: false,
      floatingToolbarNodeId: null,
    });
    vi.stubGlobal('ResizeObserver', class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    fitMock.mockReset();
    useAppStore.setState({
      serverConnected: true,
      serverVersion: '0.5.0',
      sessionState: 'ready',
      sessionReason: null,
      notifications: [],
    });
    useConnectionStore.setState({
      desktopEnvironment,
    });
    window.desktopBridge = {
      getWsUrl: () => 'ws://127.0.0.1:7842/ws',
      pickDirectory: vi.fn(async () => '/tmp/glade/project'),
      getUpdateState,
      checkForUpdates: vi.fn(async () => desktopUpdateState),
      downloadUpdate: vi.fn(async () => desktopUpdateState),
      installDownloadedUpdate: vi.fn(async () => true),
      onUpdateState: vi.fn(() => () => {}),
    };
  });

  afterEach(() => {
    cleanup();
    delete window.desktopBridge;
    vi.unstubAllGlobals();
  });

  function renderRoute() {
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });

    return render(
      <QueryClientProvider client={queryClient}>
        <ServerSessionProvider>
          <IndexRoute />
        </ServerSessionProvider>
      </QueryClientProvider>,
    );
  }

  it('shows an action preview, dispatches ExecuteAction on confirm, and surfaces updated guidance', async () => {
    workflowExecuteAction.mockResolvedValue({
      success: true,
      result: {
        _tag: 'AckResult',
      },
    });
    useGraphStore.getState().applySnapshot(baseSnapshot);

    renderRoute();

    fireEvent.click(screen.getByRole('tab', { name: /Actions \(1\)/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(screen.getByText('Action Preview')).toBeInTheDocument();
    expect(screen.getAllByText('Record fit criticism decision')[0]).toBeInTheDocument();
    expect(screen.getByText(/Record an explicit review-oriented decision/i)).toBeInTheDocument();
    expect(screen.getByText('What is your fit criticism assessment for these summaries?')).toBeInTheDocument();

    const choiceSelect = screen.getByLabelText(/Assessment \*/i);
    fireEvent.change(choiceSelect, { target: { value: 'needs_revision' } });
    fireEvent.change(screen.getByLabelText(/Optional label/i), { target: { value: 'Tighten model before rerun' } });
    fireEvent.change(screen.getByLabelText(/Rationale \*/i), { target: { value: 'Posterior predictive checks need remediation.' } });

    fireEvent.click(screen.getByRole('button', { name: 'Confirm and run' }));

    await waitFor(() =>
      expect(workflowExecuteAction).toHaveBeenCalledWith({
        actionId: 'act_review',
        payload: reviewActionPayload,
      }),
    );

    await act(async () => {
      useGraphStore.getState().applySnapshot(updatedSnapshot);
    });

    expect(await screen.findByText('Next from bayesgrove')).toBeInTheDocument();
    expect(screen.getAllByText('Compare revised branches')[0]).toBeInTheDocument();
  });

  it('keeps submit disabled until required invocation inputs are provided', () => {
    useGraphStore.getState().applySnapshot(baseSnapshot);

    renderRoute();

    fireEvent.click(screen.getByRole('tab', { name: /Actions \(1\)/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(screen.getByRole('button', { name: 'Confirm and run' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Complete the required fields: Assessment, Rationale.');

    fireEvent.change(screen.getByLabelText(/Assessment \*/i), { target: { value: 'needs_revision' } });
    fireEvent.change(screen.getByLabelText(/Rationale \*/i), { target: { value: 'Posterior predictive checks need remediation.' } });

    expect(screen.getByRole('button', { name: 'Confirm and run' })).toBeEnabled();
  });

  it('opens a node tab from the explorer and keeps the inspector in sync', async () => {
    useGraphStore.getState().applySnapshot(baseSnapshot);

    renderRoute();

    fireEvent.click(screen.getByRole('button', { name: /baseline fit/i }));

    expect(await screen.findByRole('heading', { level: 3, name: 'Baseline fit' })).toBeInTheDocument();
    const inspectorHeader = screen.getByRole('heading', { level: 2, name: 'Baseline fit' }).closest('header');
    if (!inspectorHeader) {
      throw new Error('Expected inspector header for selected node.');
    }

    const inspector = inspectorHeader.parentElement;
    if (!inspector) {
      throw new Error('Expected inspector container.');
    }

    expect(within(inspector).getByText('Node status')).toBeInTheDocument();
    expect(within(inspector).getByRole('button', { name: /Run node/i })).toBeInTheDocument();
  });

  it('does not dispatch when the preview is cancelled', () => {
    useGraphStore.getState().applySnapshot(baseSnapshot);

    renderRoute();

    fireEvent.click(screen.getByRole('tab', { name: /Actions \(1\)/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(workflowExecuteAction).not.toHaveBeenCalled();
    expect(screen.queryByText('Action Preview')).not.toBeInTheDocument();
  });

  it('shows health details in a dialog without navigating away', () => {
    useGraphStore.getState().applySnapshot(baseSnapshot);

    renderRoute();

    fireEvent.click(screen.getByRole('button', { name: 'System health' }));

    expect(screen.getByText('Health')).toBeInTheDocument();
    expect(screen.getByText(/Live server status without navigating away/i)).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('"endpoint": "') && content.includes('/health"'))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByText('Health')).not.toBeInTheDocument();
  });

  it('shows the first-launch setup guidance when desktop preflight requires action', async () => {
    useGraphStore.getState().applySnapshot(baseSnapshot);

    renderRoute();

    expect(await screen.findByText(/Setup required:/)).toBeInTheDocument();
  });

  it('does not show the project-setup banner for an already opened but empty project', async () => {
    useGraphStore.getState().applySnapshot(extensionSnapshot);

    renderRoute();

    await waitFor(() => {
      expect(screen.queryByText(/Choose a project before starting the workspace/i)).not.toBeInTheDocument();
    });
  });

  it('shows workflow activation actions for an empty project with no node kinds', async () => {
    useGraphStore.getState().applySnapshot(blankProjectSnapshot);

    renderRoute();

    expect(await screen.findByText(/Choose a starter workflow or enable review packs/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use default workflow' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enable workflow packs' })).toBeInTheDocument();
  });

  it('activates the default workflow from the empty-project banner', async () => {
    useGraphStore.getState().applySnapshot(blankProjectSnapshot);

    renderRoute();

    fireEvent.click(await screen.findByRole('button', { name: 'Use default workflow' }));

    await waitFor(() => {
      expect(workflowUseDefaultWorkflow).toHaveBeenCalledWith();
    });
  });

  it('opens the workflow-pack picker and submits selected packs', async () => {
    useGraphStore.getState().applySnapshot(blankProjectSnapshot);

    renderRoute();

    fireEvent.click(await screen.findByRole('button', { name: 'Enable workflow packs' }));
    expect(screen.getByRole('heading', { name: 'Enable workflow packs' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Activate selected packs' }));

    await waitFor(() => {
      expect(workflowUseWorkflowPacks).toHaveBeenCalledWith({
        workflowPacks: ['bayesguide.default_bayesian'],
      });
    });
  });

  it('shows the project-setup banner when no graph snapshot is available yet', async () => {
    useConnectionStore.setState({
      desktopEnvironment: {
        ...desktopEnvironment,
        preflight: {
          ...desktopEnvironment.preflight,
          status: 'action_required',
        },
      },
    });

    renderRoute();

    expect(await screen.findByText(/Choose a project before starting the workspace/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Project setup' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Extensions' }).length).toBeGreaterThan(0);
  });

  it('hides the project-setup banner when waiting for snapshot with a ready configured project', async () => {
    useConnectionStore.setState({
      desktopEnvironment: {
        ...desktopEnvironment,
        preflight: {
          ...desktopEnvironment.preflight,
          status: 'ok',
          issues: [],
        },
      },
    });

    renderRoute();

    await waitFor(() => {
      expect(screen.queryByText(/Choose a project before starting the workspace/i)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Waiting for the first graph snapshot from bayesgrove/i)).toBeInTheDocument();
  });

  it('shows loaded extension contents and sends a library command from the extension manager', async () => {
    replWrite.mockResolvedValue({ success: true, result: { _tag: 'AckResult' } });
    useGraphStore.getState().applySnapshot(extensionSnapshot);

    renderRoute();

    fireEvent.click(screen.getAllByRole('button', { name: 'Extensions' })[0]!);

    expect(await screen.findByText('Load installed node packs')).toBeInTheDocument();
    expect(screen.getByText('Available node kinds')).toBeInTheDocument();
    expect(screen.getByText('test.extension')).toBeInTheDocument();
    expect(screen.getAllByText('Posterior summary').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Reporting').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Package name'), {
      target: { value: 'test.extension' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load package' }));

    await waitFor(() => {
      expect(replWrite).toHaveBeenCalledWith('library("test.extension", character.only = TRUE)\n');
    });
  });
});
