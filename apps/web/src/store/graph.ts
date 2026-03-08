import type { GraphSnapshot, ProtocolEvent } from '@glade/contracts';
import { create } from 'zustand';

import { adaptSnapshotToGraph } from '../lib/graph-adapter';
import type { WorkflowGraph } from '../lib/graph-types';

interface GraphState {
  readonly graph: WorkflowGraph | null;
  readonly lastProtocolEvent: ProtocolEvent | null;
  readonly selectedNodeId: string | null;
  readonly applySnapshot: (snapshot: GraphSnapshot) => void;
  readonly applyProtocolEvent: (event: ProtocolEvent) => void;
  readonly setSelectedNodeId: (nodeId: string | null) => void;
  readonly clear: () => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  graph: null,
  lastProtocolEvent: null,
  selectedNodeId: null,
  applySnapshot: (snapshot) =>
    set((state) => {
      const graph = adaptSnapshotToGraph(snapshot);
      return {
        graph,
        selectedNodeId: graph.nodes.some((node) => node.id === state.selectedNodeId) ? state.selectedNodeId : null,
      };
    }),
  applyProtocolEvent: (event) =>
    set((state) => ({
      lastProtocolEvent: event,
      graph: state.graph,
    })),
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
  clear: () =>
    set({
      graph: null,
      lastProtocolEvent: null,
      selectedNodeId: null,
    }),
}));
