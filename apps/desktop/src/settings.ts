import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { DEFAULT_DESKTOP_SETTINGS, normalizeDesktopSettings, type DesktopSettings } from '@glade/shared';

export type { DesktopSettings };

export function defaultProjectPath(userDataPath: string) {
  return path.join(userDataPath, 'project');
}

export async function loadDesktopSettings(userDataPath: string) {
  try {
    const raw = await readFile(path.join(userDataPath, 'settings.json'), 'utf8');
    try {
      return normalizeDesktopSettings(JSON.parse(raw));
    } catch (error) {
      if (error instanceof SyntaxError) {
        return DEFAULT_DESKTOP_SETTINGS;
      }
      throw error;
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return DEFAULT_DESKTOP_SETTINGS;
    }

    throw error;
  }
}
