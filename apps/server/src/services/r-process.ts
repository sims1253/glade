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

    export class RProcessService extends Context.Tag('glade/RProcessService')<
      RProcessService,
      {
        readonly start: Effect.Effect<void>;
        readonly stop: Effect.Effect<void>;
        readonly restart: Effect.Effect<void>;
        readonly isRunning: Effect.Effect<boolean>;
      }
    >() {}

    function statusMessage(state: SessionStatus['state'], reason?: string): SessionStatus {
      return reason ? { type: 'SessionStatus', state, reason } : { type: 'SessionStatus', state };
    }

    function makeRExpression(projectPath: string, host: string, port: number, pollInterval: number) {
      return [
        'options(warn=1)',
        `project <- bayesgrove::bg_open(${JSON.stringify(projectPath)})`,
        `server <- bayesgrove::bg_serve(project, host = ${JSON.stringify(host)}, port = ${port}, poll_interval = ${pollInterval})`,
        'repeat { server$service(timeout = 0.05); Sys.sleep(0.05) }',
      ].join('; ');
    }

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

        const publishStatus = (state: SessionStatus['state'], reason?: string) =>
          Effect.gen(function* () {
            const next = statusMessage(state, reason);
            yield* statusStore.set(next);
            yield* broadcast.broadcast(next);
          });

        const publishReplLine = (line: string) =>
          Effect.gen(function* () {
            if (line.trim().length === 0) {
              return;
            }
            yield* cache.appendReplLine(line);
            const message: ReplOutput = { type: 'ReplOutput', line };
            yield* broadcast.broadcast(message);
          });

        const flushBufferedLines = (buffer: string) => {
          const normalized = buffer.replace(/\r\n/g, '\n');
          const parts = normalized.split('\n');
          const tail = normalized.endsWith('\n') ? '' : parts.pop() ?? '';
          return { lines: parts.filter((line) => line.length > 0), tail };
        };

        const handleStreamChunk = (stream: 'stdout' | 'stderr', chunk: string) => {
          void Effect.runPromise(
            Effect.gen(function* () {
              const ref = stream === 'stdout' ? stdoutBufferRef : stderrBufferRef;
              const current = yield* Ref.get(ref);
              const { lines, tail } = flushBufferedLines(current + chunk);
              yield* Ref.set(ref, tail);
              for (const line of lines) {
                yield* publishReplLine(line);
              }
            }),
          );
        };

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
          yield* publishStatus('connecting');

          const child = yield* Effect.sync(() =>
            spawn(config.rExecutable, ['-e', makeRExpression(config.projectPath!, config.rHost, config.rPort, config.rPollInterval)], {
              cwd: config.rootDir,
              env: process.env,
              stdio: ['ignore', 'pipe', 'pipe'],
            }),
          );

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
        };
      }),
    );
