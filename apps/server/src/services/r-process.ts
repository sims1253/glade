import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Ref from 'effect/Ref';
import * as Runtime from 'effect/Runtime';

import type { ReplOutput, SessionStatus, WsPush } from '@glade/contracts';
import { createLineBuffer } from '@glade/shared/logging';

import { ServerConfig } from '../config';
import { RProcessInputError } from '../errors';
import { describeUnknown, writeRDiagnosticsLine } from '../runtime-logging';
import { GraphStateCache } from './graph-state-cache';
import { ProcessSupervisor, type SupervisedProcessHandle } from './process-supervisor';
import { SessionStatusStore } from './session-status';
import { WebSocketHub } from './websocket-hub';

export const R_READY_SIGNAL = '__GLADE_READY__';
const PROTOCOL_MESSAGE_TYPES = new Set(['GraphSnapshot', 'ProtocolEvent', 'CommandResult']);

export function isProtocolFrameLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return false;
  }

  try {
    const parsed = JSON.parse(trimmed) as { protocol_version?: unknown; message_type?: unknown };
    return typeof parsed.protocol_version === 'string' &&
      typeof parsed.message_type === 'string' &&
      PROTOCOL_MESSAGE_TYPES.has(parsed.message_type);
  } catch {
    return false;
  }
}

export function classifyReplLine(line: string) {
  if (line === R_READY_SIGNAL) {
    return 'ready-signal' as const;
  }

  if (isProtocolFrameLine(line)) {
    return 'protocol-frame' as const;
  }

  return 'console' as const;
}

function statusMessage(state: SessionStatus['state'], reason?: string): SessionStatus {
  return reason ? { _tag: 'SessionStatus', state, reason } : { _tag: 'SessionStatus', state };
}

function makeRExpression(projectPath: string, host: string, port: number, pollInterval: number) {
  return `
options(warn = 1)
project <- bayesgrove::bg_open(${JSON.stringify(projectPath)})
server <- bayesgrove::bg_serve(project, host = ${JSON.stringify(host)}, port = ${port}, poll_interval = ${pollInterval})
.glade_input <- file("stdin", open = "r", blocking = FALSE)
.glade_eval <- function(command) {
  if (!nzchar(command)) {
    return(invisible(NULL))
  }

  parsed <- tryCatch(parse(text = command), error = function(error) error)
  if (inherits(parsed, "error")) {
    message(conditionMessage(parsed))
    return(invisible(NULL))
  }

  result <- tryCatch(withVisible(eval(parsed, envir = globalenv())), error = function(error) error)
  if (inherits(result, "error")) {
    message(conditionMessage(result))
    return(invisible(NULL))
  }

  if (isTRUE(result$visible)) {
    print(result$value)
  }
  invisible(NULL)
}
cat(${JSON.stringify(R_READY_SIGNAL)}, "\\n", sep = "")
repeat {
  server$service(timeout = 0.05)
  incoming <- tryCatch(readLines(.glade_input, n = 1, warn = FALSE), error = function(error) character())
  if (length(incoming) > 0) {
    for (command in incoming) {
      .glade_eval(command)
    }
  }
  flush.console()
  Sys.sleep(0.05)
}
`.trim();
}

export class RProcessService extends Context.Tag('glade/RProcessService')<
  RProcessService,
  {
    readonly start: Effect.Effect<void>;
    readonly stop: Effect.Effect<void>;
    readonly restart: Effect.Effect<void>;
    readonly isRunning: Effect.Effect<boolean>;
    readonly sendInput: (data: string) => Effect.Effect<void, RProcessInputError>;
  }
>() {}

export const RProcessServiceLive = Layer.scoped(
  RProcessService,
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const statusStore = yield* SessionStatusStore;
    const hub = yield* WebSocketHub;
    const cache = yield* GraphStateCache;
    const supervisor = yield* ProcessSupervisor;
    const effectRuntime = yield* Effect.runtime<never>();
    const processRef = yield* Ref.make<SupervisedProcessHandle | null>(null);
    const stoppingRef = yield* Ref.make(false);
    const readySeenRef = yield* Ref.make(false);

    const publishStatus = (state: SessionStatus['state'], reason?: string) =>
      Effect.gen(function* () {
        const next = statusMessage(state, reason);
        yield* statusStore.set(next);
        const push: WsPush = { _tag: 'WsPush', channel: 'session.status', payload: next };
        yield* hub.broadcast(push);
      });

    const publishReplLine = (line: string) =>
      Effect.gen(function* () {
        yield* cache.appendReplLine(line);
        const payload: ReplOutput = { _tag: 'ReplOutput', line };
        const push: WsPush = { _tag: 'WsPush', channel: 'repl.output', payload };
        yield* hub.broadcast(push);
      });

    const handleLine = (line: string) =>
      Effect.gen(function* () {
        if (yield* Ref.get(stoppingRef)) {
          return;
        }

        switch (classifyReplLine(line)) {
          case 'ready-signal':
            if (!(yield* Ref.get(readySeenRef))) {
              yield* Ref.set(readySeenRef, true);
              yield* publishStatus('ready');
            }
            return;
          case 'protocol-frame':
            return;
          case 'console':
            yield* publishReplLine(line);
        }
      });

    const onLine = (channel: 'stdout' | 'stderr', line: string) => {
      void writeRDiagnosticsLine(config.stateDir, `[${channel}] ${line}`).catch(() => undefined);
      void Runtime.runPromise(effectRuntime, handleLine(line)).catch((error) => {
        console.error('[r-process] failed to handle REPL line', error);
        void writeRDiagnosticsLine(
          config.stateDir,
          `failed to handle ${channel} line: ${describeUnknown(error)}`,
        ).catch(() => undefined);
      });
    };
    const stdoutLines = createLineBuffer((line) => onLine('stdout', line));
    const stderrLines = createLineBuffer((line) => onLine('stderr', line));

    const sendInput = (data: string) =>
      Effect.gen(function* () {
        const child = (yield* Ref.get(processRef))?.child ?? null;
        if (!child?.stdin || child.stdin.destroyed) {
          return yield* new RProcessInputError({
            message: 'R process stdin is not available.',
          });
        }
        const stdin = child.stdin;

        yield* Effect.async<void, RProcessInputError>((resume) => {
          stdin.write(data, 'utf8', (error) => {
            if (error) {
              resume(Effect.fail(new RProcessInputError({
                message: `Failed to write to R stdin: ${error.message}`,
                cause: error,
              })));
              return;
            }
            resume(Effect.void);
          });
        });
      });

    const stop = Effect.gen(function* () {
      yield* Ref.set(stoppingRef, true);
      const current = yield* Ref.get(processRef);
      if (!current) {
        return;
      }

      yield* Effect.tryPromise(() => writeRDiagnosticsLine(config.stateDir, 'stopping R process')).pipe(
        Effect.catchAll(() => Effect.void),
      );
      yield* current.terminate;
      yield* Ref.set(processRef, null);
      yield* Ref.set(readySeenRef, false);
    });

    const start = Effect.gen(function* () {
      if (!config.projectPath) {
        yield* publishStatus('error', 'project_path_not_configured');
        return;
      }

      const current = yield* Ref.get(processRef);
      if (current) {
        return;
      }

      yield* Ref.set(stoppingRef, false);
      yield* Ref.set(readySeenRef, false);
      yield* publishStatus('connecting');
      yield* Effect.tryPromise(() => writeRDiagnosticsLine(config.stateDir, 'starting R process')).pipe(
        Effect.catchAll(() => Effect.void),
      );

      const currentProcess = yield* supervisor.spawn({
        command: config.rExecutable,
        args: ['-e', makeRExpression(config.projectPath!, config.rHost, config.rPort, config.rPollInterval)],
        cwd: config.rootDir,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const child = currentProcess.child;
      if (!child.stdin || !child.stdout || !child.stderr) {
        yield* currentProcess.terminate;
        yield* Ref.set(processRef, null);
        return yield* publishStatus('error', 'r_process_stdio_unavailable');
      }

      child.stdin.setDefaultEncoding('utf8');
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => stdoutLines.push(String(chunk)));
      child.stderr.on('data', (chunk) => stderrLines.push(String(chunk)));
      child.stdout.on('end', () => stdoutLines.flush());
      child.stderr.on('end', () => stderrLines.flush());
      child.once('error', (error) => {
        void writeRDiagnosticsLine(config.stateDir, `process error: ${describeUnknown(error)}`).catch(() => undefined);
        void Runtime.runPromise(
          effectRuntime,
          Effect.gen(function* () {
            yield* Ref.set(processRef, null);
            yield* publishStatus('error', `r_process_error:${error.message}`);
          }),
        );
      });
      child.once('exit', (code, signal) => {
        void writeRDiagnosticsLine(
          config.stateDir,
          `process exit: code=${code ?? 'null'} signal=${signal ?? 'null'}`,
        ).catch(() => undefined);
        void Runtime.runPromise(
          effectRuntime,
          Effect.gen(function* () {
            const stopping = yield* Ref.get(stoppingRef);
            yield* Ref.set(processRef, null);
            if (!stopping) {
              yield* publishStatus('error', `r_process_exit:${code ?? 'null'}:${signal ?? 'null'}`);
            }
          }),
        );
      });

      yield* Ref.set(processRef, currentProcess);
    });

    const restart = Effect.gen(function* () {
      yield* cache.clear;
      yield* stop;
      yield* start;
    });

    const isRunning = Ref.get(processRef).pipe(Effect.map((child) => child !== null));

    yield* Effect.addFinalizer(() => stop);

    return {
      start,
      stop,
      restart,
      isRunning,
      sendInput,
    };
  }),
);
