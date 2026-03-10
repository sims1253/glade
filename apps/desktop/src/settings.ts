import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export interface DesktopSettings {
  readonly rExecutablePath: string;
  readonly editorCommand: string;
  readonly updateChannel: 'stable' | 'beta';
}

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  rExecutablePath: 'Rscript',
  editorCommand: 'auto',
  updateChannel: 'stable',
};

const EDITOR_CANDIDATES = ['code', 'positron', 'cursor', 'nvim', 'vim'];
const COMMAND_EXISTS_TIMEOUT_MS = 1_500;
const execFileAsync = promisify(execFile);
const commandExistsCache = new Map<string, Promise<boolean>>();

function isSupportedUpdateChannel(value: unknown): value is DesktopSettings['updateChannel'] {
  return value === 'stable' || value === 'beta';
}

function normalizeExecutable(value: unknown, fallback: string) {
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
  };
}

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
        console.warn(`[desktop] settings file is malformed, using defaults: ${error.message}`);
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
