// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GraphSnapshot } from '@glade/contracts';
import type { DesktopRuntimeSnapshot } from '@glade/shared';

import { useAppStore } from '../store/app';
import { useGraphStore } from '../store/graph';
import { IndexRoute } from './index';

const workflowExecuteAction = vi.fn();
const hostOpenInEditor = vi.fn();
const reconnect = vi.fn();
const replWrite = vi.fn();
const replClear = vi.fn();
const fitMock = vi.fn();
const getDesktopState = vi.fn<() => Promise<DesktopRuntimeSnapshot>>();

const desktopSnapshot: DesktopRuntimeSnapshot = {
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
  update: {
    channel: 'stable',
    status: 'idle',
    version: null,
    message: null,
    progressPercent: null,
  },
  logTail: ['[desktop] initial diagnostics'],
};

vi.mock('xterm', () => ({
  Terminal: class {
    loadAddon = vi.fn();
    open = vi.fn();
    write = vi.fn();
    writeln = vi.fn();
    clear = vi.fn();
    onData = vi.fn(() => ({ dispose: vi.fn() }));
    dispose = vi.fn();
  },
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = fitMock;
  },
}));

vi.mock('../hooks/useRpcClient', () => ({
  useRpcClient: () => ({
    workflow: {
      addNode: vi.fn(),
      deleteNode: vi.fn(),
      connectNodes: vi.fn(),
      renameNode: vi.fn(),
      recordDecision: vi.fn(),
      executeAction: workflowExecuteAction,
      executeNode: vi.fn(),
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
    system: {
      getInfo: vi.fn(),
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
            prompt: 'What is your fit criticism assessment for these summaries?',
            choice: 'needs_revision',
            rationale: 'Posterior predictive checks need remediation.',
            decision_type: 'fit_criticism',
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

const reviewActionPayload = (
  (baseSnapshot.protocol as unknown as {
    project: {
      actions: {
        act_review: {
          payload: Record<string, unknown>;
        };
      };
    };
  }).project.actions.act_review.payload
);

describe('IndexRoute phase 5 workflow UI', () => {
  beforeEach(() => {
    workflowExecuteAction.mockReset();
    hostOpenInEditor.mockReset();
    reconnect.mockReset();
    replWrite.mockReset();
    replClear.mockReset();
    getDesktopState.mockReset();
    getDesktopState.mockResolvedValue(desktopSnapshot);
    useGraphStore.getState().clear();
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
    (window as typeof window & {
      __GLADE_DESKTOP__?: unknown;
    }).__GLADE_DESKTOP__ = {
      platform: 'linux',
      serverPort: 7842,
      getDesktopState,
      refreshDesktopState: getDesktopState,
      saveDesktopSettings: getDesktopState,
      resetDesktopSettings: getDesktopState,
      checkForUpdates: getDesktopState,
      downloadUpdate: getDesktopState,
      installDownloadedUpdate: vi.fn(async () => true),
      onDesktopStateChange: vi.fn(() => () => {}),
    };
  });

  afterEach(() => {
    cleanup();
    delete (window as typeof window & { __GLADE_DESKTOP__?: unknown }).__GLADE_DESKTOP__;
    vi.unstubAllGlobals();
  });

  it('shows an action preview, dispatches ExecuteAction on confirm, and surfaces updated guidance', async () => {
    workflowExecuteAction.mockResolvedValue({
      success: true,
      result: {
        _tag: 'AckResult',
      },
    });
    useGraphStore.getState().applySnapshot(baseSnapshot);

    render(<IndexRoute />);

    const [runButton] = screen.getAllByRole('button', { name: 'Run' });
    if (!runButton) {
      throw new Error('Expected a Run button.');
    }
    fireEvent.click(runButton);

    expect(screen.getByText('Action Preview')).toBeInTheDocument();
    expect(screen.getAllByText('Record fit criticism decision')[0]).toBeInTheDocument();
    expect(screen.getByText(/Record an explicit review-oriented decision/i)).toBeInTheDocument();

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

  it('does not dispatch when the preview is cancelled', () => {
    useGraphStore.getState().applySnapshot(baseSnapshot);

    render(<IndexRoute />);

    const [runButton] = screen.getAllByRole('button', { name: 'Run' });
    if (!runButton) {
      throw new Error('Expected a Run button.');
    }
    fireEvent.click(runButton);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(workflowExecuteAction).not.toHaveBeenCalled();
    expect(screen.queryByText('Action Preview')).not.toBeInTheDocument();
  });

  it('shows health details in a dialog without navigating away', () => {
    useGraphStore.getState().applySnapshot(baseSnapshot);

    render(<IndexRoute />);

    fireEvent.click(screen.getAllByRole('button', { name: 'View health' })[0]!);

    expect(screen.getByText('Health')).toBeInTheDocument();
    expect(screen.getByText(/Live server status without navigating away/i)).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('"endpoint": "') && content.includes('/health"'))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByText('Health')).not.toBeInTheDocument();
  });

  it('shows the first-launch setup guidance when desktop preflight requires action', async () => {
    useGraphStore.getState().applySnapshot(baseSnapshot);

    render(<IndexRoute />);

    expect(await screen.findByText('Complete local setup before running workflows')).toBeInTheDocument();
    expect(screen.getByText('Install R before using Glade')).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('/tmp/glade/project'))).toBeInTheDocument();
    expect(screen.getByText('[desktop] initial diagnostics')).toBeInTheDocument();
  });
});
