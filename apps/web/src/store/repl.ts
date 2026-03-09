import { create } from 'zustand';

const MAX_REPL_LINES = 500;

interface ReplState {
  readonly replLines: ReadonlyArray<string>;
  readonly replDetached: boolean;
  readonly replaceLines: (lines: ReadonlyArray<string>) => void;
  readonly appendLine: (line: string) => void;
  readonly clearLines: () => void;
  readonly setReplDetached: (replDetached: boolean) => void;
}

export const useReplStore = create<ReplState>((set) => ({
  replLines: [],
  replDetached: false,
  replaceLines: (lines) => set({ replLines: [...lines].slice(-MAX_REPL_LINES) }),
  appendLine: (line) =>
    set((state) => ({
      replLines: [...state.replLines, line].slice(-MAX_REPL_LINES),
    })),
  clearLines: () => set({ replLines: [] }),
  setReplDetached: (replDetached) => set({ replDetached }),
}));
