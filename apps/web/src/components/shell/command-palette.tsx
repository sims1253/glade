import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, Command } from 'lucide-react';

import { cn } from '../../lib/utils';
import { useWorkspaceStore } from '../../store/workspace';

interface CommandItem {
  id: string;
  label: string;
  shortcut?: string;
  group: string;
  action: () => void;
}

interface CommandPaletteProps {
  commands: ReadonlyArray<CommandItem>;
  className?: string;
}

export function CommandPalette({ commands, className }: CommandPaletteProps) {
  const isOpen = useWorkspaceStore((state) => state.commandPaletteOpen);
  const closeCommandPalette = useWorkspaceStore((state) => state.closeCommandPalette);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const inputId = useId();

  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      return commands;
    }
    const lowerQuery = query.toLowerCase();
    return commands.filter((cmd) =>
      cmd.label.toLowerCase().includes(lowerQuery),
    );
  }, [commands, query]);

  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    for (const cmd of filteredCommands) {
      const existingGroup = groups[cmd.group];
      if (existingGroup) {
        existingGroup.push(cmd);
      } else {
        groups[cmd.group] = [cmd];
      }
    }
    return groups;
  }, [filteredCommands]);

  useEffect(() => {
    setSelectedIndex((current) => {
      if (filteredCommands.length === 0) {
        return 0;
      }

      return Math.min(current, filteredCommands.length - 1);
    });
  }, [filteredCommands]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          closeCommandPalette();
        } else {
          useWorkspaceStore.getState().openCommandPalette();
        }
      }

      if (e.key === 'Escape' && isOpen) {
        closeCommandPalette();
      }

      if (isOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((i) => (filteredCommands.length === 0 ? 0 : Math.min(i + 1, filteredCommands.length - 1)));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter' && filteredCommands[selectedIndex]) {
          e.preventDefault();
          filteredCommands[selectedIndex].action();
          closeCommandPalette();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeCommandPalette, filteredCommands, isOpen, selectedIndex]);

  const handleSelect = useCallback((command: CommandItem) => {
    command.action();
    closeCommandPalette();
  }, [closeCommandPalette]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={closeCommandPalette}
      />
      <div
        className={cn(
          'absolute left-1/2 top-[20%] w-full max-w-lg -translate-x-1/2 rounded-xl border border-slate-200 bg-white shadow-2xl',
          className,
        )}
        aria-labelledby={titleId}
        aria-modal="true"
        role="dialog"
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4">
          <Search aria-hidden="true" className="size-5 text-slate-400" />
          <label className="sr-only" htmlFor={inputId} id={titleId}>Search commands</label>
          <input
            aria-autocomplete="list"
            aria-labelledby={titleId}
            ref={inputRef}
            id={inputId}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands..."
            className="flex-1 py-4 text-base outline-none placeholder:text-slate-400"
          />
          <kbd aria-hidden="true" className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            Esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-2">
          {Object.entries(groupedCommands).map(([group, items]) => (
            <div key={group}>
              <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {group}
              </div>
              {items.map((item) => {
                const globalIndex = filteredCommands.indexOf(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    className={cn(
                      'flex w-full items-center justify-between px-4 py-2 text-left text-sm',
                      globalIndex === selectedIndex
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                        {item.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {filteredCommands.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No commands found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CommandPaletteTrigger({ className }: { className?: string }) {
  const isOpen = useWorkspaceStore((state) => state.commandPaletteOpen);
  const openCommandPalette = useWorkspaceStore((state) => state.openCommandPalette);

  return (
    <button
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      aria-label="Open command palette"
      type="button"
      onClick={openCommandPalette}
      className={cn(
        'flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50',
        className,
      )}
    >
      <Search className="size-4" />
      <span>Search...</span>
      <div className="flex items-center gap-1">
        <Command className="size-3" />
        <span>K</span>
      </div>
    </button>
  );
}

export type { CommandItem };
