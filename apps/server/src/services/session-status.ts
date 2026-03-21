import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Ref from 'effect/Ref';

import type { SessionStatus, WsPush } from '@glade/contracts';

function statusMessage(state: SessionStatus['state'], reason?: string): SessionStatus {
  return reason ? { _tag: 'SessionStatus', state, reason } : { _tag: 'SessionStatus', state };
}

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

export function createStatusPublisher(
  statusStore: { readonly set: (status: SessionStatus) => Effect.Effect<void> },
  hub: { readonly broadcast: (message: WsPush) => Effect.Effect<void> },
) {
  return (state: SessionStatus['state'], reason?: string) =>
    Effect.gen(function* () {
      const next = statusMessage(state, reason);
      yield* statusStore.set(next);
      const push: WsPush = { _tag: 'WsPush', channel: 'session.status', payload: next };
      yield* hub.broadcast(push);
    }) as Effect.Effect<void>;
}
