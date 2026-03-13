import type { ITheme } from '@xterm/xterm';

function getColorSchemeMediaQuery() {
  if (typeof window.matchMedia !== 'function') {
    return null;
  }

  return window.matchMedia('(prefers-color-scheme: dark)');
}

export function terminalThemeFromApp(): ITheme {
  const isDark =
    document.documentElement.classList.contains('dark') ||
    getColorSchemeMediaQuery()?.matches === true;

  if (isDark) {
    return {
      background: '#050b14',
      foreground: '#d7e5f2',
      cursor: '#8ef0b6',
      selectionBackground: 'rgba(86, 173, 120, 0.35)',
      black: '#050b14',
      red: '#ff7b72',
      green: '#7ee787',
      yellow: '#f2cc60',
      blue: '#79c0ff',
      magenta: '#d2a8ff',
      cyan: '#76e3ea',
      white: '#d7e5f2',
      brightBlack: '#768390',
      brightRed: '#ffa198',
      brightGreen: '#56d364',
      brightYellow: '#e3b341',
      brightBlue: '#79c0ff',
      brightMagenta: '#d2a8ff',
      brightCyan: '#39c5cf',
      brightWhite: '#f0f6fc',
    };
  }

  return {
    background: '#ffffff',
    foreground: '#334155',
    cursor: '#2563eb',
    selectionBackground: 'rgba(37, 99, 235, 0.2)',
    black: '#0f172a',
    red: '#dc2626',
    green: '#16a34a',
    yellow: '#ca8a04',
    blue: '#2563eb',
    magenta: '#9333ea',
    cyan: '#0891b2',
    white: '#f8fafc',
    brightBlack: '#475569',
    brightRed: '#ef4444',
    brightGreen: '#22c55e',
    brightYellow: '#eab308',
    brightBlue: '#3b82f6',
    brightMagenta: '#a855f7',
    brightCyan: '#06b6d4',
    brightWhite: '#ffffff',
  };
}

export function observeThemeChanges(callback: (theme: ITheme) => void): () => void {
  const observer = new MutationObserver(() => {
    callback(terminalThemeFromApp());
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style'],
  });

  const mediaQuery = getColorSchemeMediaQuery();
  const mediaListener = () => callback(terminalThemeFromApp());
  mediaQuery?.addEventListener('change', mediaListener);

  return () => {
    observer.disconnect();
    mediaQuery?.removeEventListener('change', mediaListener);
  };
}
