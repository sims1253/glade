/**
 * Keybinding parsing and validation utilities for the server.
 *
 * Adapted from t3code's keybindings module for glade's workflow-focused scope.
 */

import type { KeybindingRule, KeybindingShortcut, KeybindingWhenNode, ResolvedKeybindingRule, ResolvedKeybindingsConfig } from '@glade/contracts';
import { MAX_WHEN_EXPRESSION_DEPTH } from '@glade/contracts';

export const DEFAULT_KEYBINDINGS: ReadonlyArray<KeybindingRule> = [
  { key: 'mod+j', command: 'repl.toggle' },
  { key: 'ctrl+l', command: 'repl.clear' },
  { key: 'mod+i', command: 'inspector.toggle' },
  { key: 'mod+shift+i', command: 'inspector.focus' },
  { key: 'mod+,', command: 'settings.open' },
  { key: 'mod+o', command: 'editor.openFavorite' },
];

function normalizeKeyToken(token: string): string {
  if (token === 'space') return ' ';
  if (token === 'esc') return 'escape';
  return token;
}

export function parseKeybindingShortcut(value: string): KeybindingShortcut | null {
  if (value.trim() === '') return null;

  const rawTokens = value.toLowerCase().split('+').map((t) => t.trim());
  const tokens = [...rawTokens];
  let trailingEmptyCount = 0;
  while (tokens[tokens.length - 1] === '') {
    trailingEmptyCount += 1;
    tokens.pop();
  }
  if (trailingEmptyCount > 0) tokens.push('+');
  if (tokens.some((t) => t.length === 0)) return null;
  if (tokens.length === 0) return null;

  let key: string | null = null;
  let metaKey = false;
  let ctrlKey = false;
  let shiftKey = false;
  let altKey = false;
  let modKey = false;

  for (const token of tokens) {
    switch (token) {
      case 'cmd':
      case 'meta':
        metaKey = true;
        break;
      case 'ctrl':
      case 'control':
        ctrlKey = true;
        break;
      case 'shift':
        shiftKey = true;
        break;
      case 'alt':
      case 'option':
        altKey = true;
        break;
      case 'mod':
        modKey = true;
        break;
      default: {
        if (key !== null) return null;
        key = normalizeKeyToken(token);
      }
    }
  }

  if (key === null) return null;
  return { key, metaKey, ctrlKey, shiftKey, altKey, modKey };
}

type WhenToken =
  | { type: 'identifier'; value: string }
  | { type: 'not' }
  | { type: 'and' }
  | { type: 'or' }
  | { type: 'lparen' }
  | { type: 'rparen' };

function tokenizeWhenExpression(expression: string): WhenToken[] | null {
  const tokens: WhenToken[] = [];
  let index = 0;

  while (index < expression.length) {
    const current = expression[index];
    if (!current) break;
    if (/\s/.test(current)) { index += 1; continue; }
    if (expression.startsWith('&&', index)) { tokens.push({ type: 'and' }); index += 2; continue; }
    if (expression.startsWith('||', index)) { tokens.push({ type: 'or' }); index += 2; continue; }
    if (current === '!') { tokens.push({ type: 'not' }); index += 1; continue; }
    if (current === '(') { tokens.push({ type: 'lparen' }); index += 1; continue; }
    if (current === ')') { tokens.push({ type: 'rparen' }); index += 1; continue; }

    const identifier = /^[A-Za-z_][A-Za-z0-9_.-]*/.exec(expression.slice(index));
    if (!identifier) return null;
    tokens.push({ type: 'identifier', value: identifier[0] });
    index += identifier[0].length;
  }

  return tokens;
}

function parseWhenExpression(expression: string): KeybindingWhenNode | null {
  const tokens = tokenizeWhenExpression(expression);
  if (!tokens || tokens.length === 0) return null;
  let index = 0;

  const parsePrimary = (depth: number): KeybindingWhenNode | null => {
    if (depth > MAX_WHEN_EXPRESSION_DEPTH) return null;
    const token = tokens[index];
    if (!token) return null;
    if (token.type === 'identifier') { index += 1; return { type: 'identifier', name: token.value }; }
    if (token.type === 'lparen') {
      index += 1;
      const expr = parseOr(depth + 1);
      const close = tokens[index];
      if (!expr || !close || close.type !== 'rparen') return null;
      index += 1;
      return expr;
    }
    return null;
  };

  const parseUnary = (depth: number): KeybindingWhenNode | null => {
    let notCount = 0;
    while (tokens[index]?.type === 'not') { index += 1; notCount += 1; if (notCount > MAX_WHEN_EXPRESSION_DEPTH) return null; }
    let node = parsePrimary(depth);
    if (!node) return null;
    while (notCount > 0) { node = { type: 'not', node }; notCount -= 1; }
    return node;
  };

  const parseAnd = (depth: number): KeybindingWhenNode | null => {
    let left = parseUnary(depth);
    if (!left) return null;
    while (tokens[index]?.type === 'and') { index += 1; const right = parseUnary(depth); if (!right) return null; left = { type: 'and', left, right }; }
    return left;
  };

  const parseOr = (depth: number): KeybindingWhenNode | null => {
    let left = parseAnd(depth);
    if (!left) return null;
    while (tokens[index]?.type === 'or') { index += 1; const right = parseAnd(depth); if (!right) return null; left = { type: 'or', left, right }; }
    return left;
  };

  const ast = parseOr(0);
  if (!ast || index !== tokens.length) return null;
  return ast;
}

export function compileResolvedKeybindingRule(rule: KeybindingRule): ResolvedKeybindingRule | null {
  const shortcut = parseKeybindingShortcut(rule.key);
  if (!shortcut) return null;

  if (rule.when !== undefined) {
    const whenAst = parseWhenExpression(rule.when);
    if (!whenAst) return null;
    return { command: rule.command, shortcut, whenAst };
  }

  return { command: rule.command, shortcut };
}

export function compileResolvedKeybindingsConfig(config: ReadonlyArray<KeybindingRule>): ResolvedKeybindingsConfig {
  return config
    .map((rule) => compileResolvedKeybindingRule(rule))
    .filter((rule): rule is ResolvedKeybindingRule => rule !== null);
}

function hasSameShortcutContext(left: KeybindingRule, right: KeybindingRule): boolean {
  return left.key === right.key && (left.when ?? '') === (right.when ?? '');
}

export function mergeWithDefaultKeybindings(custom: ResolvedKeybindingsConfig): ResolvedKeybindingsConfig {
  const defaults = compileResolvedKeybindingsConfig(DEFAULT_KEYBINDINGS);
  if (custom.length === 0) return [...defaults];

  const overriddenCommands = new Set(custom.map((b) => b.command));
  const retainedDefaults = defaults.filter((b) => !overriddenCommands.has(b.command));
  return [...retainedDefaults, ...custom];
}

export function syncMissingDefaults(existing: ReadonlyArray<KeybindingRule>): ReadonlyArray<KeybindingRule> {
  const existingCommands = new Set(existing.map((e) => e.command));
  const missing: KeybindingRule[] = [];

  for (const defaultRule of DEFAULT_KEYBINDINGS) {
    if (existingCommands.has(defaultRule.command)) continue;
    const conflict = existing.find((e) => hasSameShortcutContext(e, defaultRule));
    if (conflict) continue;
    missing.push(defaultRule);
  }

  return missing.length > 0 ? [...existing, ...missing] : existing;
}

export function encodeShortcut(shortcut: KeybindingShortcut): string {
  const modifiers: string[] = [];
  if (shortcut.modKey) modifiers.push('mod');
  if (shortcut.metaKey) modifiers.push('meta');
  if (shortcut.ctrlKey) modifiers.push('ctrl');
  if (shortcut.altKey) modifiers.push('alt');
  if (shortcut.shiftKey) modifiers.push('shift');
  const key = shortcut.key === ' ' ? 'space' : shortcut.key;
  return [...modifiers, key].join('+');
}

function getPrecedence(node: KeybindingWhenNode): number {
  switch (node.type) {
    case 'identifier': return 3;
    case 'not': return 2;
    case 'and': return 1;
    case 'or': return 0;
  }
}

function parenthesizeIfLower(child: KeybindingWhenNode, parentPrecedence: number): string {
  const encoded = encodeWhenAst(child);
  return getPrecedence(child) < parentPrecedence ? `(${encoded})` : encoded;
}

export function encodeWhenAst(node: KeybindingWhenNode): string {
  switch (node.type) {
    case 'identifier': return node.name;
    case 'not': return `!${parenthesizeIfLower(node.node, getPrecedence(node))}`;
    case 'and': return `${parenthesizeIfLower(node.left, getPrecedence(node))} && ${parenthesizeIfLower(node.right, getPrecedence(node))}`;
    case 'or': return `${parenthesizeIfLower(node.left, getPrecedence(node))} || ${parenthesizeIfLower(node.right, getPrecedence(node))}`;
  }
}
