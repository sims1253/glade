export const APP_DISPLAY_NAME = 'Glade';
export const DEFAULT_SERVER_PORT = 7842;
export const DEFAULT_WEB_DEV_PORT = 5173;
export const HEALTH_PATH = '/health';
export const WS_PATH = '/ws';

export * from './schema-json.ts';
export * from './json-guards.ts';
export * from './storage.ts';
export * from './struct.ts';
export * from './platform.ts';

export interface DesktopSettings {
  readonly rExecutablePath: string;
  readonly editorCommand: string;
  readonly updateChannel: 'stable' | 'beta';
  readonly projectPath?: string;
}

export type DesktopUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export type DesktopUpdateErrorContext = 'check' | 'download' | 'install' | null;

export interface DesktopUpdateState {
  readonly status: DesktopUpdateStatus;
  readonly version: string | null;
  readonly message: string | null;
  readonly progressPercent: number | null;
  readonly canRetry: boolean;
  readonly errorContext: DesktopUpdateErrorContext;
  readonly checkedAt: string | null;
}

export interface DesktopBridge {
  readonly getWsUrl: () => string;
  readonly pickFile: () => Promise<string | null>;
  readonly pickDirectory: () => Promise<string | null>;
  readonly pickExecutable: () => Promise<string | null>;
  readonly openDetachedTerminal: () => Promise<boolean>;
  readonly onDetachedTerminalState: (listener: (isDetached: boolean) => void) => () => void;
  readonly openExternal: (url: string) => Promise<boolean>;
  readonly getUpdateState: () => Promise<DesktopUpdateState>;
  readonly checkForUpdates: () => Promise<DesktopUpdateState>;
  readonly downloadUpdate: () => Promise<DesktopUpdateState>;
  readonly installDownloadedUpdate: () => Promise<boolean>;
  readonly onUpdateState: (listener: (state: DesktopUpdateState) => void) => () => void;
}

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  rExecutablePath: 'Rscript',
  editorCommand: 'auto',
  updateChannel: 'stable',
};

function isSupportedUpdateChannel(value: unknown): value is DesktopSettings['updateChannel'] {
  return value === 'stable' || value === 'beta';
}

export function normalizeExecutable(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
}

export function normalizeDesktopSettings(input: unknown): DesktopSettings {
  const source = input && typeof input === 'object' ? input as Partial<DesktopSettings> : {};
  return {
    rExecutablePath: normalizeExecutable(source.rExecutablePath, DEFAULT_DESKTOP_SETTINGS.rExecutablePath),
    editorCommand: normalizeExecutable(source.editorCommand, DEFAULT_DESKTOP_SETTINGS.editorCommand),
    updateChannel: isSupportedUpdateChannel(source.updateChannel)
      ? source.updateChannel
      : DEFAULT_DESKTOP_SETTINGS.updateChannel,
    ...(typeof source.projectPath === 'string' && source.projectPath.trim() ? { projectPath: source.projectPath.trim() } : {}),
  };
}
