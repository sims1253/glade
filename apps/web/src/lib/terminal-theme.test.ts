// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { terminalThemeFromApp } from './terminal-theme';

afterEach(() => {
  document.documentElement.classList.remove('dark');
  vi.unstubAllGlobals();
});

describe('terminalThemeFromApp', () => {
  it('returns a dark theme when the document has the "dark" class', () => {
    document.documentElement.classList.add('dark');
    const theme = terminalThemeFromApp();
    expect(theme.background).toBe('#050b14');
    expect(theme.foreground).toBe('#d7e5f2');
  });

  it('returns a light theme when there is no dark mode', () => {
    const theme = terminalThemeFromApp();
    expect(theme.background).toBe('#ffffff');
    expect(theme.foreground).toBe('#334155');
  });

  it('returns themes with all required color properties', () => {
    const theme = terminalThemeFromApp();
    const requiredKeys = ['background', 'foreground', 'cursor', 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
    for (const key of requiredKeys) {
      expect(theme).toHaveProperty(key);
    }
  });
});
