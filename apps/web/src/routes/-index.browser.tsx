import '../index.css';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import type { DesktopEnvironmentState, GraphSnapshot } from '@glade/contracts';
import type { DesktopUpdateState } from '@glade/shared';

import { useAppStore } from '../store/app';
import { useConnectionStore } from '../store/connection';
import { useGraphStore } from '../store/graph';
import { IndexRoute } from './index';

const fitMock = vi.fn();
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
          },
          explanation: { why_now: 'Record the review outcome before branching or comparing.' },
        },
      },
    },
  },
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
    desktop: {
      getEnvironment: vi.fn(async () => ({ success: true, result: desktopEnvironment })),
      refreshEnvironment: vi.fn(async () => ({ success: true, result: desktopEnvironment })),
      saveSettings: vi.fn(async () => ({ success: true, result: desktopEnvironment })),
      resetSettings: vi.fn(async () => ({ success: true, result: desktopEnvironment })),
    },
    workflow: {
      addNode: vi.fn(),
      deleteNode: vi.fn(),
      connectNodes: vi.fn(),
      renameNode: vi.fn(),
      recordDecision: vi.fn(),
      executeAction: vi.fn(),
      executeNode: vi.fn(),
      updateNodeNotes: vi.fn(),
      updateNodeParameters: vi.fn(),
      setNodeFile: vi.fn(),
    },
    session: {
      restart: vi.fn(),
    },
    repl: {
      write: vi.fn(),
      clear: vi.fn(),
    },
    host: {
      openInEditor: vi.fn(),
    },
    system: {
      getInfo: vi.fn(),
    },
    reconnect: vi.fn(),
  }),
}));

async function waitForText(text: string, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (document.body.textContent?.includes(text)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for text: ${text}`);
}

async function waitForTextToDisappear(text: string, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!document.body.textContent?.includes(text)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for text to disappear: ${text}`);
}

function clickButton(label: string) {
  const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.trim() === label,
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Could not find button: ${label}`);
  }

  button.click();
}

describe('IndexRoute browser smoke', () => {
  beforeEach(() => {
    fitMock.mockReset();
    getUpdateState.mockReset();
    getUpdateState.mockResolvedValue(desktopUpdateState);
    useGraphStore.getState().clear();
    useGraphStore.getState().applySnapshot(baseSnapshot);
    useAppStore.setState({
      serverConnected: true,
      serverVersion: '0.5.0',
      sessionState: 'ready',
      sessionReason: null,
      notifications: [],
    });
    vi.stubGlobal('ResizeObserver', class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    useConnectionStore.setState({
      desktopEnvironment,
    });
    window.desktopBridge = {
      getWsUrl: () => 'ws://127.0.0.1:7842/ws',
      getUpdateState,
      checkForUpdates: vi.fn(async () => desktopUpdateState),
      downloadUpdate: vi.fn(async () => desktopUpdateState),
      installDownloadedUpdate: vi.fn(async () => true),
      onUpdateState: vi.fn(() => () => {}),
    };
  });

  afterEach(() => {
    delete window.desktopBridge;
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('renders setup guidance and opens the health dialog in a real browser', async () => {
    const host = document.createElement('div');
    document.body.append(host);

    const view = await render(<IndexRoute />, {
      container: host,
    });

    try {
      await waitForText('Complete local setup before running workflows');
      await waitForText('Install R before using Glade');
      clickButton('View health');
      await waitForText('Live server status without navigating away from the app window.');
      expect(document.body.textContent).toContain('/health');
      clickButton('Close');
      await waitForTextToDisappear('Live server status without navigating away from the app window.');
    } finally {
      await view.unmount();
      host.remove();
    }
  });
});
