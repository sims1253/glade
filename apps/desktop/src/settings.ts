import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { DEFAULT_DESKTOP_SETTINGS, normalizeDesktopSettings, type DesktopSettings } from '@glade/shared';

export type { DesktopSettings };
export { DEFAULT_DESKTOP_SETTINGS, normalizeDesktopSettings };

const EDITOR_CANDIDATES = ['code', 'positron', 'cursor', 'nvim', 'vim'];
const COMMAND_EXISTS_TIMEOUT_MS = 1_500;
const execFileAsync = promisify(execFile);
const commandExistsCache = new Map<string, Promise<boolean>>();

export function settingsPath(userDataPath: string) {
  return path.join(userDataPath, 'settings.json');
}

export function defaultProjectPath(userDataPath: string) {
  return path.join(userDataPath, 'project');
}

export async function loadDesktopSettings(userDataPath: string) {
  try {
    const raw = await readFile(settingsPath(userDataPath), 'utf8');
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

export async function saveDesktopSettings(userDataPath: string, settings: DesktopSettings) {
  const next = normalizeDesktopSettings(settings);
  await mkdir(userDataPath, { recursive: true });
  await writeFile(settingsPath(userDataPath), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

export async function resetDesktopSettings(userDataPath: string) {
  await rm(settingsPath(userDataPath), { force: true });
  return DEFAULT_DESKTOP_SETTINGS;
}

async function commandExists(command: string) {
  const cached = commandExistsCache.get(command);
  if (cached) {
    return cached;
  }

  const pending = execFileAsync(command, ['--version'], {
    timeout: COMMAND_EXISTS_TIMEOUT_MS,
    windowsHide: true,
  })
    .then(() => true)
    .catch(() => false);
  commandExistsCache.set(command, pending);
  return pending;
}

export async function resolveEditorCommand(settings: DesktopSettings) {
  if (settings.editorCommand !== 'auto') {
    return settings.editorCommand;
  }

  const envEditor = process.env.BAYESGROVE_EDITOR?.trim() || process.env.EDITOR?.trim();
  if (envEditor) {
    return envEditor;
  }

  for (const candidate of EDITOR_CANDIDATES) {
    if (await commandExists(candidate)) {
      return candidate;
    }
  }

  return 'code';
}
