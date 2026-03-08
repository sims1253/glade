import { DESKTOP_GLOBAL_KEY } from '@glade/shared';

export function readDesktopRuntime() {
  return window[DESKTOP_GLOBAL_KEY as '__GLADE_DESKTOP__'];
}

export function websocketUrl() {
  const runtime = readDesktopRuntime();
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = runtime ? `127.0.0.1:${runtime.serverPort}` : window.location.host;
  return `${protocol}//${host}/ws`;
}
