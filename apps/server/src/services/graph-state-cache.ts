import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Ref from 'effect/Ref';

import type { GraphSnapshot } from '@glade/contracts';

export class GraphStateCache extends Context.Tag('glade/GraphStateCache')<
  GraphStateCache,
  {
    readonly clear: Effect.Effect<void>;
    readonly getSnapshot: Effect.Effect<Option.Option<GraphSnapshot>>;
    readonly getReplLines: (limit?: number) => Effect.Effect<ReadonlyArray<string>>;
    readonly clearReplLines: Effect.Effect<void>;
    readonly writeSnapshot: (snapshot: GraphSnapshot) => Effect.Effect<void>;
    readonly appendReplLine: (line: string) => Effect.Effect<void>;
  }
>() {}

// This is session replay state. Bayesgrove owns the persistent project.
export const GraphStateCacheLive = Layer.effect(
  GraphStateCache,
  Effect.gen(function* () {
    const snapshot = yield* Ref.make(Option.none<GraphSnapshot>());
    const lines = yield* Ref.make<ReadonlyArray<string>>([]);
    const clearReplLines = Ref.set(lines, []);

    return {
      clear: Ref.set(snapshot, Option.none()).pipe(Effect.zipRight(clearReplLines)),
      getSnapshot: Ref.get(snapshot),
      getReplLines: (limit = 500) => Ref.get(lines).pipe(
        Effect.map((buffer) => {
          const count = Math.max(0, Math.trunc(limit));
          return count > 0 ? buffer.slice(-count) : [];
        }),
      ),
      clearReplLines,
      writeSnapshot: (value) => Ref.set(snapshot, Option.some(value)),
      appendReplLine: (line) => Ref.update(lines, (buffer) => [...buffer, line].slice(-500)),
    };
  }),
);
