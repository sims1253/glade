// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DesktopEnvironmentState } from '@glade/contracts';

import { ServerSessionProvider } from '../lib/server-session-context';
import { useConnectionStore } from '../store/connection';
import { WelcomeRoute } from './welcome';

const desktopBootstrapProject = vi.fn();
const sessionRestart = vi.fn();

vi.mock('../hooks/useRpcClient', () => ({
  useRpcClient: () => ({
    desktop: {
      getEnvironment: vi.fn(),
      refreshEnvironment: vi.fn(),
      saveSettings: vi.fn(),
      resetSettings: vi.fn(),
      bootstrapProject: desktopBootstrapProject,
    },
    workflow: {
      addNode: vi.fn(),
      deleteNode: vi.fn(),
      connectNodes: vi.fn(),
      renameNode: vi.fn(),
      recordDecision: vi.fn(),
      executeAction: vi.fn(),
      useDefaultWorkflow: vi.fn(),
      useWorkflowPacks: vi.fn(),
      updateNodeNotes: vi.fn(),
      updateNodeParameters: vi.fn(),
      setNodeFile: vi.fn(),
    },
    session: {
      restart: sessionRestart,
    },
    repl: {
      write: vi.fn(),
      clear: vi.fn(),
    },
    host: {
      openInEditor: vi.fn(),
    },
    reconnect: vi.fn(),
  }),
}));

const desktopEnvironment: DesktopEnvironmentState = {
  settings: {
    rExecutablePath: '/usr/bin/Rscript',
    editorCommand: 'auto',
    updateChannel: 'stable',
    projectPath: '/tmp/glade/current-project',
  },
  preflight: {
    checkedAt: '2026-03-13T10:00:00.000Z',
    projectPath: '/tmp/glade/current-project',
    status: 'ok',
    issues: [],
  },
};

const bootstrappedEnvironment: DesktopEnvironmentState = {
  ...desktopEnvironment,
  settings: {
    ...desktopEnvironment.settings,
    projectPath: '/tmp/glade/new-project',
  },
  preflight: {
    ...desktopEnvironment.preflight,
    projectPath: '/tmp/glade/new-project',
  },
};

function renderRoute() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ServerSessionProvider>{children}</ServerSessionProvider>
    </QueryClientProvider>
  );

  render(<WelcomeRoute />, { wrapper });
}

describe('WelcomeRoute', () => {
  beforeEach(() => {
    history.pushState({}, '', '/welcome');
    desktopBootstrapProject.mockReset();
    sessionRestart.mockReset();
    useConnectionStore.setState({
      serverConnected: true,
      serverVersion: '0.13.0-server',
      sessionState: 'ready',
      sessionReason: null,
      projectPath: '/tmp/glade/current-project',
      desktopEnvironment,
      bootstrapped: true,
    });
    window.desktopBridge = {
      getWsUrl: () => 'ws://127.0.0.1:7842/ws',
      pickDirectory: vi.fn(async () => '/tmp/glade/new-project'),
    };
  });

  afterEach(() => {
    cleanup();
    delete window.desktopBridge;
    vi.restoreAllMocks();
  });

  it('bootstraps a selected project and returns to the workspace', async () => {
    desktopBootstrapProject.mockResolvedValue({ success: true, result: bootstrappedEnvironment });
    sessionRestart.mockResolvedValue({ success: true, result: { _tag: 'AckResult' } });

    renderRoute();

    fireEvent.change(screen.getByPlaceholderText('/path/to/project'), {
      target: { value: '/tmp/glade/new-project' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create project/i }));

    await waitFor(() => {
      expect(desktopBootstrapProject).toHaveBeenCalledWith({ projectPath: '/tmp/glade/new-project' });
    });
    await waitFor(() => {
      expect(sessionRestart).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(window.location.pathname).toBe('/');
    });
  });

  it('shows bootstrap failures in the route when setup fails', async () => {
    desktopBootstrapProject.mockResolvedValue({
      success: false,
      error: {
        _tag: 'RpcError',
        code: 'project_bootstrap_failed',
        message: 'bg_init failed: directory is not empty',
      },
    });

    renderRoute();

    fireEvent.change(screen.getByPlaceholderText('/path/to/project'), {
      target: { value: '/tmp/glade/current-project' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Open project/i }));

    expect(await screen.findByText(/bg_init failed: directory is not empty/i)).toBeInTheDocument();
    expect(sessionRestart).not.toHaveBeenCalled();
  });

  it('fills the project path from the native directory picker', async () => {
    renderRoute();

    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('/path/to/project')).toHaveValue('/tmp/glade/new-project');
    });
  });
});
