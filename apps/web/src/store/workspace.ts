import { create } from 'zustand';

import type { WorkflowInspectorTab } from '../lib/workflow-workspace';
import { createDebouncedStorage } from './ui-prefs';

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
export const WORKSPACE_PREFS_STORAGE_KEY = 'glade:workspace-ui:v1';
const WORKSPACE_PREFS_PERSIST_DEBOUNCE_MS = 300;

const DEFAULT_EXPLORER_GROUPS: ReadonlyArray<ExplorerGroup> = [
  { id: 'data-sources', title: 'Data Sources', icon: 'database', expanded: true },
  { id: 'model-specs', title: 'Models', icon: 'file-code', expanded: true },
  { id: 'fits', title: 'Fits', icon: 'play', expanded: true },
  { id: 'diagnostics', title: 'Diagnostics', icon: 'stethoscope', expanded: true },
  { id: 'results', title: 'Results', icon: 'git-compare', expanded: true },
];

interface StoredWorkspacePrefs {
  readonly explorerGroupExpansion: Record<string, boolean>;
  readonly inspectorTab: WorkflowInspectorTab;
  readonly inspectorVisible: boolean;
}

interface WorkspacePrefsStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
  readonly flush: () => void;
}

function defaultExplorerGroupExpansion() {
  return Object.fromEntries(
    DEFAULT_EXPLORER_GROUPS.map((group) => [group.id, group.expanded]),
  ) as Record<string, boolean>;
}

const DEFAULT_WORKSPACE_PREFS: StoredWorkspacePrefs = {
  explorerGroupExpansion: defaultExplorerGroupExpansion(),
  inspectorTab: 'obligations',
  inspectorVisible: true,
};

function isInspectorTab(value: unknown): value is WorkflowInspectorTab {
  return value === 'obligations' || value === 'actions';
}

function readStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  const storage = window.localStorage;
  return storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function'
    ? storage
    : null;
}

const fallbackStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  flush: () => undefined,
} satisfies WorkspacePrefsStorage;

const workspacePrefsStorage = (() => {
  const storage = readStorage();
  return storage ? createDebouncedStorage(storage, WORKSPACE_PREFS_PERSIST_DEBOUNCE_MS) : fallbackStorage;
})();

export function flushPendingWorkspacePrefsWrites() {
  workspacePrefsStorage.flush();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPendingWorkspacePrefsWrites);
}

export function readStoredWorkspacePrefs(storage: WorkspacePrefsStorage = workspacePrefsStorage): StoredWorkspacePrefs {
  const raw = storage.getItem(WORKSPACE_PREFS_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_WORKSPACE_PREFS;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredWorkspacePrefs> | null;
    const explorerGroupExpansion = parsed?.explorerGroupExpansion;

    return {
      explorerGroupExpansion: typeof explorerGroupExpansion === 'object' && explorerGroupExpansion !== null
        ? Object.fromEntries(
            Object.entries(explorerGroupExpansion).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'),
          )
        : DEFAULT_WORKSPACE_PREFS.explorerGroupExpansion,
      inspectorTab: isInspectorTab(parsed?.inspectorTab)
        ? parsed.inspectorTab
        : DEFAULT_WORKSPACE_PREFS.inspectorTab,
      inspectorVisible: typeof parsed?.inspectorVisible === 'boolean'
        ? parsed.inspectorVisible
        : DEFAULT_WORKSPACE_PREFS.inspectorVisible,
    };
  } catch {
    storage.removeItem(WORKSPACE_PREFS_STORAGE_KEY);
    return DEFAULT_WORKSPACE_PREFS;
  }
}

export function writeStoredWorkspacePrefs(
  value: StoredWorkspacePrefs,
  storage: WorkspacePrefsStorage = workspacePrefsStorage,
) {
  try {
    storage.setItem(WORKSPACE_PREFS_STORAGE_KEY, JSON.stringify(value));
  } catch {
    return;
  }
}

function applyExplorerGroupExpansion(
  groups: ReadonlyArray<ExplorerGroup>,
  expansion: Record<string, boolean>,
): ReadonlyArray<ExplorerGroup> {
  return groups.map((group) => ({
    ...group,
    expanded: expansion[group.id] ?? group.expanded,
  }));
}

function persistWorkspacePrefs(state: Pick<WorkspaceState, 'explorerGroups' | 'inspectorTab' | 'inspectorVisible'>) {
  writeStoredWorkspacePrefs({
    explorerGroupExpansion: Object.fromEntries(
      state.explorerGroups.map((group) => [group.id, group.expanded]),
    ),
    inspectorTab: state.inspectorTab,
    inspectorVisible: state.inspectorVisible,
  });
}

const initialWorkspacePrefs = readStoredWorkspacePrefs();

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  tabs: [{ id: CANVAS_TAB_ID, type: 'canvas', nodeId: null, label: 'Workflow DAG', icon: '🕸️', closable: false }],
  activeTabId: CANVAS_TAB_ID,
  selectedNodeId: null,
  highlightedNodeIds: [],
  multiSelectedNodeIds: [],
  explorerGroups: applyExplorerGroupExpansion(DEFAULT_EXPLORER_GROUPS, initialWorkspacePrefs.explorerGroupExpansion),
  inspectorTab: initialWorkspacePrefs.inspectorTab,
  inspectorVisible: initialWorkspacePrefs.inspectorVisible,
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

  toggleExplorerGroup: (groupId) => set((state) => {
    const explorerGroups = state.explorerGroups.map((group) =>
      group.id === groupId ? { ...group, expanded: !group.expanded } : group,
    );
    persistWorkspacePrefs({
      explorerGroups,
      inspectorTab: state.inspectorTab,
      inspectorVisible: state.inspectorVisible,
    });
    return { explorerGroups };
  }),

  setInspectorTab: (tab) => {
    set({ inspectorTab: tab });
    persistWorkspacePrefs({
      explorerGroups: get().explorerGroups,
      inspectorTab: tab,
      inspectorVisible: get().inspectorVisible,
    });
  },

  setInspectorVisible: (visible) => {
    set({ inspectorVisible: visible });
    persistWorkspacePrefs({
      explorerGroups: get().explorerGroups,
      inspectorTab: get().inspectorTab,
      inspectorVisible: visible,
    });
  },

  toggleInspector: () => set((state) => {
    const inspectorVisible = !state.inspectorVisible;
    persistWorkspacePrefs({
      explorerGroups: state.explorerGroups,
      inspectorTab: state.inspectorTab,
      inspectorVisible,
    });
    return { inspectorVisible };
  }),

  openCommandPalette: () => set({ commandPaletteOpen: true }),

  closeCommandPalette: () => set({ commandPaletteOpen: false }),

  setFloatingToolbarNode: (nodeId) => set({ floatingToolbarNodeId: nodeId }),
}));
