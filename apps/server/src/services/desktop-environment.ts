import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Ref from 'effect/Ref';

import type {
  DesktopEnvironmentState,
  DesktopPreflightIssue,
  DesktopPreflightState,
  DesktopSettings,
} from '@glade/contracts';
import { DEFAULT_DESKTOP_SETTINGS, normalizeDesktopSettings as baseNormalizeDesktopSettings } from '@glade/shared';
import { runBufferedProcess, type BufferedProcessResult } from '@glade/shared/process';

import { ServerConfig } from '../config';
import { CommandDispatchError } from '../errors';

const PROBE_TIMEOUT_MS = 10_000;
const COMMAND_EXISTS_TIMEOUT_MS = 1_500;
const COMMAND_EXISTS_CACHE_TTL_MS = 30_000;
const EDITOR_CANDIDATES = ['code', 'positron', 'cursor', 'nvim', 'vim'];

type CommandExistsEntry = {
  readonly expiresAt: number;
  readonly promise: Promise<boolean>;
};

function normalizeProjectPath(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed === '~') {
    return os.homedir();
  }

  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.join(os.homedir(), trimmed.slice(2));
  }

  return trimmed;
}

export function normalizeDesktopSettings(input: unknown): DesktopSettings {
  const source = input && typeof input === 'object' ? input as Partial<DesktopSettings> : {};
  const projectPath = normalizeProjectPath(source.projectPath);
  const base = baseNormalizeDesktopSettings(source);
  return {
    ...base,
    ...(projectPath ? { projectPath } : {}),
  };
}

function settingsPath(stateDir: string) {
  return path.join(stateDir, 'settings.json');
}

function defaultProjectPath(stateDir: string) {
  return path.join(stateDir, 'project');
}

async function loadDesktopSettings(stateDir: string) {
  try {
    const raw = await readFile(settingsPath(stateDir), 'utf8');
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

async function persistDesktopSettings(stateDir: string, settings: DesktopSettings) {
  const next = normalizeDesktopSettings(settings);
  await mkdir(stateDir, { recursive: true });
  await writeFile(settingsPath(stateDir), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

async function resetDesktopSettings(stateDir: string) {
  await rm(settingsPath(stateDir), { force: true });
  return DEFAULT_DESKTOP_SETTINGS;
}

function describePreflightIssues(environment: DesktopEnvironmentState) {
  const message = environment.preflight.issues
    .map((issue) => issue.description.trim())
    .filter((description) => description.length > 0)
    .join(' ');
  return message || 'Could not bootstrap the selected Bayesgrove project.';
}

async function commandExists(command: string, cache: Map<string, CommandExistsEntry>) {
  const cached = cache.get(command);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }

  const pending = runBufferedProcess(
    { command, args: ['--version'], timeoutMs: COMMAND_EXISTS_TIMEOUT_MS },
  )
    .then(({ exitCode }) => exitCode === 0)
    .catch(() => false);
  cache.set(command, {
    expiresAt: Date.now() + COMMAND_EXISTS_CACHE_TTL_MS,
    promise: pending,
  });
  return pending;
}

function missingRIssue(rExecutablePath: string): DesktopPreflightIssue {
  return {
    code: 'r_missing',
    title: 'Install R before using Glade',
    description: `Glade could not find an R executable at "${rExecutablePath}". R is required and is not bundled with the app.`,
    href: 'https://cran.r-project.org/',
  };
}

function missingBayesgroveIssue(rExecutablePath: string): DesktopPreflightIssue {
  return {
    code: 'bayesgrove_missing',
    title: 'Install the bayesgrove R package',
    description: 'Glade found R, but the bayesgrove package is not installed yet.',
    command: `${JSON.stringify(rExecutablePath)} -e "install.packages('pak', repos = 'https://cloud.r-project.org'); pak::pkg_install('sims1253/bayesgrove')"`,
  };
}

function projectBootstrapIssue(message: string): DesktopPreflightIssue {
  return {
    code: 'project_bootstrap_failed',
    title: 'Could not prepare the local bayesgrove project',
    description: message,
  };
}

function environmentInspectionIssue(message: string): DesktopPreflightIssue {
  return {
    code: 'environment_inspection_failed',
    title: 'Could not inspect the local R environment',
    description: message,
  };
}

async function runProbe(rExecutablePath: string, expression: string) {
  const result = await runBufferedProcess(
    {
      command: rExecutablePath,
      args: ['-e', expression],
      timeoutMs: PROBE_TIMEOUT_MS,
    },
  );
  return result;
}

function probeMessages(probe: BufferedProcessResult): Array<string> {
  return [probe.stderr, probe.stdout]
    .flatMap((chunk) => typeof chunk === 'string' ? chunk.split(/\r?\n/u) : [])
    .map((line) => line.trim())
    .filter((line, index, array) => line.length > 0 && array.indexOf(line) === index);
}

function prepareProjectExpression(projectPath: string) {
  return [
    `project_path <- ${JSON.stringify(projectPath)}`,
    'dir.create(project_path, recursive = TRUE, showWarnings = FALSE)',
    'opened <- tryCatch({ bayesgrove::bg_open(project_path); TRUE }, error = function(error) { message("bg_open failed: ", conditionMessage(error)); FALSE })',
    'if (!isTRUE(opened)) {',
    '  initialized <- tryCatch({ bayesgrove::bg_init(path = project_path); TRUE }, error = function(error) { message("bg_init failed: ", conditionMessage(error)); FALSE })',
    '  if (!isTRUE(initialized)) { quit(status = 11) }',
    '}',
    'quit(status = 0)',
  ].join('; ');
}

function describeProbeFailure(probe: Awaited<ReturnType<typeof runProbe>>, fallback: string) {
  const snippet = probeMessages(probe).join(' ');
  return snippet ? `${fallback} ${snippet}` : fallback;
}

export async function runDesktopPreflight(settings: DesktopSettings, projectPath: string): Promise<DesktopPreflightState> {
  const issues: DesktopPreflightIssue[] = [];

  const rProbe = await runBufferedProcess(
    {
      command: settings.rExecutablePath,
      args: ['--version'],
      timeoutMs: PROBE_TIMEOUT_MS,
    },
  );

  if (rProbe.exitCode !== 0 && rProbe.exitCode !== null) {
    issues.push(missingRIssue(settings.rExecutablePath));
    return {
      checkedAt: new Date().toISOString(),
      projectPath,
      status: 'action_required',
      issues,
    };
  }

  const bayesgroveProbe = await runProbe(
    settings.rExecutablePath,
    'quit(status = if (requireNamespace("bayesgrove", quietly = TRUE)) 0 else 2)',
  );

  if (bayesgroveProbe.exitCode === 2) {
    issues.push(missingBayesgroveIssue(settings.rExecutablePath));
    return {
      checkedAt: new Date().toISOString(),
      projectPath,
      status: 'action_required',
      issues,
    };
  }

  if (bayesgroveProbe.exitCode !== null && bayesgroveProbe.exitCode !== 0) {
    issues.push(environmentInspectionIssue(describeProbeFailure(
      bayesgroveProbe,
      `R exited with status ${bayesgroveProbe.exitCode} while checking bayesgrove.`,
    )));
  } else if (bayesgroveProbe.exitCode === 0) {
    mkdirSync(projectPath, { recursive: true });
    const bootstrap = await runProbe(settings.rExecutablePath, prepareProjectExpression(projectPath));

    if (bootstrap.exitCode !== null && bootstrap.exitCode !== 0) {
      issues.push(projectBootstrapIssue(describeProbeFailure(
        bootstrap,
        `R exited with status ${bootstrap.exitCode} while opening or initializing the project directory.`,
      )));
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    projectPath,
    status: issues.length > 0 ? 'action_required' : 'ok',
    issues,
  };
}

async function resolveEditorCommand(settings: DesktopSettings, cache: Map<string, CommandExistsEntry>) {
  if (settings.editorCommand !== 'auto') {
    return settings.editorCommand;
  }

  const envEditor = process.env.BAYESGROVE_EDITOR?.trim() || process.env.EDITOR?.trim();
  if (envEditor) {
    return envEditor;
  }

  for (const candidate of EDITOR_CANDIDATES) {
    if (await commandExists(candidate, cache)) {
      return candidate;
    }
  }

  return 'code';
}

async function loadDesktopEnvironmentState(stateDir: string, projectPathOverride: string | null) {
  const settings = await loadDesktopSettings(stateDir);
  const projectPath = projectPathOverride ?? settings.projectPath ?? defaultProjectPath(stateDir);
  return {
    settings,
    preflight: await runDesktopPreflight(settings, projectPath),
  } satisfies DesktopEnvironmentState;
}

export class DesktopEnvironmentService extends Context.Tag('glade/DesktopEnvironmentService')<
  DesktopEnvironmentService,
  {
    readonly getState: Effect.Effect<DesktopEnvironmentState>;
    readonly refreshState: Effect.Effect<DesktopEnvironmentState, unknown>;
    readonly saveSettings: (settings: DesktopSettings) => Effect.Effect<DesktopEnvironmentState, unknown>;
    readonly resetSettings: Effect.Effect<DesktopEnvironmentState, unknown>;
    readonly bootstrapProject: (projectPath: string) => Effect.Effect<DesktopEnvironmentState, unknown>;
    readonly getSessionRuntime: Effect.Effect<{
      readonly projectPath: string;
      readonly rExecutablePath: string;
      readonly editorCommand: string;
    }, unknown>;
  }
>() {}

export const DesktopEnvironmentServiceLive = Layer.scoped(
  DesktopEnvironmentService,
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const initialState = yield* Effect.tryPromise(() => loadDesktopEnvironmentState(config.stateDir, config.projectPath));
    const stateRef = yield* Ref.make(initialState);
    const commandExistsCache = yield* Ref.make(new Map<string, CommandExistsEntry>());

    const refreshState = Ref.set(commandExistsCache, new Map<string, CommandExistsEntry>()).pipe(
      Effect.zipRight(Effect.tryPromise(() => loadDesktopEnvironmentState(config.stateDir, config.projectPath))),
      Effect.tap((state) => Ref.set(stateRef, state)),
    );

    const getState = Ref.get(stateRef);

    const saveSettings = (settings: DesktopSettings) =>
      Effect.tryPromise(() => persistDesktopSettings(config.stateDir, settings)).pipe(
        Effect.zipRight(refreshState),
      );

    const resetSettingsEffect = Effect.tryPromise(() => resetDesktopSettings(config.stateDir)).pipe(
      Effect.zipRight(refreshState),
    );

    const bootstrapProject = (projectPath: string) =>
      Effect.gen(function* () {
        const currentState = yield* getState;
        const normalizedProjectPath = normalizeProjectPath(projectPath);
        if (!normalizedProjectPath) {
          return yield* new CommandDispatchError({
            code: 'invalid_project_path',
            message: 'A project directory is required.',
          });
        }

        yield* Effect.tryPromise(() =>
          persistDesktopSettings(config.stateDir, {
            ...currentState.settings,
            projectPath: normalizedProjectPath,
          }),
        );

        const nextState = yield* refreshState;
        if (nextState.preflight.status !== 'ok') {
          return yield* new CommandDispatchError({
            code: nextState.preflight.issues[0]?.code ?? 'project_bootstrap_failed',
            message: describePreflightIssues(nextState),
          });
        }

        return nextState;
      });

    const getSessionRuntime = getState.pipe(
      Effect.flatMap((state) =>
        Effect.flatMap(Ref.get(commandExistsCache), (cache) =>
          Effect.tryPromise(async () => ({
            projectPath: state.preflight.projectPath,
            rExecutablePath: state.settings.rExecutablePath,
            editorCommand: await resolveEditorCommand(state.settings, cache),
          })))),
    );

    return {
      getState,
      refreshState,
      saveSettings,
      resetSettings: resetSettingsEffect,
      bootstrapProject,
      getSessionRuntime,
    };
  }),
);
