import { describe, expect, it } from 'vitest';

import type { KeybindingRule } from '@glade/contracts';

import {
  compileResolvedKeybindingRule,
  compileResolvedKeybindingsConfig,
  DEFAULT_KEYBINDINGS,
  encodeShortcut,
  encodeWhenAst,
  mergeWithDefaultKeybindings,
  parseKeybindingShortcut,
  syncMissingDefaults,
} from './keybindings';

describe('parseKeybindingShortcut', () => {
  it('parses a simple key', () => {
    expect(parseKeybindingShortcut('j')).toEqual({
      key: 'j', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, modKey: false,
    });
  });

  it('parses mod+key', () => {
    expect(parseKeybindingShortcut('mod+j')).toEqual({
      key: 'j', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, modKey: true,
    });
  });

  it('parses ctrl+shift+key', () => {
    expect(parseKeybindingShortcut('ctrl+shift+i')).toEqual({
      key: 'i', metaKey: false, ctrlKey: true, shiftKey: true, altKey: false, modKey: false,
    });
  });

  it('parses meta/cmd as metaKey', () => {
    expect(parseKeybindingShortcut('meta+k')).toMatchObject({ metaKey: true });
    expect(parseKeybindingShortcut('cmd+k')).toMatchObject({ metaKey: true });
  });

  it('parses alt/option as altKey', () => {
    expect(parseKeybindingShortcut('alt+z')).toMatchObject({ altKey: true, key: 'z' });
    expect(parseKeybindingShortcut('option+z')).toMatchObject({ altKey: true, key: 'z' });
  });

  it('normalizes "esc" to "escape"', () => {
    expect(parseKeybindingShortcut('esc')).toMatchObject({ key: 'escape' });
  });

  it('handles "+" as the key via trailing-plus convention', () => {
    expect(parseKeybindingShortcut('ctrl++')).toMatchObject({ key: '+', ctrlKey: true });
  });

  it('returns null for empty input', () => {
    expect(parseKeybindingShortcut('')).toBeNull();
    expect(parseKeybindingShortcut('   ')).toBeNull();
  });

  it('returns null when no key is provided (modifiers only)', () => {
    expect(parseKeybindingShortcut('ctrl+shift')).toBeNull();
  });

  it('returns null for multiple non-modifier tokens', () => {
    expect(parseKeybindingShortcut('a+b')).toBeNull();
  });
});

describe('compileResolvedKeybindingRule', () => {
  it('compiles a simple rule without a when clause', () => {
    const rule = { key: 'mod+j', command: 'repl.toggle' } as const;
    const compiled = compileResolvedKeybindingRule(rule);
    expect(compiled).not.toBeNull();
    expect(compiled?.command).toBe('repl.toggle');
    expect(compiled?.shortcut.modKey).toBe(true);
    expect(compiled?.whenAst).toBeUndefined();
  });

  it('compiles a rule with a when clause', () => {
    const rule = { key: 'mod+j', command: 'repl.toggle', when: 'replOpen' } as const;
    const compiled = compileResolvedKeybindingRule(rule);
    expect(compiled).not.toBeNull();
    expect(compiled?.whenAst).toEqual({ type: 'identifier', name: 'replOpen' });
  });

  it('returns null for invalid key syntax', () => {
    expect(compileResolvedKeybindingRule({ key: '', command: 'repl.toggle' })).toBeNull();
  });

  it('returns null for invalid when expression', () => {
    expect(compileResolvedKeybindingRule({ key: 'mod+j', command: 'repl.toggle', when: '&&' })).toBeNull();
  });
});

describe('compileResolvedKeybindingsConfig', () => {
  it('filters out invalid rules and keeps valid ones', () => {
    const config: KeybindingRule[] = [
      { key: 'mod+j', command: 'repl.toggle' },
      { key: '', command: 'repl.clear' },
      { key: 'ctrl+l', command: 'repl.clear' },
    ];
    const compiled = compileResolvedKeybindingsConfig(config);
    expect(compiled).toHaveLength(2);
    expect(compiled.map((b) => b.command)).toEqual(['repl.toggle', 'repl.clear']);
  });
});

describe('encodeShortcut', () => {
  it('encodes a simple key', () => {
    expect(encodeShortcut({ key: 'j', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, modKey: false })).toBe('j');
  });

  it('encodes modifiers in the correct order', () => {
    expect(encodeShortcut({ key: 'j', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, modKey: true })).toBe('mod+j');
    expect(encodeShortcut({ key: 'i', metaKey: false, ctrlKey: false, shiftKey: true, altKey: false, modKey: true })).toBe('mod+shift+i');
  });

  it('encodes space as "space"', () => {
    expect(encodeShortcut({ key: ' ', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, modKey: false })).toBe('space');
  });
});

describe('encodeWhenAst', () => {
  it('encodes identifier nodes', () => {
    expect(encodeWhenAst({ type: 'identifier', name: 'replOpen' })).toBe('replOpen');
  });

  it('encodes not nodes', () => {
    expect(encodeWhenAst({ type: 'not', node: { type: 'identifier', name: 'replOpen' } })).toBe('!replOpen');
  });

  it('encodes and nodes', () => {
    expect(encodeWhenAst({
      type: 'and',
      left: { type: 'identifier', name: 'replOpen' },
      right: { type: 'identifier', name: 'inspectorOpen' },
    })).toBe('replOpen && inspectorOpen');
  });

  it('encodes or nodes', () => {
    expect(encodeWhenAst({
      type: 'or',
      left: { type: 'identifier', name: 'replOpen' },
      right: { type: 'identifier', name: 'inspectorOpen' },
    })).toBe('replOpen || inspectorOpen');
  });

  it('adds parentheses for lower-precedence children in and/not', () => {
    const orNode = {
      type: 'or' as const,
      left: { type: 'identifier' as const, name: 'a' },
      right: { type: 'identifier' as const, name: 'b' },
    };
    expect(encodeWhenAst({ type: 'not', node: orNode })).toBe('!(a || b)');
  });
});

describe('mergeWithDefaultKeybindings', () => {
  it('returns default bindings when custom is empty', () => {
    const merged = mergeWithDefaultKeybindings([]);
    const defaultCompiled = compileResolvedKeybindingsConfig([...DEFAULT_KEYBINDINGS]);
    expect(merged).toHaveLength(defaultCompiled.length);
  });

  it('overrides default commands with custom ones', () => {
    const custom = compileResolvedKeybindingsConfig([{ key: 'ctrl+k', command: 'repl.toggle' }]);
    const merged = mergeWithDefaultKeybindings(custom);
    const toggleBindings = merged.filter((b) => b.command === 'repl.toggle');
    expect(toggleBindings).toHaveLength(1);
    expect(toggleBindings[0]?.shortcut.ctrlKey).toBe(true);
  });
});

describe('syncMissingDefaults', () => {
  it('appends missing default rules', () => {
    const existing: KeybindingRule[] = [{ key: 'mod+j', command: 'repl.toggle' }];
    const synced = syncMissingDefaults(existing);
    const commands = synced.map((r) => r.command);
    expect(commands).toContain('repl.toggle');
    expect(commands).toContain('inspector.toggle');
    expect(commands).toContain('settings.open');
  });

  it('returns the same array reference when nothing is missing', () => {
    const existing = [...DEFAULT_KEYBINDINGS];
    const synced = syncMissingDefaults(existing);
    expect(synced).toBe(existing);
  });

  it('does not add a default if the shortcut is already in use', () => {
    // Bind mod+j to a different command — should block the default repl.toggle from being added
    const existing: KeybindingRule[] = [{ key: 'mod+j', command: 'repl.clear' }];
    const synced = syncMissingDefaults(existing);
    const replToggleRules = synced.filter((r) => r.command === 'repl.toggle');
    expect(replToggleRules).toHaveLength(0);
  });
});
