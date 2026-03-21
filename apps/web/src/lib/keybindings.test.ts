import { describe, expect, it } from 'vitest';

import { formatShortcutLabel, resolveShortcutCommand, shortcutLabelForCommand } from './keybindings';
import type { ResolvedKeybindingsConfig } from '@glade/contracts';

const MAC = 'MacIntel';
const WIN = 'Win32';

function makeBindings(overrides: Partial<ResolvedKeybindingsConfig[number]>[] = []): ResolvedKeybindingsConfig {
  return overrides.map((o) => ({
    command: 'test.cmd' as const,
    shortcut: { key: 'k', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, modKey: false },
    ...o,
  })) as ResolvedKeybindingsConfig;
}

describe('resolveShortcutCommand', () => {
  it('returns null for empty keybindings', () => {
    const event = { key: 'k', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
    expect(resolveShortcutCommand(event, [])).toBeNull();
  });

  it('matches a simple key with no modifiers', () => {
    const bindings = makeBindings([{ command: 'repl.toggle' as const }]);
    const event = { key: 'k', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
    expect(resolveShortcutCommand(event, bindings)).toBe('repl.toggle');
  });

  it('does not match if modifiers differ', () => {
    const bindings = makeBindings([{
      command: 'repl.toggle' as const,
      shortcut: { key: 'k', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, modKey: false },
    }]);
    const event = { key: 'k', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
    expect(resolveShortcutCommand(event, bindings)).toBeNull();
  });

  it('resolves modKey to meta on Mac', () => {
    const bindings = makeBindings([{
      command: 'repl.toggle' as const,
      shortcut: { key: 'j', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, modKey: true },
    }]);
    const event = { key: 'j', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false };
    expect(resolveShortcutCommand(event, bindings, { platform: MAC })).toBe('repl.toggle');
  });

  it('resolves modKey to ctrl on non-Mac', () => {
    const bindings = makeBindings([{
      command: 'repl.toggle' as const,
      shortcut: { key: 'j', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, modKey: true },
    }]);
    const event = { key: 'j', metaKey: false, ctrlKey: true, shiftKey: false, altKey: false };
    expect(resolveShortcutCommand(event, bindings, { platform: WIN })).toBe('repl.toggle');
  });

  it('returns last binding in the list (highest priority)', () => {
    const bindings: ResolvedKeybindingsConfig = [
      { command: 'repl.toggle', shortcut: { key: 'k', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, modKey: false } },
      { command: 'inspector.toggle', shortcut: { key: 'k', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, modKey: false } },
    ] as ResolvedKeybindingsConfig;
    const event = { key: 'k', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
    expect(resolveShortcutCommand(event, bindings)).toBe('inspector.toggle');
  });

  it('normalizes "Escape" key to "escape"', () => {
    const bindings = makeBindings([{
      command: 'repl.toggle' as const,
      shortcut: { key: 'escape', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, modKey: false },
    }]);
    const event = { key: 'Escape', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
    expect(resolveShortcutCommand(event, bindings)).toBe('repl.toggle');
  });
});

describe('formatShortcutLabel', () => {
  it('formats a simple key on Mac', () => {
    const shortcut = { key: 'k', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, modKey: false };
    expect(formatShortcutLabel(shortcut, MAC)).toBe('K');
  });

  it('formats modKey as ⌘ on Mac', () => {
    const shortcut = { key: 'j', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, modKey: true };
    expect(formatShortcutLabel(shortcut, MAC)).toBe('⌘J');
  });

  it('formats modKey as Ctrl+ on Windows', () => {
    const shortcut = { key: 'j', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, modKey: true };
    expect(formatShortcutLabel(shortcut, WIN)).toBe('Ctrl+J');
  });

  it('formats shift on Mac with ⇧', () => {
    const shortcut = { key: 'i', metaKey: false, ctrlKey: false, shiftKey: true, altKey: false, modKey: true };
    expect(formatShortcutLabel(shortcut, MAC)).toBe('⇧⌘I');
  });

  it('formats special keys with labels', () => {
    const shortcut = { key: 'escape', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, modKey: false };
    expect(formatShortcutLabel(shortcut, WIN)).toBe('Esc');
  });

  it('formats space as "Space"', () => {
    const shortcut = { key: ' ', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, modKey: false };
    expect(formatShortcutLabel(shortcut, WIN)).toBe('Space');
  });
});

describe('shortcutLabelForCommand', () => {
  it('returns the label for the last binding matching the command', () => {
    const bindings: ResolvedKeybindingsConfig = [
      { command: 'repl.toggle', shortcut: { key: 'j', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, modKey: true } },
    ] as ResolvedKeybindingsConfig;
    expect(shortcutLabelForCommand(bindings, 'repl.toggle', WIN)).toBe('Ctrl+J');
  });

  it('returns null for unknown commands', () => {
    const bindings: ResolvedKeybindingsConfig = [
      { command: 'repl.toggle', shortcut: { key: 'j', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, modKey: true } },
    ] as ResolvedKeybindingsConfig;
    expect(shortcutLabelForCommand(bindings, 'settings.open', WIN)).toBeNull();
  });

  it('returns null for empty keybindings', () => {
    expect(shortcutLabelForCommand([], 'repl.toggle', WIN)).toBeNull();
  });
});
