import { useEffect, useEffectEvent, useRef, useState } from 'react';
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
type ReplTerminalTab = 'console' | 'process-log';
const MAX_RENDERED_REPL_LINES = 500;

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
  lines,
  interactive,
  detachedView,
  active,
}: {
  readonly repl: ReplRpc;
  readonly lines: ReadonlyArray<string>;
  readonly interactive: boolean;
  readonly detachedView: boolean;
  readonly active: boolean;
}) {
  const appendLine = useReplStore((state) => state.appendLine);
  const appendRawLine = useReplStore((state) => state.appendRawLine);
  const appendCommandHistory = useReplStore((state) => state.appendCommandHistory);
  const commandHistory = useReplStore((state) => state.commandHistory);
  const replDetached = useReplStore((state) => state.replDetached);
  const sessionState = useConnectionStore((state) => state.sessionState);
  const sessionReason = useConnectionStore((state) => state.sessionReason);
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitTerminalRef = useRef<(() => void) | null>(null);
  const renderedLineCountRef = useRef(0);
  const inputBufferRef = useRef('');
  const commandHistoryRef = useRef(commandHistory);
  const promptVisibleRef = useRef(false);
  const historyIndexRef = useRef<number | null>(null);
  const historyDraftRef = useRef('');
  const completionStateRef = useRef<{
    readonly prefix: string;
    readonly candidates: ReadonlyArray<string>;
    readonly nextIndex: number;
  } | null>(null);

  const ensurePromptVisible = () => {
    const terminal = terminalRef.current;
    if (!terminal || promptVisibleRef.current) {
      return;
    }

    terminal.write('> ');
    promptVisibleRef.current = true;
  };

  const clearIdlePrompt = () => {
    const terminal = terminalRef.current;
    if (!terminal || !promptVisibleRef.current || inputBufferRef.current.length > 0) {
      return;
    }

    terminal.write('\u001b[2K\r');
    promptVisibleRef.current = false;
  };

  const resetCompletion = () => {
    completionStateRef.current = null;
  };

  const replaceInputBuffer = (nextValue: string) => {
    const terminal = terminalRef.current;
    if (!terminal) {
      inputBufferRef.current = nextValue;
      return;
    }

    ensurePromptVisible();
    for (let index = 0; index < inputBufferRef.current.length; index += 1) {
      terminal.write('\b \b');
    }
    inputBufferRef.current = nextValue;
    if (nextValue.length > 0) {
      terminal.write(nextValue);
    }
  };

  const writeLine = useEffectEvent((line: string) => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    if (line === '\f') {
      terminal.clear();
      inputBufferRef.current = '';
      promptVisibleRef.current = false;
      historyIndexRef.current = null;
      historyDraftRef.current = '';
      resetCompletion();
      if (interactive) {
        terminal.writeln('\x1b[38;5;114mBayesgrove workspace terminal active.\x1b[0m');
        ensurePromptVisible();
      }
      return;
    }

    clearIdlePrompt();
    terminal.writeln(line);
  });

  useEffect(() => {
    commandHistoryRef.current = commandHistory;
  }, [commandHistory]);

  useEffect(() => {
    if (!terminalHostRef.current) {
      return;
    }

    const renderInteractivePrompt = () => {
      terminal.writeln('\x1b[38;5;114mBayesgrove workspace terminal active.\x1b[0m');
      promptVisibleRef.current = false;
      ensurePromptVisible();
    };

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
    fitTerminalRef.current = fitTerminal;
    requestAnimationFrame(() => {
      fitTerminal();
      if (interactive && active) {
        terminal.focus();
      }
    });

    const initialLines = lines;
    if (initialLines.length === 0 && interactive) {
      renderInteractivePrompt();
    } else {
      for (const line of initialLines) {
        writeLine(line);
      }
      if (interactive && inputBufferRef.current.length === 0) {
        ensurePromptVisible();
      }
    }
    renderedLineCountRef.current = initialLines.length;

    const resizeObserver = new ResizeObserver(() => {
      fitTerminal();
    });
    resizeObserver.observe(terminalHostRef.current);

    const terminalDisposable = interactive
      ? terminal.onData((data) => {
        const navigateHistory = (direction: 'previous' | 'next') => {
          const history = commandHistoryRef.current;
          if (history.length === 0) {
            return;
          }

          if (direction === 'previous') {
            if (historyIndexRef.current === null) {
              historyDraftRef.current = inputBufferRef.current;
              historyIndexRef.current = history.length - 1;
            } else {
              historyIndexRef.current = Math.max(0, historyIndexRef.current - 1);
            }

            replaceInputBuffer(history[historyIndexRef.current] ?? '');
            resetCompletion();
            return;
          }

          if (historyIndexRef.current === null) {
            return;
          }

          if (historyIndexRef.current >= history.length - 1) {
            historyIndexRef.current = null;
            replaceInputBuffer(historyDraftRef.current);
          } else {
            historyIndexRef.current += 1;
            replaceInputBuffer(history[historyIndexRef.current] ?? historyDraftRef.current);
          }
          resetCompletion();
        };

        const completeFromHistory = () => {
          const prefix = inputBufferRef.current;
          if (prefix.trim().length === 0) {
            return;
          }

          const previous = completionStateRef.current;
          const history = commandHistoryRef.current;
          const candidates = previous?.prefix === prefix
            ? previous.candidates
            : [...new Set([...history].reverse().filter((entry) => entry.startsWith(prefix) && entry !== prefix))];

          if (candidates.length === 0) {
            return;
          }

          const nextIndex = previous?.prefix === prefix ? previous.nextIndex % candidates.length : 0;
          const nextValue = candidates[nextIndex] ?? prefix;
          replaceInputBuffer(nextValue);
          completionStateRef.current = {
            prefix,
            candidates,
            nextIndex: (nextIndex + 1) % candidates.length,
          };
        };

        const appendInput = (chunk: string) => {
          ensurePromptVisible();
          inputBufferRef.current += chunk;
          terminal.write(chunk);
          historyIndexRef.current = null;
          resetCompletion();
        };

        if (data === '\r') {
          const command = inputBufferRef.current;
          terminal.write('\r\n');
          promptVisibleRef.current = false;
          historyIndexRef.current = null;
          historyDraftRef.current = '';
          resetCompletion();
          if (command.trim().length > 0) {
            appendLine(`> ${command}`);
            appendRawLine(`> ${command}`);
            appendCommandHistory(command);
            renderedLineCountRef.current = Math.min(renderedLineCountRef.current + 1, MAX_RENDERED_REPL_LINES);
          }
          const payload = `${command}\n`;
          inputBufferRef.current = '';
          ensurePromptVisible();
          void repl.write(payload);
          return;
        }

        if (data === '\u007f') {
          if (inputBufferRef.current.length === 0) {
            return;
          }
          inputBufferRef.current = inputBufferRef.current.slice(0, -1);
          terminal.write('\b \b');
          resetCompletion();
          return;
        }

        if (data === '\u0003') {
          inputBufferRef.current = '';
          terminal.write('^C\r\n');
          promptVisibleRef.current = false;
          historyIndexRef.current = null;
          historyDraftRef.current = '';
          resetCompletion();
          ensurePromptVisible();
          return;
        }

        if (data === '\u001b[A') {
          navigateHistory('previous');
          return;
        }

        if (data === '\u001b[B') {
          navigateHistory('next');
          return;
        }

        if (data === '\t') {
          completeFromHistory();
          return;
        }

        if (!data.startsWith('\u001b') && data.length > 0) {
          appendInput(data);
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
      fitTerminalRef.current = null;
      renderedLineCountRef.current = 0;
      inputBufferRef.current = '';
      promptVisibleRef.current = false;
      historyIndexRef.current = null;
      historyDraftRef.current = '';
      completionStateRef.current = null;
    };
  }, [appendCommandHistory, appendLine, appendRawLine, interactive, repl, writeLine]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    if (lines.length < renderedLineCountRef.current) {
      terminal.clear();
      renderedLineCountRef.current = 0;
      if (lines.length === 0 && interactive) {
        terminal.writeln('\x1b[38;5;114mBayesgrove workspace terminal active.\x1b[0m');
        promptVisibleRef.current = false;
        ensurePromptVisible();
      }
    }

    for (const line of lines.slice(renderedLineCountRef.current)) {
      writeLine(line);
    }
    renderedLineCountRef.current = lines.length;
    if (interactive && promptVisibleRef.current === false && inputBufferRef.current.length === 0) {
      ensurePromptVisible();
    }
  }, [interactive, lines, writeLine]);

  useEffect(() => {
    if (!active) {
      return;
    }

    requestAnimationFrame(() => {
      fitTerminalRef.current?.();
      if (interactive) {
        terminalRef.current?.focus();
      }
    });
  }, [active, interactive]);

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
  const rawLines = useReplStore((state) => state.rawLines);
  const clearRawLines = useReplStore((state) => state.clearRawLines);
  const sessionState = useConnectionStore((state) => state.sessionState);
  const [activeTab, setActiveTab] = useState<ReplTerminalTab>('console');
  const interactive = true;
  const resolvedPanelOpen = panelOpen ?? storedPanelOpen;
  const setResolvedPanelOpen = onPanelOpenChange ?? setStoredPanelOpen;
  const resolvedPanelHeight = panelHeight ?? storedPanelHeight;
  const setResolvedPanelHeight = onPanelHeightChange ?? setStoredPanelHeight;
  const resolvedPresentation = detachedView ? 'detached' : presentation;
  const detachable = canDetachTerminal() && !detachedView;
  const activeLines = activeTab === 'console' ? replLines : rawLines;
  const activeMode = activeTab === 'console' ? 'interactive' : 'read only';
  const panelTitle = activeTab === 'console' ? 'Shared R session' : 'Raw R process output';
  const panelDescription = activeTab === 'console'
    ? 'Run ad hoc checks in the live Bayesgrove session.'
    : 'Inspect unfiltered R process output, including protocol and diagnostic lines.';

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
      if (activeTab === 'console') {
        await replClient?.clear();
        return;
      }

      clearRawLines();
    } catch (error) {
      console.error('[repl] failed to clear terminal', error);
    }
  };

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(activeLines.join('\n'));
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
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100/50 px-3 py-1.5 dark:border-slate-800/80 dark:bg-slate-900/50">
        <div className="flex items-center gap-2">
          <TerminalSquare className="size-3.5 text-slate-400" />
          <div aria-label="Terminal views" className="flex items-center gap-1" role="tablist">
            {[
              { id: 'console' as const, label: 'R Console' },
              { id: 'process-log' as const, label: 'Process Log' },
            ].map((tab) => {
              const selected = activeTab === tab.id;

              return (
                <button
                  aria-selected={selected}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors',
                    selected
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
                      : 'text-slate-500 hover:bg-white/70 hover:text-slate-900 dark:hover:bg-slate-950/70 dark:hover:text-slate-100',
                  )}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                  type="button"
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        {!detachedView ? (
          <>
            <button
              aria-label="Resize terminal"
              className="flex-1 cursor-row-resize py-1"
              data-repl-resize-handle="true"
              type="button"
            >
              <div className="mx-auto h-1 w-12 rounded-full bg-slate-300 dark:bg-slate-700" />
            </button>
            <Button className="h-6 gap-1 border-0 bg-transparent px-2 text-xs text-slate-500 hover:bg-slate-200/50 hover:text-slate-900 dark:hover:bg-slate-800/50 dark:hover:text-white" onClick={() => setResolvedPanelOpen(false)} variant="ghost">
              <CornerDownLeft className="size-3" />
              Hide
            </Button>
          </>
        ) : <div className="flex-1" />}
      </div>
      <div className="flex min-h-0 flex-1 flex-row">
        <div className={['min-w-0 flex-1 p-0 border-r border-slate-200 dark:border-slate-800/80', detachedView ? 'pt-0' : ''].join(' ').trim()}>
          <div className={cn('h-full', activeTab !== 'console' && 'hidden')}>
            <TerminalSurface
              active={activeTab === 'console'}
              detachedView={detachedView}
              lines={replLines}
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
          <div className={cn('h-full', activeTab !== 'process-log' && 'hidden')}>
            <TerminalSurface
              active={activeTab === 'process-log'}
              detachedView={detachedView}
              lines={rawLines}
              repl={replClient ?? replRpcFromLegacyDispatch(async () => ({
                type: 'CommandResult',
                id: 'missing-repl',
                success: false,
                error: {
                  code: 'missing_repl_client',
                  message: 'No REPL client was provided.',
                },
              }))}
              interactive={false}
            />
          </div>
        </div>

        <aside className="flex w-56 flex-col bg-slate-50/50 p-4 dark:bg-slate-950/50">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{panelTitle}</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{panelDescription}</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-300">
              {activeMode}
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
