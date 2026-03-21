import { describe, expect, it } from 'vitest';

import {
  getEditorDisplayName,
  getEditorOptions,
  isKnownEditor,
  resolveEditorPreference,
} from './editor-preferences';

describe('getEditorOptions', () => {
  it('returns a non-empty list of known editors', () => {
    const options = getEditorOptions();
    expect(options.length).toBeGreaterThan(0);
    for (const opt of options) {
      expect(opt.id).toBeTruthy();
      expect(opt.name).toBeTruthy();
      expect(opt.commands.length).toBeGreaterThan(0);
    }
  });
});

describe('resolveEditorPreference', () => {
  it('returns empty string for empty or auto command', () => {
    expect(resolveEditorPreference({ editorCommand: '' })).toBe('');
    expect(resolveEditorPreference({ editorCommand: 'auto' })).toBe('');
    expect(resolveEditorPreference({ editorCommand: undefined })).toBe('');
    expect(resolveEditorPreference({ editorCommand: '  ' })).toBe('');
  });

  it('resolves known editor commands to their ids', () => {
    expect(resolveEditorPreference({ editorCommand: 'code' })).toBe('vscode');
    expect(resolveEditorPreference({ editorCommand: 'cursor' })).toBe('cursor');
    expect(resolveEditorPreference({ editorCommand: 'vim' })).toBe('vim');
    expect(resolveEditorPreference({ editorCommand: 'nvim' })).toBe('vim');
    expect(resolveEditorPreference({ editorCommand: 'zed' })).toBe('zed');
  });

  it('resolves known commands case-insensitively', () => {
    expect(resolveEditorPreference({ editorCommand: 'CODE' })).toBe('vscode');
    expect(resolveEditorPreference({ editorCommand: 'Cursor' })).toBe('cursor');
  });

  it('strips .exe extensions on Windows-style paths', () => {
    expect(resolveEditorPreference({ editorCommand: 'code.exe' })).toBe('vscode');
    expect(resolveEditorPreference({ editorCommand: 'cursor.exe' })).toBe('cursor');
  });

  it('handles quoted paths', () => {
    expect(resolveEditorPreference({ editorCommand: '"C:\\Program Files\\Microsoft VS Code\\code.exe"' })).toBe('vscode');
  });

  it('strips arguments from unquoted paths', () => {
    expect(resolveEditorPreference({ editorCommand: 'code --wait' })).toBe('vscode');
    expect(resolveEditorPreference({ editorCommand: '/usr/bin/vim --noplugin' })).toBe('vim');
  });

  it('returns the raw command for unknown editors', () => {
    expect(resolveEditorPreference({ editorCommand: 'my-custom-editor' })).toBe('my-custom-editor');
  });
});

describe('getEditorDisplayName', () => {
  it('returns the display name for known editor ids', () => {
    expect(getEditorDisplayName('vscode')).toBe('VS Code');
    expect(getEditorDisplayName('cursor')).toBe('Cursor');
    expect(getEditorDisplayName('vim')).toBe('Vim');
  });

  it('returns "System Default" for empty string', () => {
    expect(getEditorDisplayName('')).toBe('System Default');
  });

  it('returns the id itself for unknown editors', () => {
    expect(getEditorDisplayName('my-custom-editor')).toBe('my-custom-editor');
  });
});

describe('isKnownEditor', () => {
  it('returns true for known editor commands', () => {
    expect(isKnownEditor('code')).toBe(true);
    expect(isKnownEditor('cursor')).toBe(true);
    expect(isKnownEditor('nvim')).toBe(true);
  });

  it('returns false for unknown commands', () => {
    expect(isKnownEditor('my-editor')).toBe(false);
    expect(isKnownEditor('')).toBe(false);
    expect(isKnownEditor('auto')).toBe(false);
  });
});
