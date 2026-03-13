// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DesktopEnvironmentState } from '@glade/contracts';

import { APP_VERSION } from '../lib/app-version';
import { ServerSessionProvider } from '../lib/server-session-context';
import { useConnectionStore } from '../store/connection';
import { SettingsRoute } from './settings';

vi.mock('../hooks/useRpcClient', () => ({
  useRpcClient: () => ({
    desktop: {
      getEnvironment: vi.fn(),
      refreshEnvironment: vi.fn(),
      saveSettings: vi.fn(),
      resetSettings: vi.fn(),
      bootstrapProject: vi.fn(),
    },
    workflow: {
      addNode: vi.fn(),
      deleteNode: vi.fn(),
      connectNodes: vi.fn(),
      renameNode: vi.fn(),
      recordDecision: vi.fn(),
      executeAction: vi.fn(),
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
    reconnect: vi.fn(),
  }),
}));

const desktopEnvironment: DesktopEnvironmentState = {
  settings: {
    rExecutablePath: '/usr/bin/Rscript',
    editorCommand: 'auto',
    updateChannel: 'stable',
  },
  preflight: {
    checkedAt: '2026-03-10T10:00:00.000Z',
    projectPath: '/tmp/glade/project',
    status: 'ok',
    issues: [],
  },
};

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ServerSessionProvider>{children}</ServerSessionProvider>
    </QueryClientProvider>
  );

  render(<SettingsRoute />, { wrapper });
}

describe('SettingsRoute', () => {
  beforeEach(() => {
    useConnectionStore.setState({
      serverConnected: true,
      serverVersion: '0.11.7-server',
      sessionState: 'ready',
      sessionReason: null,
      projectPath: '/tmp/glade/project',
      desktopEnvironment,
      bootstrapped: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the app version separately from the server status', () => {
    renderSettings();

    expect(screen.getByText(`App ${APP_VERSION}`)).toBeInTheDocument();
    expect(screen.getByText('Server 0.11.7-server · connected · session ready')).toBeInTheDocument();
  });

  it('shows actionable project preparation diagnostics when preflight fails', () => {
    useConnectionStore.setState({
      desktopEnvironment: {
        ...desktopEnvironment,
        preflight: {
          ...desktopEnvironment.preflight,
          status: 'action_required',
          issues: [
            {
              code: 'project_bootstrap_failed',
              title: 'Could not prepare the local bayesgrove project',
              description: 'R exited with status 11 while opening or initializing the project directory. bg_open failed: existing path is not a bayesgrove project bg_init failed: directory is not empty',
            },
          ],
        },
      },
    });

    renderSettings();

    expect(screen.getByText('Bayesgrove desktop checks need attention')).toBeInTheDocument();
    expect(screen.getByText(/bg_open failed: existing path is not a bayesgrove project/i)).toBeInTheDocument();
    expect(screen.getByText(/bg_init failed: directory is not empty/i)).toBeInTheDocument();
  });
});
