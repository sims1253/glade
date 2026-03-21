import { describe, expect, it } from 'vitest';

import { describeRpcCall, failureTitle, shouldSuppressSuccessToast } from './rpc-ui';

describe('describeRpcCall', () => {
  it('describes desktop methods', () => {
    expect(describeRpcCall('desktop.getEnvironment', { _tag: 'desktop.getEnvironment' })).toBe('Loaded desktop environment');
    expect(describeRpcCall('desktop.saveSettings', { _tag: 'desktop.saveSettings', settings: {} as never })).toBe('Saved desktop settings');
    expect(describeRpcCall('desktop.resetSettings', { _tag: 'desktop.resetSettings' })).toBe('Reset desktop settings');
  });

  it('includes the label when adding a node', () => {
    expect(describeRpcCall('workflow.addNode', { _tag: 'workflow.addNode', kind: 'fit', label: 'My Model' })).toBe('Added My Model');
  });

  it('falls back to kind when label is absent', () => {
    expect(describeRpcCall('workflow.addNode', { _tag: 'workflow.addNode', kind: 'fit' } as never)).toBe('Added fit');
  });

  it('describes rename with the new label', () => {
    expect(describeRpcCall('workflow.renameNode', { _tag: 'workflow.renameNode', nodeId: 'n1', label: 'NewName' })).toBe('Renamed node to NewName');
  });

  it('distinguishes linking vs unlinking a file', () => {
    expect(describeRpcCall('workflow.setNodeFile', { _tag: 'workflow.setNodeFile', nodeId: 'n1', path: '/some/file.R' })).toBe('Linked node file');
    expect(describeRpcCall('workflow.setNodeFile', { _tag: 'workflow.setNodeFile', nodeId: 'n1', path: '' })).toBe('Removed node file link');
  });

  it('describes repl methods', () => {
    expect(describeRpcCall('repl.write', { _tag: 'repl.write', data: 'x <- 1\n' })).toBe('Sent REPL input');
    expect(describeRpcCall('repl.clear', { _tag: 'repl.clear' })).toBe('Cleared REPL terminal');
  });
});

describe('shouldSuppressSuccessToast', () => {
  it('suppresses toasts for repl.write and repl.clear', () => {
    expect(shouldSuppressSuccessToast('repl.write')).toBe(true);
    expect(shouldSuppressSuccessToast('repl.clear')).toBe(true);
  });

  it('does not suppress toasts for other methods', () => {
    expect(shouldSuppressSuccessToast('workflow.addNode')).toBe(false);
    expect(shouldSuppressSuccessToast('desktop.saveSettings')).toBe(false);
    expect(shouldSuppressSuccessToast('session.restart')).toBe(false);
  });
});

describe('failureTitle', () => {
  it('returns appropriate failure titles for each method', () => {
    expect(failureTitle('desktop.getEnvironment')).toBe('Could not load desktop environment');
    expect(failureTitle('workflow.addNode')).toBe('Could not add node');
    expect(failureTitle('session.restart')).toBe('Could not restart session');
    expect(failureTitle('repl.write')).toBe('Could not send REPL input');
    expect(failureTitle('server.upsertKeybinding')).toBe('Could not save keybinding');
  });
});
