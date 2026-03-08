import type { GraphSnapshot, ProtocolEvent } from '@glade/contracts';
import { create } from 'zustand';

import { adaptSnapshotToGraph } from '../lib/graph-adapter';
import type { WorkflowGraph } from '../lib/graph-types';

interface GraphState {
  readonly graph: WorkflowGraph | null;
  readonly lastProtocolEvent: ProtocolEvent | null;
  readonly applySnapshot: (snapshot: GraphSnapshot) => void;
  readonly applyProtocolEvent: (event: ProtocolEvent) => void;
  readonly clear: () => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  graph: null,
  lastProtocolEvent: null,
  applySnapshot: (snapshot) =>
    set(() => ({
      graph: adaptSnapshotToGraph(snapshot),
    })),
  applyProtocolEvent: (event) =>
    set((state) => ({
      lastProtocolEvent: event,
      graph: state.graph,
    })),
  clear: () =>
    set({
      graph: null,
      lastProtocolEvent: null,
    }),
}));
