import type { DesktopSettings } from '@glade/shared';

const KNOWN_EDITORS = [
  { id: 'cursor', name: 'Cursor', commands: ['cursor', 'Cursor'] },
  { id: 'vscode', name: 'VS Code', commands: ['code', 'code-insiders'] },
  { id: 'zed', name: 'Zed', commands: ['zed'] },
  { id: 'nova', name: 'Nova', commands: ['nova'] },
  { id: 'sublime', name: 'Sublime Text', commands: ['subl', 'sublime_text'] },
  { id: 'vim', name: 'Vim', commands: ['vim', 'nvim', 'gvim'] },
  { id: 'emacs', name: 'Emacs', commands: ['emacs'] },
  { id: 'textmate', name: 'TextMate', commands: ['mate'] },
] as const;

export interface EditorOption {
  readonly id: string;
  readonly name: string;
  readonly commands: ReadonlyArray<string>;
}

export function getEditorOptions(): ReadonlyArray<EditorOption> {
  return [...KNOWN_EDITORS];
}

export function resolveEditorPreference(settings: DesktopSettings): string {
  const command = settings.editorCommand?.trim();
  if (!command || command === 'auto' || command === '') {
    return '';
  }

  const known = KNOWN_EDITORS.find((e) =>
    e.commands.some((c) => command === c || command.endsWith(`/${c}`)),
  );
  if (known) {
    return known.id;
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
  const trimmed = command?.trim() || '';
  if (!trimmed || trimmed === 'auto') return false;
  return KNOWN_EDITORS.some((e) =>
    e.commands.some((c) => trimmed === c || trimmed.endsWith(`/${c}`)),
  );
}
