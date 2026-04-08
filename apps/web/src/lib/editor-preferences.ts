import type { DesktopSettings } from '@glade/shared';

export type EditorLaunchStyle = 'direct-path' | 'goto' | 'line-column';

export interface EditorDefinition {
  readonly id: string;
  readonly name: string;
  readonly commands: ReadonlyArray<string>;
  readonly launchStyle: EditorLaunchStyle;
}

const KNOWN_EDITORS: ReadonlyArray<EditorDefinition> = [
  { id: 'cursor', name: 'Cursor', commands: ['cursor', 'Cursor'], launchStyle: 'goto' },
  { id: 'vscode', name: 'VS Code', commands: ['code', 'code-insiders'], launchStyle: 'goto' },
  { id: 'zed', name: 'Zed', commands: ['zed', 'zeditor'], launchStyle: 'direct-path' },
  { id: 'idea', name: 'IntelliJ IDEA', commands: ['idea'], launchStyle: 'line-column' },
  { id: 'nova', name: 'Nova', commands: ['nova'], launchStyle: 'goto' },
  { id: 'sublime', name: 'Sublime Text', commands: ['subl', 'sublime_text'], launchStyle: 'goto' },
  { id: 'vim', name: 'Vim', commands: ['vim', 'nvim', 'gvim'], launchStyle: 'direct-path' },
  { id: 'emacs', name: 'Emacs', commands: ['emacs'], launchStyle: 'goto' },
  { id: 'textmate', name: 'TextMate', commands: ['mate'], launchStyle: 'goto' },
];

// Pre-normalize known editor commands for comparison
const NORMALIZED_KNOWN_COMMANDS = new Map(
  KNOWN_EDITORS.flatMap((e) => e.commands.map((c) => [c.toLowerCase(), e.id] as const)),
);

function normalizeEditorCommand(command: string): string {
  let normalized = command.trim();
  if (!normalized || normalized === 'auto') return '';

  // Handle quoted paths first (e.g., "C:\Program Files\Code.exe" --args)
  // Extract the quoted executable path before any arguments
  if (normalized.startsWith('"')) {
    const endQuote = normalized.indexOf('"', 1);
    if (endQuote !== -1) {
      normalized = normalized.slice(1, endQuote);
    }
  } else if (normalized.startsWith("'")) {
    const endQuote = normalized.indexOf("'", 1);
    if (endQuote !== -1) {
      normalized = normalized.slice(1, endQuote);
    }
  } else {
    // Unquoted path: take only the first token (the executable) before any arguments
    const spaceIndex = normalized.indexOf(' ');
    if (spaceIndex !== -1) {
      normalized = normalized.slice(0, spaceIndex);
    }
  }

  // Extract basename handling both '/' and '\' separators
  const lastSep = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  if (lastSep !== -1) {
    normalized = normalized.slice(lastSep + 1);
  }

  // Lower-case and strip common extensions
  normalized = normalized.toLowerCase();
  for (const ext of ['.exe', '.cmd', '.bat']) {
    if (normalized.endsWith(ext)) {
      normalized = normalized.slice(0, -ext.length);
      break;
    }
  }

  return normalized;
}

export interface EditorOption {
  readonly id: string;
  readonly name: string;
  readonly commands: ReadonlyArray<string>;
}

export function getEditorOptions(): ReadonlyArray<EditorOption> {
  return [...KNOWN_EDITORS];
}

function resolveEditorDefinition(command: string): EditorDefinition | null {
  const normalized = normalizeEditorCommand(command);
  if (!normalized) return null;
  const editorId = NORMALIZED_KNOWN_COMMANDS.get(normalized);
  if (!editorId) return null;
  return KNOWN_EDITORS.find((e) => e.id === editorId) ?? null;
}

export function resolveEditorPreference(settings: DesktopSettings): string {
  const command = settings.editorCommand?.trim();
  if (!command || command === 'auto' || command === '') {
    return '';
  }

  const normalized = normalizeEditorCommand(command);
  const knownId = NORMALIZED_KNOWN_COMMANDS.get(normalized);
  if (knownId) {
    return knownId;
  }

  return command;
}

export function getEditorDisplayName(editorId: string): string {
  const known = KNOWN_EDITORS.find((e) => e.id === editorId);
  if (known) return known.name;
  if (!editorId) return 'System Default';
  return editorId;
}

export function isKnownEditor(command: string): boolean {
  const normalized = normalizeEditorCommand(command);
  if (!normalized) return false;
  return NORMALIZED_KNOWN_COMMANDS.has(normalized);
}

export function getEditorLaunchStyle(editorCommand: string): EditorLaunchStyle {
  const definition = resolveEditorDefinition(editorCommand);
  return definition?.launchStyle ?? 'goto';
}
