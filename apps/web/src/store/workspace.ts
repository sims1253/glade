import { create } from 'zustand';

import type { WorkflowInspectorTab } from '../lib/workflow-workspace';

export type CenterTabType = 'canvas' | 'editor' | 'diagnostics' | 'trace';

export interface CenterTab {
  readonly id: string;
  readonly type: CenterTabType;
  readonly nodeId: string | null;
  readonly label: string;
  readonly icon: string;
  readonly closable: boolean;
}

export interface ExplorerGroup {
  readonly id: string;
  readonly title: string;
  readonly icon: string;
  readonly expanded: boolean;
}

interface WorkspaceState {
  readonly tabs: ReadonlyArray<CenterTab>;
  readonly activeTabId: string | null;
  readonly selectedNodeId: string | null;
  readonly highlightedNodeIds: ReadonlyArray<string>;
  readonly multiSelectedNodeIds: ReadonlyArray<string>;
  readonly explorerGroups: ReadonlyArray<ExplorerGroup>;
  readonly inspectorTab: WorkflowInspectorTab;
  readonly inspectorVisible: boolean;
  readonly commandPaletteOpen: boolean;
  readonly floatingToolbarNodeId: string | null;

  readonly addTab: (tab: CenterTab) => void;
  readonly removeTab: (tabId: string) => void;
  readonly setActiveTab: (tabId: string) => void;
  readonly setSelectedNode: (nodeId: string | null) => void;
  readonly setHighlightedNodes: (nodeIds: ReadonlyArray<string>) => void;
  readonly setMultiSelectedNodes: (nodeIds: ReadonlyArray<string>) => void;
  readonly toggleExplorerGroup: (groupId: string) => void;
  readonly setInspectorTab: (tab: WorkflowInspectorTab) => void;
  readonly setInspectorVisible: (visible: boolean) => void;
  readonly toggleInspector: () => void;
  readonly openCommandPalette: () => void;
  readonly closeCommandPalette: () => void;
  readonly setFloatingToolbarNode: (nodeId: string | null) => void;
}

const CANVAS_TAB_ID = 'canvas-tab';

const DEFAULT_EXPLORER_GROUPS: ReadonlyArray<ExplorerGroup> = [
  { id: 'data-sources', title: 'Data Sources', icon: 'database', expanded: true },
  { id: 'model-specs', title: 'Models', icon: 'file-code', expanded: true },
  { id: 'fits', title: 'Fits', icon: 'play', expanded: true },
  { id: 'diagnostics', title: 'Diagnostics', icon: 'stethoscope', expanded: true },
  { id: 'results', title: 'Results', icon: 'git-compare', expanded: true },
];

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  tabs: [{ id: CANVAS_TAB_ID, type: 'canvas', nodeId: null, label: 'Workflow DAG', icon: '🕸️', closable: false }],
  activeTabId: CANVAS_TAB_ID,
  selectedNodeId: null,
  highlightedNodeIds: [],
  multiSelectedNodeIds: [],
  explorerGroups: DEFAULT_EXPLORER_GROUPS,
  inspectorTab: 'obligations',
  inspectorVisible: true,
  commandPaletteOpen: false,
  floatingToolbarNodeId: null,

  addTab: (tab) => set((state) => {
    const existing = state.tabs.find((t) => t.id === tab.id);
    if (existing) {
      return { activeTabId: tab.id };
    }
    return {
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    };
  }),

  removeTab: (tabId) => set((state) => {
    if (tabId === CANVAS_TAB_ID) {
      return state;
    }
    const tabIndex = state.tabs.findIndex((t) => t.id === tabId);
    const newTabs = state.tabs.filter((t) => t.id !== tabId);
    
    if (state.activeTabId === tabId) {
      const newActiveIndex = Math.min(tabIndex, newTabs.length - 1);
      return {
        tabs: newTabs,
        activeTabId: newTabs[newActiveIndex]?.id ?? CANVAS_TAB_ID,
      };
    }
    
    return { tabs: newTabs };
  }),

  setActiveTab: (tabId) => set((state) => {
    if (state.tabs.some((t) => t.id === tabId)) {
      return { activeTabId: tabId };
    }
    return state;
  }),

  setSelectedNode: (nodeId) => set({
    selectedNodeId: nodeId,
    multiSelectedNodeIds: [],
  }),

  setHighlightedNodes: (nodeIds) => set({
    highlightedNodeIds: nodeIds,
    multiSelectedNodeIds: nodeIds.length > 1 ? [...new Set(nodeIds)] : [],
  }),

  setMultiSelectedNodes: (nodeIds) => set({
    multiSelectedNodeIds: nodeIds,
    selectedNodeId: nodeIds.length === 1 ? (nodeIds[0] ?? null) : null,
  }),

  toggleExplorerGroup: (groupId) => set((state) => ({
    explorerGroups: state.explorerGroups.map((group) =>
      group.id === groupId ? { ...group, expanded: !group.expanded } : group,
    ),
  })),

  setInspectorTab: (tab) => set({ inspectorTab: tab }),

  setInspectorVisible: (visible) => set({ inspectorVisible: visible }),

  toggleInspector: () => set((state) => ({ inspectorVisible: !state.inspectorVisible })),

  openCommandPalette: () => set({ commandPaletteOpen: true }),

  closeCommandPalette: () => set({ commandPaletteOpen: false }),

  setFloatingToolbarNode: (nodeId) => set({ floatingToolbarNodeId: nodeId }),
}));
