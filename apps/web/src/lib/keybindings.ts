/**
 * Client-side keybinding resolver and formatter.
 *
 * Adapted from t3code's keybindings module for glade's workflow scope.
 */

import type {
  KeybindingCommand,
  KeybindingShortcut,
  KeybindingWhenNode,
  ResolvedKeybindingsConfig,
} from '@glade/contracts';

export interface ShortcutEventLike {
  type?: string;
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export interface ShortcutMatchContext {
  replFocus: boolean;
  replOpen: boolean;
  inspectorFocus: boolean;
  inspectorOpen: boolean;
  [key: string]: boolean;
}

interface ShortcutMatchOptions {
  platform?: string;
  context?: Partial<ShortcutMatchContext>;
}

function isMacPlatform(platform = navigator.platform): boolean {
  return platform.startsWith('Mac');
}

function normalizeEventKey(key: string): string {
  const normalized = key.toLowerCase();
  if (normalized === 'esc') return 'escape';
  return normalized;
}

function matchesShortcut(event: ShortcutEventLike, shortcut: KeybindingShortcut, platform = navigator.platform): boolean {
  const key = normalizeEventKey(event.key);
  if (key !== shortcut.key) return false;

  const useMetaForMod = isMacPlatform(platform);
  const expectedMeta = shortcut.metaKey || (shortcut.modKey && useMetaForMod);
  const expectedCtrl = shortcut.ctrlKey || (shortcut.modKey && !useMetaForMod);
  return (
    event.metaKey === expectedMeta &&
    event.ctrlKey === expectedCtrl &&
    event.shiftKey === shortcut.shiftKey &&
    event.altKey === shortcut.altKey
  );
}

function resolveContext(options: ShortcutMatchOptions | undefined): ShortcutMatchContext {
  return {
    replFocus: false,
    replOpen: false,
    inspectorFocus: false,
    inspectorOpen: false,
    ...options?.context,
  };
}

function evaluateWhenNode(node: KeybindingWhenNode, context: ShortcutMatchContext): boolean {
  switch (node.type) {
    case 'identifier':
      if (node.name === 'true') return true;
      if (node.name === 'false') return false;
      return Boolean(context[node.name]);
    case 'not':
      return !evaluateWhenNode(node.node, context);
    case 'and':
      return evaluateWhenNode(node.left, context) && evaluateWhenNode(node.right, context);
    case 'or':
      return evaluateWhenNode(node.left, context) || evaluateWhenNode(node.right, context);
  }
}

function matchesWhenClause(whenAst: KeybindingWhenNode | undefined, context: ShortcutMatchContext): boolean {
  if (!whenAst) return true;
  return evaluateWhenNode(whenAst, context);
}

export function resolveShortcutCommand(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): string | null {
  const context = resolveContext(options);

  for (let index = keybindings.length - 1; index >= 0; index -= 1) {
    const binding = keybindings[index];
    if (!binding) continue;
    if (!matchesWhenClause(binding.whenAst, context)) continue;
    if (!matchesShortcut(event, binding.shortcut, options?.platform)) continue;
    return binding.command;
  }
  return null;
}

function formatShortcutKeyLabel(key: string): string {
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  if (key === 'escape') return 'Esc';
  if (key === 'arrowup') return 'Up';
  if (key === 'arrowdown') return 'Down';
  if (key === 'arrowleft') return 'Left';
  if (key === 'arrowright') return 'Right';
  return key.slice(0, 1).toUpperCase() + key.slice(1);
}

export function formatShortcutLabel(shortcut: KeybindingShortcut, platform = navigator.platform): string {
  const keyLabel = formatShortcutKeyLabel(shortcut.key);
  const useMetaForMod = isMacPlatform(platform);
  const showMeta = shortcut.metaKey || (shortcut.modKey && useMetaForMod);
  const showCtrl = shortcut.ctrlKey || (shortcut.modKey && !useMetaForMod);
  const showAlt = shortcut.altKey;
  const showShift = shortcut.shiftKey;

  if (useMetaForMod) {
    return `${showCtrl ? '\u2303' : ''}${showAlt ? '\u2325' : ''}${showShift ? '\u21e7' : ''}${showMeta ? '\u2318' : ''}${keyLabel}`;
  }

  const parts: string[] = [];
  if (showCtrl) parts.push('Ctrl');
  if (showAlt) parts.push('Alt');
  if (showShift) parts.push('Shift');
  if (showMeta) parts.push('Meta');
  parts.push(keyLabel);
  return parts.join('+');
}

export function shortcutLabelForCommand(
  keybindings: ResolvedKeybindingsConfig,
  command: KeybindingCommand,
  platform = navigator.platform,
): string | null {
  for (let index = keybindings.length - 1; index >= 0; index -= 1) {
    const binding = keybindings[index];
    if (!binding || binding.command !== command) continue;
    return formatShortcutLabel(binding.shortcut, platform);
  }
  return null;
}
