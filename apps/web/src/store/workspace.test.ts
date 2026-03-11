// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createMockStorage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
}

describe('workspace prefs persistence', () => {
  let storage = createMockStorage();

  beforeEach(() => {
    storage = createMockStorage();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storage,
    });
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hydrates inspector and explorer preferences from localStorage', async () => {
    storage.setItem('glade:workspace-ui:v1', JSON.stringify({
      explorerGroupExpansion: {
        diagnostics: false,
      },
      inspectorTab: 'actions',
      inspectorVisible: false,
    }));

    const { useWorkspaceStore } = await import('./workspace');
    const state = useWorkspaceStore.getState();

    expect(state.inspectorTab).toBe('actions');
    expect(state.inspectorVisible).toBe(false);
    expect(state.explorerGroups.find((group) => group.id === 'diagnostics')?.expanded).toBe(false);
    expect(state.explorerGroups.find((group) => group.id === 'results')?.expanded).toBe(true);
  });

  it('persists explorer and inspector updates', async () => {
    const {
      flushPendingWorkspacePrefsWrites,
      useWorkspaceStore,
      WORKSPACE_PREFS_STORAGE_KEY,
    } = await import('./workspace');

    useWorkspaceStore.getState().toggleExplorerGroup('results');
    useWorkspaceStore.getState().setInspectorTab('actions');
    useWorkspaceStore.getState().setInspectorVisible(false);
    flushPendingWorkspacePrefsWrites();

    expect(JSON.parse(storage.getItem(WORKSPACE_PREFS_STORAGE_KEY) ?? '{}')).toEqual({
      explorerGroupExpansion: expect.objectContaining({
        results: false,
      }),
      inspectorTab: 'actions',
      inspectorVisible: false,
    });
  });
});
