import { DESKTOP_GLOBAL_KEY } from '@glade/shared';

export function readDesktopRuntime() {
  return window[DESKTOP_GLOBAL_KEY as '__GLADE_DESKTOP__'];
}

export function isDesktopRuntime() {
  return Boolean(readDesktopRuntime()) || window.navigator.userAgent.includes('Electron');
}

export function hasNativeFilePicker() {
  return typeof readDesktopRuntime()?.selectFilePath === 'function';
}

export function canDetachTerminal() {
  return typeof readDesktopRuntime()?.openDetachedTerminal === 'function' || window.navigator.userAgent.includes('Electron');
}

export function subscribeToDetachedTerminalState(listener: (isDetached: boolean) => void) {
  return readDesktopRuntime()?.onDetachedTerminalStateChange?.(listener) ?? (() => {});
}

export function websocketUrl() {
  const runtime = readDesktopRuntime();
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = runtime ? `127.0.0.1:${runtime.serverPort}` : window.location.host;
  return `${protocol}//${host}/ws`;
}
