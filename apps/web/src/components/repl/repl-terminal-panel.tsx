import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { CornerDownLeft, ExternalLink, TerminalSquare, Trash2 } from 'lucide-react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';

import type { CommandResult, WorkflowCommand } from '@glade/contracts';

import {
  canDetachTerminal,
  isDesktopRuntime,
  readDesktopRuntime,
  subscribeToDetachedTerminalState,
} from '../../lib/runtime';
import { useAppStore } from '../../store/app';
import { Button } from '../ui/button';

interface ReplTerminalPanelProps {
  readonly dispatchCommand: (command: WorkflowCommand) => Promise<CommandResult>;
  readonly detachedView?: boolean;
}

function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }

  return element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element.isContentEditable;
}

function openDetachedTerminalFallback() {
  window.open('/?terminal=detached', '_blank', 'popup,width=980,height=620');
}

function TerminalSurface({
  dispatchCommand,
  interactive,
  detachedView,
}: {
  readonly dispatchCommand: (command: WorkflowCommand) => Promise<CommandResult>;
  readonly interactive: boolean;
  readonly detachedView: boolean;
}) {
  const replLines = useAppStore((state) => state.replLines);
  const replDetached = useAppStore((state) => state.replDetached);
  const sessionState = useAppStore((state) => state.sessionState);
  const sessionReason = useAppStore((state) => state.sessionReason);
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const renderedLineCountRef = useRef(0);
  const inputBufferRef = useRef('');

  const writeLine = useEffectEvent((line: string) => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    if (line === '\f') {
      terminal.clear();
      inputBufferRef.current = '';
      return;
    }

    terminal.writeln(line);
  });

  useEffect(() => {
    if (!terminalHostRef.current) {
      return;
    }

    const terminal = new Terminal({
      cursorBlink: interactive,
      convertEol: true,
      disableStdin: !interactive,
      fontFamily: '"IBM Plex Mono", "Fira Code", monospace',
      fontSize: 13,
      scrollback: 10_000,
      theme: {
        background: '#050b14',
        foreground: '#d7e5f2',
        cursor: '#8ef0b6',
        selectionBackground: 'rgba(86, 173, 120, 0.35)',
        black: '#050b14',
        red: '#ff7b72',
        green: '#7ee787',
        yellow: '#f2cc60',
        blue: '#79c0ff',
        magenta: '#d2a8ff',
        cyan: '#76e3ea',
        white: '#d7e5f2',
        brightBlack: '#768390',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#39c5cf',
        brightWhite: '#f0f6fc',
      },
    });
    const fitAddon = new FitAddon();
    terminalRef.current = terminal;
    terminal.loadAddon(fitAddon);
    terminal.open(terminalHostRef.current);

    let fitDisabled = false;
    const fitTerminal = () => {
      const host = terminalHostRef.current;
      if (!host || fitDisabled || host.clientWidth === 0 || host.clientHeight === 0) {
        return;
      }

      try {
        fitAddon.fit();
      } catch (error) {
        fitDisabled = true;
        console.warn('[repl] xterm fit disabled after initialization failure', error);
      }
    };
    requestAnimationFrame(() => fitTerminal());

    const initialLines = useAppStore.getState().replLines;
    for (const line of initialLines) {
      writeLine(line);
    }
    renderedLineCountRef.current = initialLines.length;

    const resizeObserver = new ResizeObserver(() => {
      fitTerminal();
    });
    resizeObserver.observe(terminalHostRef.current);

    const terminalDisposable = interactive
      ? terminal.onData((data) => {
        if (data === '\r') {
          terminal.write('\r\n');
          const payload = `${inputBufferRef.current}\n`;
          inputBufferRef.current = '';
          void dispatchCommand({ type: 'ReplInput', data: payload });
          return;
        }

        if (data === '\u007f') {
          if (inputBufferRef.current.length === 0) {
            return;
          }
          inputBufferRef.current = inputBufferRef.current.slice(0, -1);
          terminal.write('\b \b');
          return;
        }

        if (data === '\u0003') {
          inputBufferRef.current = '';
          terminal.write('^C\r\n');
          return;
        }

        if (data >= ' ' || data === '\t') {
          inputBufferRef.current += data;
          terminal.write(data);
        }
      })
      : { dispose() {} };

    return () => {
      terminalDisposable.dispose();
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      renderedLineCountRef.current = 0;
      inputBufferRef.current = '';
    };
  }, [dispatchCommand, interactive, writeLine]);

  useEffect(() => {
    for (const line of replLines.slice(renderedLineCountRef.current)) {
      writeLine(line);
    }
    renderedLineCountRef.current = replLines.length;
  }, [replLines, writeLine]);

  if (replDetached && !detachedView) {
    return (
      <div className="flex h-full items-center justify-center rounded-[1.5rem] border border-slate-800/80 bg-slate-950/80 px-6 text-center">
        <div className="max-w-md">
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-300/80">Detached terminal</p>
          <h3 className="mt-3 text-2xl font-semibold text-slate-100">REPL is open in a separate window.</h3>
          <p className="mt-3 text-sm text-slate-400">
            Close that window to return the terminal here, or focus it again from this view.
          </p>
          <div className="mt-5 flex justify-center">
            <Button onClick={() => void readDesktopRuntime()?.openDetachedTerminal?.()}>
              <ExternalLink className="size-4" />
              Focus detached window
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden rounded-[1.5rem] border border-slate-800/80 bg-[#050b14]">
      <div ref={terminalHostRef} className="h-full min-h-0 w-full px-3 py-3" />
      {!interactive ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#050b14] via-[#050b14]/95 to-transparent px-4 py-3 text-xs text-amber-200">
          Interactive REPL unavailable in hosted mode. Console output remains visible for this session.
        </div>
      ) : null}
      {sessionState === 'error' ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-rose-950/80 px-4 py-2 text-xs text-rose-100">
          Session error{sessionReason ? `: ${sessionReason}` : ''}.
        </div>
      ) : null}
    </div>
  );
}

export function ReplTerminalPanel({ dispatchCommand, detachedView = false }: ReplTerminalPanelProps) {
  const replPanelOpen = useAppStore((state) => state.replPanelOpen);
  const setReplPanelOpen = useAppStore((state) => state.setReplPanelOpen);
  const replPanelHeight = useAppStore((state) => state.replPanelHeight);
  const setReplPanelHeight = useAppStore((state) => state.setReplPanelHeight);
  const replDetached = useAppStore((state) => state.replDetached);
  const setReplDetached = useAppStore((state) => state.setReplDetached);
  const sessionState = useAppStore((state) => state.sessionState);
  const [interactive, setInteractive] = useState(() => isDesktopRuntime());
  const detachable = interactive && canDetachTerminal() && !detachedView;

  useEffect(() => {
    const syncRuntime = () => {
      setInteractive(isDesktopRuntime());
    };

    syncRuntime();
    const timeout = window.setTimeout(syncRuntime, 250);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (detachedView) {
      return;
    }

    return subscribeToDetachedTerminalState((isDetached) => {
      setReplDetached(isDetached);
    });
  }, [detachedView, setReplDetached]);

  useEffect(() => {
    if (detachedView) {
      setReplDetached(true);
      return () => setReplDetached(false);
    }
  }, [detachedView, setReplDetached]);

  useEffect(() => {
    if (detachedView) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === '`') {
        event.preventDefault();
        setReplPanelOpen(!useAppStore.getState().replPanelOpen);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [detachedView, setReplPanelOpen]);

  useEffect(() => {
    if (detachedView || !replPanelOpen || replDetached) {
      return;
    }

    const onMouseMove = (event: MouseEvent) => {
      setReplPanelHeight(window.innerHeight - event.clientY - 24);
    };
    const stopResizing = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', stopResizing);
    };
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-repl-resize-handle="true"]')) {
        return;
      }
      event.preventDefault();
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', stopResizing);
    };

    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      stopResizing();
    };
  }, [detachedView, replDetached, replPanelOpen, setReplPanelHeight]);

  const handleClear = async () => {
    await dispatchCommand({ type: 'ClearRepl' });
  };

  if (!detachedView && !replPanelOpen) {
    return (
      <div className="rounded-[1.5rem] border border-slate-800/80 bg-slate-950/80 px-4 py-3 shadow-xl shadow-slate-950/30">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 p-2 text-emerald-200">
              <TerminalSquare className="size-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-100">REPL terminal hidden</p>
              <p className="text-xs text-slate-400">Press `Ctrl+\`` to reopen it.</p>
            </div>
          </div>
          <Button onClick={() => setReplPanelOpen(true)}>
            <CornerDownLeft className="size-4" />
            Open terminal
          </Button>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label={detachedView ? 'Detached REPL terminal' : 'REPL terminal'}
      className={[
        'overflow-hidden rounded-[1.75rem] border border-slate-800/80 bg-slate-950/70 shadow-2xl shadow-slate-950/40 backdrop-blur',
        detachedView ? 'flex h-screen flex-col rounded-none border-0 shadow-none' : 'flex flex-col',
      ].join(' ')}
      style={detachedView ? undefined : { height: replDetached ? 260 : replPanelHeight }}
    >
      {!detachedView ? (
        <button
          aria-label="Resize terminal"
          className="h-4 cursor-row-resize bg-[linear-gradient(90deg,rgba(34,197,94,0.05),rgba(56,189,248,0.16),rgba(34,197,94,0.05))]"
          data-repl-resize-handle="true"
          type="button"
        />
      ) : null}
      <header className="flex items-center justify-between gap-4 border-b border-slate-800/80 px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-emerald-300/80">Phase 7 terminal</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">
            {interactive ? 'Shared R session' : 'Console output'}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-slate-700/80 px-3 py-1 text-xs text-slate-300">
            {interactive ? 'interactive' : 'read-only'}
          </span>
          <span className="rounded-full border border-slate-700/80 px-3 py-1 text-xs text-slate-300">
            session {sessionState}
          </span>
          <Button onClick={() => void handleClear()} variant="ghost">
            <Trash2 className="size-4" />
            Clear
          </Button>
          {detachable ? (
            <Button
              onClick={async () => {
                const opened = await readDesktopRuntime()?.openDetachedTerminal?.();
                if (!opened) {
                  openDetachedTerminalFallback();
                }
                if (opened) {
                  setReplDetached(true);
                }
              }}
              variant="ghost"
            >
              <ExternalLink className="size-4" />
              Detach
            </Button>
          ) : null}
          {!detachedView ? (
            <Button onClick={() => setReplPanelOpen(false)} variant="ghost">
              Hide
            </Button>
          ) : null}
        </div>
      </header>
      <div className={['min-h-0 flex-1 p-4', detachedView ? 'pt-6' : ''].join(' ').trim()}>
        <TerminalSurface
          detachedView={detachedView}
          dispatchCommand={dispatchCommand}
          interactive={interactive}
        />
      </div>
    </section>
  );
}
