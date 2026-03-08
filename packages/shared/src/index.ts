export const APP_DISPLAY_NAME = 'Glade';
export const DEFAULT_SERVER_PORT = 7842;
export const DEFAULT_WEB_DEV_PORT = 5173;
export const HEALTH_PATH = '/health';
export const WS_PATH = '/ws';
export const DESKTOP_GLOBAL_KEY = '__GLADE_DESKTOP__';

export interface DesktopRuntimeInfo {
  readonly platform: string;
  readonly serverPort: number;
}
