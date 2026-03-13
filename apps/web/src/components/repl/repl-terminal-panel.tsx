import { useEffect, useEffectEvent, useRef } from 'react';
import { Copy, CornerDownLeft, ExternalLink, TerminalSquare, Trash2 } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

import {
  canDetachTerminal,
  readDesktopBridge,
  subscribeToDetachedTerminalState,
} from '../../lib/runtime';
import { terminalThemeFromApp, observeThemeChanges } from '../../lib/terminal-theme';
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
      theme: terminalThemeFromApp(),
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
    requestAnimationFrame(() => {
      fitTerminal();
      if (interactive) {
        terminal.focus();
      }
    });

    const initialLines = useReplStore.getState().replLines;
    if (initialLines.length === 0 && interactive) {
      terminal.writeln('\x1b[38;5;114mBayesgrove workspace terminal active.\x1b[0m');
      terminal.write('> ');
    } else {
      for (const line of initialLines) {
        writeLine(line);
      }
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

    const unobserveTheme = observeThemeChanges((theme) => {
      terminal.options.theme = theme;
    });

    return () => {
      unobserveTheme();
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
      <div className="flex h-full items-center justify-center border border-slate-200 bg-slate-50 px-6 text-center dark:border-slate-800/80 dark:bg-slate-950/80">
        <div className="max-w-md">
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-300/80">Detached terminal</p>
          <h3 className="mt-3 text-2xl font-semibold text-slate-900 dark:text-slate-100">REPL is open in a separate window.</h3>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
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
    <div className="relative h-full overflow-hidden border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-[#050b14] shadow-inner">
      <div ref={terminalHostRef} className="h-full min-h-0 w-full px-3 py-3" />
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
  const interactive = true;
  const resolvedPanelOpen = panelOpen ?? storedPanelOpen;
  const setResolvedPanelOpen = onPanelOpenChange ?? setStoredPanelOpen;
  const resolvedPanelHeight = panelHeight ?? storedPanelHeight;
  const setResolvedPanelHeight = onPanelHeightChange ?? setStoredPanelHeight;
  const resolvedPresentation = detachedView ? 'detached' : presentation;
  const detachable = canDetachTerminal() && !detachedView;

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
        'overflow-hidden border-t border-slate-200 bg-white/95 shadow-xl shadow-slate-200/50 backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/92 dark:shadow-2xl dark:shadow-slate-950/30',
        detachedView ? 'flex h-screen flex-col border-0 shadow-none' : 'flex flex-col',
        resolvedPresentation === 'overlay' && 'absolute inset-x-4 bottom-[var(--workflow-repl-bottom-offset)] z-20 sm:left-auto sm:w-[var(--workflow-repl-overlay-max-width)] rounded-t-xl',
      )}
      style={detachedView ? undefined : { height: replDetached ? 260 : resolvedPanelHeight }}
    >
      {!detachedView ? (
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100/50 px-3 py-1.5 dark:border-slate-800/80 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <TerminalSquare className="size-3.5 text-slate-400" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Workspace Terminal</span>
          </div>
          <button
            aria-label="Resize terminal"
            className="flex-1 cursor-row-resize py-1"
            data-repl-resize-handle="true"
            type="button"
          >
            <div className="mx-auto h-1 w-12 rounded-full bg-slate-300 dark:bg-slate-700" />
          </button>
          {!detachedView ? (
            <Button className="h-6 gap-1 border-0 bg-transparent px-2 text-xs text-slate-500 hover:bg-slate-200/50 hover:text-slate-900 dark:hover:bg-slate-800/50 dark:hover:text-white" onClick={() => setResolvedPanelOpen(false)} variant="ghost">
              <CornerDownLeft className="size-3" />
              Hide
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-row">
        <div className={['min-w-0 flex-1 p-0 border-r border-slate-200 dark:border-slate-800/80', detachedView ? 'pt-0' : ''].join(' ').trim()}>
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

        <aside className="flex w-56 flex-col bg-slate-50/50 p-4 dark:bg-slate-950/50">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Shared R session</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Run ad hoc checks in the live Bayesgrove session.</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-300">
              interactive
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-300">
              {sessionState}
            </span>
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <Button className="w-full justify-start gap-2 border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white" onClick={() => void handleClear()} variant="ghost">
              <Trash2 className="size-3.5" />
              <span className="text-xs">Clear output</span>
            </Button>
            <Button className="w-full justify-start gap-2 border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white" onClick={() => void handleCopyLogs()} variant="ghost">
              <Copy className="size-3.5" />
              <span className="text-xs">Copy output</span>
            </Button>
            {detachable ? (
              <Button
                className="w-full justify-start gap-2 border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
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
                <ExternalLink className="size-3.5" />
                <span className="text-xs">Detach window</span>
              </Button>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
