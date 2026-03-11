export const APP_DISPLAY_NAME = 'Glade';
export const DEFAULT_SERVER_PORT = 7842;
export const DEFAULT_WEB_DEV_PORT = 5173;
export const HEALTH_PATH = '/health';
export const WS_PATH = '/ws';

export type DesktopUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface DesktopUpdateState {
  readonly status: DesktopUpdateStatus;
  readonly version: string | null;
  readonly message: string | null;
  readonly progressPercent: number | null;
}

export interface DesktopBridge {
  readonly getWsUrl?: () => string;
  readonly pickFile?: () => Promise<string | null>;
  readonly pickExecutable?: () => Promise<string | null>;
  readonly openDetachedTerminal?: () => Promise<boolean>;
  readonly onDetachedTerminalState?: (listener: (isDetached: boolean) => void) => () => void;
  readonly openExternal?: (url: string) => Promise<boolean>;
  readonly getUpdateState?: () => Promise<DesktopUpdateState>;
  readonly checkForUpdates?: () => Promise<DesktopUpdateState>;
  readonly downloadUpdate?: () => Promise<DesktopUpdateState>;
  readonly installDownloadedUpdate?: () => Promise<boolean>;
  readonly onUpdateState?: (listener: (state: DesktopUpdateState) => void) => () => void;
}
