import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Copy, CornerDownLeft, ExternalLink, TerminalSquare, Trash2 } from 'lucide-react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';

import {
  canDetachTerminal,
  isDesktopRuntime,
  readDesktopBridge,
  subscribeToDetachedTerminalState,
} from '../../lib/runtime';
import type { LegacyWorkflowDispatch } from '../../lib/legacy-commands';
import { replRpcFromLegacyDispatch } from '../../lib/legacy-commands';
import type { ReplRpc } from '../../lib/rpc';
import {
  clampWorkflowReplHeight,
  getWorkflowReplHeightFromPointer,
} from '../../lib/workflow-workspace';
import { useConnectionStore } from '../../store/connection';
import { useReplStore } from '../../store/repl';
import { useUiPrefsStore } from '../../store/ui-prefs';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

type ReplTerminalPresentation = 'docked' | 'overlay';

interface ReplTerminalPanelProps {
  readonly repl?: ReplRpc;
  readonly dispatchCommand?: LegacyWorkflowDispatch;
  readonly detachedView?: boolean;
  readonly presentation?: ReplTerminalPresentation;
  readonly panelOpen?: boolean;
  readonly onPanelOpenChange?: (open: boolean) => void;
  readonly panelHeight?: number;
  readonly onPanelHeightChange?: (height: number) => void;
  readonly resizeContainer?: HTMLElement | null;
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
  window.open('/terminal', '_blank', 'popup,width=980,height=620');
}

function TerminalSurface({
  repl,
  interactive,
  detachedView,
}: {
  readonly repl: ReplRpc;
  readonly interactive: boolean;
  readonly detachedView: boolean;
}) {
  const replLines = useReplStore((state) => state.replLines);
  const replDetached = useReplStore((state) => state.replDetached);
  const sessionState = useConnectionStore((state) => state.sessionState);
  const sessionReason = useConnectionStore((state) => state.sessionReason);
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

    const initialLines = useReplStore.getState().replLines;
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
          void repl.write(payload);
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
  }, [interactive, repl, writeLine]);

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
            <Button onClick={() => void readDesktopBridge()?.openDetachedTerminal?.()}>
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

export function ReplTerminalPanel({
  repl,
  dispatchCommand,
  detachedView = false,
  presentation = 'docked',
  panelOpen,
  onPanelOpenChange,
  panelHeight,
  onPanelHeightChange,
  resizeContainer,
}: ReplTerminalPanelProps) {
  const replClient = repl ?? (dispatchCommand ? replRpcFromLegacyDispatch(dispatchCommand) : null);
  const storedPanelOpen = useUiPrefsStore((state) => state.replPanelOpen);
  const setStoredPanelOpen = useUiPrefsStore((state) => state.setReplPanelOpen);
  const storedPanelHeight = useUiPrefsStore((state) => state.replPanelHeight);
  const setStoredPanelHeight = useUiPrefsStore((state) => state.setReplPanelHeight);
  const replDetached = useReplStore((state) => state.replDetached);
  const setReplDetached = useReplStore((state) => state.setReplDetached);
  const replLines = useReplStore((state) => state.replLines);
  const sessionState = useConnectionStore((state) => state.sessionState);
  const [interactive, setInteractive] = useState(() => isDesktopRuntime());
  const resolvedPanelOpen = panelOpen ?? storedPanelOpen;
  const setResolvedPanelOpen = onPanelOpenChange ?? setStoredPanelOpen;
  const resolvedPanelHeight = panelHeight ?? storedPanelHeight;
  const setResolvedPanelHeight = onPanelHeightChange ?? setStoredPanelHeight;
  const resolvedPresentation = detachedView ? 'detached' : presentation;
  const detachable = interactive && canDetachTerminal() && !detachedView;

  const getResizeBounds = () => {
    const fallbackRect = {
      bottom: window.innerHeight,
      height: window.innerHeight,
      top: 0,
    };
    const container = resizeContainer;
    const containerRect = container?.getBoundingClientRect() ?? fallbackRect;
    const styleSource = container ? window.getComputedStyle(container) : window.getComputedStyle(document.documentElement);
    const minHeight = Number.parseFloat(styleSource.getPropertyValue('--workflow-repl-min-height')) || 180;
    const maxHeight = Number.parseFloat(styleSource.getPropertyValue('--workflow-repl-max-height')) || 640;
    const overlayMaxHeight = Number.parseFloat(styleSource.getPropertyValue('--workflow-repl-overlay-max-height')) || 420;
    const bottomOffset = Number.parseFloat(styleSource.getPropertyValue('--workflow-repl-bottom-offset')) || 24;
    const availableHeight = resolvedPresentation === 'overlay'
      ? Math.max(minHeight, Math.min(overlayMaxHeight, containerRect.height - (bottomOffset * 2)))
      : Math.max(minHeight, containerRect.height - 160);

    return {
      availableHeight,
      bottomOffset,
      containerBottom: containerRect.bottom,
      maxHeight: resolvedPresentation === 'overlay' ? Math.min(maxHeight, overlayMaxHeight) : maxHeight,
      minHeight,
    };
  };

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
        setResolvedPanelOpen(!resolvedPanelOpen);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [detachedView, resolvedPanelOpen, setResolvedPanelOpen]);

  useEffect(() => {
    if (detachedView) {
      return;
    }

    const bounds = getResizeBounds();
    setResolvedPanelHeight(clampWorkflowReplHeight({
      height: resolvedPanelHeight,
      minHeight: bounds.minHeight,
      maxHeight: bounds.maxHeight,
      availableHeight: bounds.availableHeight,
    }));
  }, [detachedView, resizeContainer, resolvedPanelHeight, resolvedPresentation, setResolvedPanelHeight]);

  useEffect(() => {
    if (detachedView || !resolvedPanelOpen || replDetached) {
      return;
    }

    const onMouseMove = (event: MouseEvent) => {
      const bounds = getResizeBounds();
      setResolvedPanelHeight(getWorkflowReplHeightFromPointer({
        containerBottom: bounds.containerBottom,
        pointerClientY: event.clientY,
        bottomOffset: bounds.bottomOffset,
        minHeight: bounds.minHeight,
        maxHeight: bounds.maxHeight,
        availableHeight: bounds.availableHeight,
      }));
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
  }, [detachedView, replDetached, resolvedPanelOpen, resizeContainer, resolvedPresentation, setResolvedPanelHeight]);

  const handleClear = async () => {
    try {
      await replClient?.clear();
    } catch (error) {
      console.error('[repl] failed to clear terminal', error);
    }
  };

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(replLines.join('\n'));
    } catch (error) {
      console.error('[repl] failed to copy terminal output', error);
    }
  };

  if (!detachedView && !resolvedPanelOpen) {
    return (
      <div
        className={cn(
          'rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3 shadow-[0_18px_36px_-28px_rgba(15,23,42,0.28)]',
          resolvedPresentation === 'overlay' && 'absolute inset-x-4 bottom-[var(--workflow-repl-bottom-offset)] z-20 sm:left-auto sm:w-[26rem]',
        )}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full border border-sky-200 bg-sky-50 p-2 text-sky-700">
              <TerminalSquare className="size-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">REPL terminal hidden</p>
              <p className="text-xs text-slate-500">Press `Ctrl+\`` to reopen it.</p>
            </div>
          </div>
          <Button onClick={() => setResolvedPanelOpen(true)}>
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
      className={cn(
        'overflow-hidden rounded-[1.75rem] border border-slate-800/80 bg-slate-950/92 shadow-2xl shadow-slate-950/30 backdrop-blur',
        detachedView ? 'flex h-screen flex-col rounded-none border-0 shadow-none' : 'flex flex-col',
        resolvedPresentation === 'overlay' && 'absolute inset-x-4 bottom-[var(--workflow-repl-bottom-offset)] z-20 sm:left-auto sm:w-[var(--workflow-repl-overlay-max-width)]',
      )}
      style={detachedView ? undefined : { height: replDetached ? 260 : resolvedPanelHeight }}
    >
      {!detachedView ? (
        <button
          aria-label="Resize terminal"
          className="h-4 cursor-row-resize bg-[linear-gradient(90deg,rgba(34,197,94,0.05),rgba(56,189,248,0.16),rgba(34,197,94,0.05))]"
          data-repl-resize-handle="true"
          type="button"
        />
      ) : null}
      <header className="flex items-center justify-between gap-4 border-b border-slate-800/80 bg-slate-950/95 px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-sky-300/80">Workspace terminal</p>
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
          <Button className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800 hover:text-white" onClick={() => void handleClear()} variant="ghost">
            <Trash2 className="size-4" />
            Clear
          </Button>
          <Button className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800 hover:text-white" onClick={() => void handleCopyLogs()} variant="ghost">
            <Copy className="size-4" />
            Copy logs
          </Button>
          {detachable ? (
            <Button
              className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800 hover:text-white"
              onClick={async () => {
                const opened = await readDesktopBridge()?.openDetachedTerminal?.();
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
            <Button className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800 hover:text-white" onClick={() => setResolvedPanelOpen(false)} variant="ghost">
              Hide
            </Button>
          ) : null}
        </div>
      </header>
      <div className={['min-h-0 flex-1 p-4', detachedView ? 'pt-6' : ''].join(' ').trim()}>
        <TerminalSurface
          detachedView={detachedView}
          repl={replClient ?? replRpcFromLegacyDispatch(async () => ({
            type: 'CommandResult',
            id: 'missing-repl',
            success: false,
            error: {
              code: 'missing_repl_client',
              message: 'No REPL client was provided.',
            },
          }))}
          interactive={interactive}
        />
      </div>
    </section>
  );
}
