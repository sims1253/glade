import type { GraphSnapshot, ProtocolEvent } from '@glade/contracts';
import { create } from 'zustand';

import { adaptSnapshotToGraph } from '../lib/graph-adapter';
import type { WorkflowGraph } from '../lib/graph-types';

interface GraphState {
  readonly graph: WorkflowGraph | null;
  readonly lastProtocolEvent: ProtocolEvent | null;
  readonly selectedNodeId: string | null;
  readonly highlightedNodeIds: ReadonlyArray<string>;
  readonly applySnapshot: (snapshot: GraphSnapshot) => void;
  readonly applyProtocolEvent: (event: ProtocolEvent) => void;
  readonly setSelectedNodeId: (nodeId: string | null) => void;
  readonly setHighlightedNodeIds: (nodeIds: ReadonlyArray<string>) => void;
  readonly clear: () => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  graph: null,
  lastProtocolEvent: null,
  selectedNodeId: null,
  highlightedNodeIds: [],
  applySnapshot: (snapshot) =>
    set((state) => {
      const graph = adaptSnapshotToGraph(snapshot);
      return {
        graph,
        selectedNodeId: state.selectedNodeId && state.selectedNodeId in graph.nodesById ? state.selectedNodeId : null,
        highlightedNodeIds: state.highlightedNodeIds.filter((nodeId) => nodeId in graph.nodesById),
      };
    }),
  applyProtocolEvent: (event) =>
    set((state) => ({
      lastProtocolEvent: event,
      graph: state.graph,
    })),
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
  setHighlightedNodeIds: (highlightedNodeIds) => set({ highlightedNodeIds: [...new Set(highlightedNodeIds)] }),
  clear: () =>
    set({
      graph: null,
      lastProtocolEvent: null,
      selectedNodeId: null,
      highlightedNodeIds: [],
    }),
}));
