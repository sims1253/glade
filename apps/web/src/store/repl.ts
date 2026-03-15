import { create } from 'zustand';

const MAX_REPL_LINES = 500;
const MAX_REPL_HISTORY = 200;

interface ReplState {
  readonly replLines: ReadonlyArray<string>;
  readonly rawLines: ReadonlyArray<string>;
  readonly commandHistory: ReadonlyArray<string>;
  readonly replDetached: boolean;
  readonly replaceLines: (lines: ReadonlyArray<string>) => void;
  readonly appendLine: (line: string) => void;
  readonly appendRawLine: (line: string) => void;
  readonly appendCommandHistory: (command: string) => void;
  readonly clearLines: () => void;
  readonly clearRawLines: () => void;
  readonly setReplDetached: (replDetached: boolean) => void;
}

export const useReplStore = create<ReplState>((set) => ({
  replLines: [],
  rawLines: [],
  commandHistory: [],
  replDetached: false,
  replaceLines: (lines) => set({ replLines: [...lines].slice(-MAX_REPL_LINES) }),
  appendLine: (line) =>
    set((state) => ({
      replLines: [...state.replLines, line].slice(-MAX_REPL_LINES),
    })),
  appendRawLine: (line) =>
    set((state) => ({
      rawLines: [...state.rawLines, line].slice(-MAX_REPL_LINES),
    })),
  appendCommandHistory: (command) =>
    set((state) => ({
      commandHistory: command.trim().length === 0
        ? state.commandHistory
        : [...state.commandHistory, command].slice(-MAX_REPL_HISTORY),
    })),
  clearLines: () => set({ replLines: [] }),
  clearRawLines: () => set({ rawLines: [] }),
  setReplDetached: (replDetached) => set({ replDetached }),
}));
