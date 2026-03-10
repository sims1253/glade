import { describe, expect, it } from 'vitest';

import {
  clampWorkflowReplHeight,
  getDefaultInspectorTab,
  getWorkflowReplHeightFromPointer,
  resolveWorkflowWorkspaceMode,
} from './workflow-workspace';

describe('resolveWorkflowWorkspaceMode', () => {
  it('returns wide when both rails and the center minimum fit', () => {
    expect(resolveWorkflowWorkspaceMode({
      containerWidth: 1_520,
      railWidth: 352,
      inspectorWidth: 352,
      centerMinWidth: 640,
      gap: 24,
    })).toBe('wide');
  });

  it('returns inspector when the full three-column layout does not fit', () => {
    expect(resolveWorkflowWorkspaceMode({
      containerWidth: 1_040,
      railWidth: 352,
      inspectorWidth: 352,
      centerMinWidth: 640,
      gap: 24,
    })).toBe('inspector');
  });

  it('returns stacked when only the center column can fit', () => {
    expect(resolveWorkflowWorkspaceMode({
      containerWidth: 860,
      railWidth: 352,
      inspectorWidth: 352,
      centerMinWidth: 640,
      gap: 24,
    })).toBe('stacked');
  });
});

describe('getDefaultInspectorTab', () => {
  it('prefers obligations when review work exists', () => {
    expect(getDefaultInspectorTab({ obligationCount: 2, actionCount: 4 })).toBe('obligations');
  });

  it('falls back to actions when only actions exist', () => {
    expect(getDefaultInspectorTab({ obligationCount: 0, actionCount: 1 })).toBe('actions');
  });
});

describe('repl height helpers', () => {
  it('clamps requested heights to the available bounds', () => {
    expect(clampWorkflowReplHeight({
      height: 720,
      minHeight: 180,
      maxHeight: 640,
      availableHeight: 512,
    })).toBe(512);
  });

  it('derives a clamped height from pointer movement', () => {
    expect(getWorkflowReplHeightFromPointer({
      containerBottom: 900,
      pointerClientY: 620,
      bottomOffset: 24,
      minHeight: 180,
      maxHeight: 420,
      availableHeight: 420,
    })).toBe(256);
  });
});
