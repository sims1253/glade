import { spawn, type ChildProcess } from 'node:child_process';

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Ref from 'effect/Ref';

import type { ReplOutput, SessionStatus } from '@glade/contracts';

import { ServerConfig } from '../config';
import { FrontendBroadcast } from './frontend-broadcast';
import { GraphStateCache } from './graph-state-cache';
import { SessionStatusStore } from './session-status';

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
  return reason ? { type: 'SessionStatus', state, reason } : { type: 'SessionStatus', state };
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

function flushBufferedLines(buffer: string) {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n');
  const tail = normalized.endsWith('\n') ? '' : parts.pop() ?? '';
  return { lines: parts, tail };
}

export class RProcessService extends Context.Tag('glade/RProcessService')<
  RProcessService,
  {
    readonly start: Effect.Effect<void>;
    readonly stop: Effect.Effect<void>;
    readonly restart: Effect.Effect<void>;
    readonly isRunning: Effect.Effect<boolean>;
    readonly sendInput: (data: string) => Effect.Effect<void, Error>;
  }
>() {}

export const RProcessServiceLive = Layer.effect(
  RProcessService,
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const statusStore = yield* SessionStatusStore;
    const broadcast = yield* FrontendBroadcast;
    const cache = yield* GraphStateCache;
    const childRef = yield* Ref.make<ChildProcess | null>(null);
    const stoppingRef = yield* Ref.make(false);
    const stdoutBufferRef = yield* Ref.make('');
    const stderrBufferRef = yield* Ref.make('');
    const readySeenRef = yield* Ref.make(false);

    const publishStatus = (state: SessionStatus['state'], reason?: string) =>
      Effect.gen(function* () {
        const next = statusMessage(state, reason);
        yield* statusStore.set(next);
        yield* broadcast.broadcast(next);
      });

    const publishReplLine = (line: string) =>
      Effect.gen(function* () {
        yield* cache.appendReplLine(line);
        const message: ReplOutput = { type: 'ReplOutput', line };
        yield* broadcast.broadcast(message);
      });

    const handleLine = (line: string) =>
      Effect.gen(function* () {
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

    const handleStreamChunk = (stream: 'stdout' | 'stderr', chunk: string) => {
      void Effect.runPromise(
        Effect.gen(function* () {
          const ref = stream === 'stdout' ? stdoutBufferRef : stderrBufferRef;
          const current = yield* Ref.get(ref);
          const { lines, tail } = flushBufferedLines(current + chunk);
          yield* Ref.set(ref, tail);
          for (const line of lines) {
            yield* handleLine(line);
          }
        }),
      );
    };

    const sendInput = (data: string) =>
      Effect.gen(function* () {
        const child = yield* Ref.get(childRef);
        if (!child?.stdin || child.stdin.destroyed) {
          return yield* Effect.fail(new Error('R process stdin is not available.'));
        }
        const stdin = child.stdin;

        yield* Effect.async<void, Error>((resume) => {
          stdin.write(data, 'utf8', (error) => {
            if (error) {
              resume(Effect.fail(new Error(`Failed to write to R stdin: ${error.message}`)));
              return;
            }
            resume(Effect.void);
          });
        });
      });

    const stop = Effect.gen(function* () {
      yield* Ref.set(stoppingRef, true);
      const current = yield* Ref.get(childRef);
      if (!current) {
        return;
      }

      yield* Effect.tryPromise(
        () =>
          new Promise<void>((resolve) => {
            current.once('exit', () => resolve());
            current.kill('SIGTERM');
            setTimeout(() => {
              if (current.exitCode === null && current.signalCode === null) {
                current.kill('SIGKILL');
              }
              resolve();
            }, 2_000).unref();
          }),
      ).pipe(Effect.orDie);
      yield* Ref.set(childRef, null);
      yield* Ref.set(stdoutBufferRef, '');
      yield* Ref.set(stderrBufferRef, '');
      yield* Ref.set(readySeenRef, false);
    });

    const start = Effect.gen(function* () {
      if (!config.projectPath) {
        yield* publishStatus('error', 'project_path_not_configured');
        return;
      }

      const current = yield* Ref.get(childRef);
      if (current) {
        return;
      }

      yield* Ref.set(stoppingRef, false);
      yield* Ref.set(readySeenRef, false);
      yield* publishStatus('connecting');

      const child = yield* Effect.sync(() =>
        spawn(config.rExecutable, ['-e', makeRExpression(config.projectPath!, config.rHost, config.rPort, config.rPollInterval)], {
          cwd: config.rootDir,
          env: process.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      );

      child.stdin.setDefaultEncoding('utf8');
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => handleStreamChunk('stdout', String(chunk)));
      child.stderr.on('data', (chunk) => handleStreamChunk('stderr', String(chunk)));
      child.once('error', (error) => {
        void Effect.runPromise(
          Effect.gen(function* () {
            yield* Ref.set(childRef, null);
            yield* publishStatus('error', `r_process_error:${error.message}`);
          }),
        );
      });
      child.once('exit', (code, signal) => {
        void Effect.runPromise(
          Effect.gen(function* () {
            const stopping = yield* Ref.get(stoppingRef);
            yield* Ref.set(childRef, null);
            if (!stopping) {
              yield* publishStatus('error', `r_process_exit:${code ?? 'null'}:${signal ?? 'null'}`);
            }
          }),
        );
      });

      yield* Ref.set(childRef, child);
    });

    const restart = Effect.gen(function* () {
      yield* cache.clear;
      yield* stop;
      yield* start;
    });

    const isRunning = Ref.get(childRef).pipe(Effect.map((child) => child !== null));

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
