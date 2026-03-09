import type { ChildProcess } from 'node:child_process';

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Ref from 'effect/Ref';
import * as Runtime from 'effect/Runtime';

import {
  spawnChildProcess,
  terminateProcessTree,
  waitForBufferedProcess,
  type BufferedProcessResult,
  type ManagedProcessLike,
  type RunBufferedProcessOptions,
  type SpawnProcessOptions,
} from '@glade/shared/process';

export interface SupervisedProcessHandle {
  readonly child: ChildProcess;
  readonly terminate: Effect.Effect<void>;
}

export class ProcessSupervisor extends Context.Tag('glade/ProcessSupervisor')<
  ProcessSupervisor,
  {
    readonly spawn: (options: SpawnProcessOptions) => Effect.Effect<SupervisedProcessHandle>;
    readonly runBuffered: (options: RunBufferedProcessOptions) => Effect.Effect<BufferedProcessResult, unknown>;
  }
>() {}

function removeChild(current: ReadonlySet<ChildProcess>, child: ChildProcess) {
  const next = new Set(current);
  next.delete(child);
  return next;
}

function withSupervisorOptions<T extends SpawnProcessOptions>(options: T): T {
  return {
    ...options,
    detached: options.detached ?? process.platform !== 'win32',
  };
}

export const ProcessSupervisorLive = Layer.scoped(
  ProcessSupervisor,
  Effect.gen(function* () {
    const children = yield* Ref.make(new Set<ChildProcess>());
    const effectRuntime = yield* Effect.runtime<never>();

    const track = (child: ChildProcess) => {
      const cleanup = () => {
        Runtime.runFork(effectRuntime, Ref.update(children, (current) => removeChild(current, child)));
      };
      child.once('close', cleanup);
      child.once('error', cleanup);
      return child;
    };

    yield* Effect.addFinalizer(() =>
      Ref.get(children).pipe(
        Effect.flatMap((current) =>
          Effect.forEach(
            current,
            (child) =>
              Effect.tryPromise(() => terminateProcessTree(child as ManagedProcessLike)).pipe(
                Effect.catchAll(() => Effect.void),
              ),
            { concurrency: 'unbounded' },
          ),
        ),
        Effect.asVoid,
      ));

    return {
      spawn: (options: SpawnProcessOptions) =>
        Effect.gen(function* () {
          const child = yield* Effect.sync(() => track(spawnChildProcess(withSupervisorOptions(options))));
          yield* Ref.update(children, (current) => new Set(current).add(child));
          return {
            child,
            terminate: Effect.tryPromise(() => terminateProcessTree(child as ManagedProcessLike)).pipe(
              Effect.catchAll(() => Effect.void),
            ),
          };
        }),
      runBuffered: (options: RunBufferedProcessOptions) =>
        Effect.gen(function* () {
          const child = yield* Effect.sync(() => track(spawnChildProcess(withSupervisorOptions(options))));
          yield* Ref.update(children, (current) => new Set(current).add(child));
          return yield* Effect.tryPromise(() => waitForBufferedProcess(child, options));
        }),
    };
  }),
);
