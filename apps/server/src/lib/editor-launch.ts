import type { EditorLaunchStyle } from '@glade/contracts';

export { type EditorLaunchStyle };

export interface EditorDefinition {
  readonly commands: ReadonlyArray<string>;
  readonly launchStyle: EditorLaunchStyle;
}

const EDITOR_REGISTRY: ReadonlyMap<string, EditorDefinition> = new Map([
  ['cursor', { commands: ['cursor', 'Cursor'], launchStyle: 'goto' }],
  ['code', { commands: ['code', 'code-insiders'], launchStyle: 'goto' }],
  ['zed', { commands: ['zed', 'zeditor'], launchStyle: 'direct-path' }],
  ['idea', { commands: ['idea'], launchStyle: 'line-column' }],
  ['nova', { commands: ['nova'], launchStyle: 'goto' }],
  ['subl', { commands: ['subl', 'sublime_text'], launchStyle: 'goto' }],
  ['vim', { commands: ['vim', 'nvim', 'gvim'], launchStyle: 'direct-path' }],
  ['emacs', { commands: ['emacs'], launchStyle: 'goto' }],
  ['mate', { commands: ['mate'], launchStyle: 'goto' }],
]);

function normalizeCommand(command: string): string {
  let normalized = command.trim().toLowerCase();
  const lastSep = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  if (lastSep !== -1) {
    normalized = normalized.slice(lastSep + 1);
  }
  for (const ext of ['.exe', '.cmd', '.bat']) {
    if (normalized.endsWith(ext)) {
      normalized = normalized.slice(0, -ext.length);
      break;
    }
  }
  return normalized;
}

export function resolveEditorDefinition(editorCommand: string): EditorDefinition | null {
  const normalized = normalizeCommand(editorCommand);
  for (const [, definition] of EDITOR_REGISTRY) {
    if (definition.commands.some((cmd) => normalizeCommand(cmd) === normalized)) {
      return definition;
    }
  }
  return null;
}

export function formatEditorArgs(
  editorCommand: string,
  targetPath: string,
  line?: number,
  column?: number,
): string[] {
  const definition = resolveEditorDefinition(editorCommand);
  const launchStyle = definition?.launchStyle ?? 'goto';

  if (!line && !column) {
    return launchStyle === 'direct-path' ? [targetPath] : [targetPath];
  }

  const ln = line ?? 1;
  const col = column ?? 1;

  switch (launchStyle) {
    case 'goto':
      return [targetPath, `${ln}:${col}`];
    case 'line-column':
      return [`--line`, String(ln), '--column', String(col), targetPath];
    case 'direct-path':
    default:
      return [targetPath];
  }
}
