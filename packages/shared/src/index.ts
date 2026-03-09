export const APP_DISPLAY_NAME = 'Glade';
export const DEFAULT_SERVER_PORT = 7842;
export const DEFAULT_WEB_DEV_PORT = 5173;
export const HEALTH_PATH = '/health';
export const WS_PATH = '/ws';
export const EXTENSION_BUNDLES_PATH = '/extension-bundles';
export const DESKTOP_GLOBAL_KEY = '__GLADE_DESKTOP__';

export type UpdateChannel = 'stable' | 'beta';

export interface DesktopSettings {
  readonly rExecutablePath: string;
  readonly editorCommand: string;
  readonly updateChannel: UpdateChannel;
}

export type DesktopPreflightIssueCode =
  | 'r_missing'
  | 'bayesgrove_missing'
  | 'project_bootstrap_failed'
  | 'session_connection_failed';

export interface DesktopPreflightIssue {
  readonly code: DesktopPreflightIssueCode;
  readonly title: string;
  readonly description: string;
  readonly command?: string | null;
  readonly href?: string | null;
}

export interface DesktopPreflightState {
  readonly checkedAt: string;
  readonly projectPath: string;
  readonly status: 'ok' | 'action_required';
  readonly issues: ReadonlyArray<DesktopPreflightIssue>;
}

export type DesktopUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface DesktopUpdateState {
  readonly channel: UpdateChannel;
  readonly status: DesktopUpdateStatus;
  readonly version: string | null;
  readonly message: string | null;
  readonly progressPercent: number | null;
}

export interface DesktopRuntimeSnapshot {
  readonly settings: DesktopSettings;
  readonly preflight: DesktopPreflightState;
  readonly update: DesktopUpdateState;
  readonly logTail: ReadonlyArray<string>;
}

export interface DesktopRuntimeInfo {
  readonly platform: string;
  readonly serverPort: number;
  readonly selectFilePath?: () => Promise<string | null>;
  readonly selectExecutablePath?: () => Promise<string | null>;
  readonly openDetachedTerminal?: () => Promise<boolean>;
  readonly getDesktopState?: () => Promise<DesktopRuntimeSnapshot>;
  readonly refreshDesktopState?: () => Promise<DesktopRuntimeSnapshot>;
  readonly saveDesktopSettings?: (settings: DesktopSettings) => Promise<DesktopRuntimeSnapshot>;
  readonly resetDesktopSettings?: () => Promise<DesktopRuntimeSnapshot>;
  readonly checkForUpdates?: () => Promise<DesktopRuntimeSnapshot>;
  readonly downloadUpdate?: () => Promise<DesktopRuntimeSnapshot>;
  readonly installDownloadedUpdate?: () => Promise<boolean>;
  readonly onDetachedTerminalStateChange?: (listener: (isDetached: boolean) => void) => () => void;
  readonly onDesktopStateChange?: (listener: (state: DesktopRuntimeSnapshot) => void) => () => void;
}
