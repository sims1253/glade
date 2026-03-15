// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReplTerminalPanel } from './repl-terminal-panel';
import { useAppStore } from '../../store/app';
import { useReplStore } from '../../store/repl';

const dispatchCommand = vi.fn();
const fitMock = vi.fn();
const terminalInstances: Array<{
  readonly write: ReturnType<typeof vi.fn>;
  readonly writeln: ReturnType<typeof vi.fn>;
  onDataHandler: ((data: string) => void) | null;
}> = [];

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    constructor() {
      terminalInstances.push({
        write: this.write,
        writeln: this.writeln,
        onDataHandler: null,
      });
    }

    loadAddon = vi.fn();
    open = vi.fn();
    focus = vi.fn();
    write = vi.fn();
    writeln = vi.fn();
    clear = vi.fn();
    onData = vi.fn((handler: (data: string) => void) => {
      const instance = terminalInstances.at(-1);
      if (instance) {
        instance.onDataHandler = handler;
      }
      return { dispose: vi.fn() };
    });
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

describe('ReplTerminalPanel', () => {
  beforeEach(() => {
    dispatchCommand.mockReset();
    dispatchCommand.mockResolvedValue({ type: 'CommandResult', id: 'cmd', success: true });
    fitMock.mockReset();
    terminalInstances.length = 0;
    useAppStore.setState({
      serverConnected: true,
      serverVersion: '0.7.0',
      sessionState: 'ready',
      sessionReason: null,
      notifications: [],
      replLines: ['[1] 2'],
      rawLines: ['__GLADE_READY__', '{"protocol_version":"0.1.0"}'],
      replPanelOpen: true,
      replPanelHeight: 320,
      replDetached: false,
    });
    useReplStore.setState({ commandHistory: [] });
    vi.stubGlobal('ResizeObserver', class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    delete window.desktopBridge;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders the interactive session terminal and clears via command', async () => {
    render(<ReplTerminalPanel dispatchCommand={dispatchCommand} />);

    expect(screen.getByText('Shared R session')).toBeInTheDocument();
    expect(screen.getByText('interactive')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Clear/i }));

    await waitFor(() =>
      expect(dispatchCommand).toHaveBeenCalledWith({ type: 'ClearRepl' }),
    );
  });

  it('switches to the process log tab and clears only raw output locally', async () => {
    render(<ReplTerminalPanel dispatchCommand={dispatchCommand} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Process Log' }));

    expect(screen.getByText('Raw R process output')).toBeInTheDocument();
    expect(screen.getByText('read only')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Clear output/i }));

    await waitFor(() => {
      expect(useAppStore.getState().rawLines).toEqual([]);
    });
    expect(dispatchCommand).not.toHaveBeenCalled();
    expect(useAppStore.getState().replLines).toEqual(['[1] 2']);
  });

  it('toggles closed and reopened with the keyboard shortcut', () => {
    render(<ReplTerminalPanel dispatchCommand={dispatchCommand} />);

    fireEvent.keyDown(window, { key: '`', ctrlKey: true });
    expect(screen.getByText('REPL terminal hidden')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: '`', ctrlKey: true });
    expect(screen.getByText('Shared R session')).toBeInTheDocument();
  });

  it('falls back to the /terminal route when native detach fails', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    (window as Window & { desktopBridge: NonNullable<typeof window.desktopBridge> }).desktopBridge = {
      getWsUrl: () => 'ws://127.0.0.1:7842/ws',
      openDetachedTerminal: vi.fn(async () => false),
    };

    useAppStore.setState({
      replDetached: false,
    });

    render(<ReplTerminalPanel dispatchCommand={dispatchCommand} />);

    fireEvent.click(screen.getByRole('button', { name: /Detach/i }));

    try {
      await waitFor(() => {
        expect(openSpy).toHaveBeenCalledWith('/terminal', '_blank', 'popup,width=980,height=620');
      });
    } finally {
      openSpy.mockRestore();
    }
  });

  it('persists submitted commands and reuses them with the up-arrow history key', async () => {
    render(<ReplTerminalPanel dispatchCommand={dispatchCommand} />);

    const terminal = terminalInstances[0];
    act(() => {
      terminal?.onDataHandler?.('1 + 1');
      terminal?.onDataHandler?.('\r');
    });

    await waitFor(() => {
      expect(dispatchCommand).toHaveBeenCalledWith({ type: 'ReplInput', data: '1 + 1\n' });
    });
    expect(useReplStore.getState().replLines).toContain('> 1 + 1');
    expect(useReplStore.getState().rawLines).toContain('> 1 + 1');

    act(() => {
      terminal?.onDataHandler?.('\u001b[A');
    });

    expect(terminal?.write).toHaveBeenCalledWith('1 + 1');
  });
});
