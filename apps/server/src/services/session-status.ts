import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Ref from 'effect/Ref';

import type { SessionStatus } from '@glade/contracts';

export class SessionStatusStore extends Context.Tag('glade/SessionStatusStore')<
  SessionStatusStore,
  {
    readonly get: Effect.Effect<SessionStatus>;
    readonly set: (status: SessionStatus) => Effect.Effect<void>;
  }
>() {}

export const SessionStatusStoreLive = Layer.effect(
  SessionStatusStore,
  Effect.gen(function* () {
    const ref = yield* Ref.make<SessionStatus>({
      _tag: 'SessionStatus',
      state: 'connecting',
    });

    return {
      get: Ref.get(ref),
      set: (status: SessionStatus) => Ref.set(ref, status),
    };
  }),
);
