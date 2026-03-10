// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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

describe('SettingsRoute', () => {
  beforeEach(() => {
    useConnectionStore.setState({
      serverConnected: true,
      serverVersion: '0.11.7-server',
      sessionState: 'ready',
      sessionReason: null,
      runtime: 'desktop',
      hostedMode: false,
      projectPath: '/tmp/glade/project',
      desktopEnvironment,
      bootstrapped: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the app version separately from the server status', () => {
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

    expect(screen.getByText(`App ${APP_VERSION}`)).toBeInTheDocument();
    expect(screen.getByText('Server 0.11.7-server · connected · session ready')).toBeInTheDocument();
  });
});
