// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReplTerminalPanel } from './repl-terminal-panel';
import { useAppStore } from '../../store/app';

const dispatchCommand = vi.fn();
const fitMock = vi.fn();

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

describe('ReplTerminalPanel', () => {
  beforeEach(() => {
    dispatchCommand.mockReset();
    dispatchCommand.mockResolvedValue({ type: 'CommandResult', id: 'cmd', success: true });
    fitMock.mockReset();
    useAppStore.setState({
      serverConnected: true,
      serverVersion: '0.7.0',
      sessionState: 'ready',
      sessionReason: null,
      notifications: [],
      replLines: ['[1] 2'],
      replPanelOpen: true,
      replPanelHeight: 320,
      replDetached: false,
    });
    vi.stubGlobal('ResizeObserver', class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.stubGlobal('__GLADE_DESKTOP__', undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders the hosted read-only state and clears via command', async () => {
    render(<ReplTerminalPanel dispatchCommand={dispatchCommand} />);

    expect(screen.getByText('Console output')).toBeInTheDocument();
    expect(screen.getByText(/Interactive REPL unavailable in hosted mode/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Clear/i }));

    await waitFor(() =>
      expect(dispatchCommand).toHaveBeenCalledWith({ type: 'ClearRepl' }),
    );
  });

  it('toggles closed and reopened with the keyboard shortcut', () => {
    render(<ReplTerminalPanel dispatchCommand={dispatchCommand} />);

    fireEvent.keyDown(window, { key: '`', ctrlKey: true });
    expect(screen.getByText('REPL terminal hidden')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: '`', ctrlKey: true });
    expect(screen.getByText('Console output')).toBeInTheDocument();
  });
});
