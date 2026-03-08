import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  Command,
  HealthResponse,
  ServerMessage,
  SessionStatus,
} from './messages';

function roundTrip<TSchema extends Schema.Schema.AnyNoContext>(
  schema: TSchema,
  value: Schema.Schema.Type<TSchema>,
) {
  const encoded = Schema.encodeSync(schema)(value);
  expect(Schema.decodeUnknownSync(schema)(encoded)).toEqual(value);
}

describe('contracts', () => {
  it('round-trips health responses', () => {
    roundTrip(HealthResponse, { status: 'ok', version: '0.1.0' });
  });

  it('round-trips session status messages', () => {
    roundTrip(SessionStatus, { type: 'SessionStatus', state: 'ready' });
  });

  it('round-trips command unions', () => {
    roundTrip(Command, { type: 'Ping' });
  });

  it('round-trips server message unions', () => {
    roundTrip(ServerMessage, { type: 'Pong', at: new Date().toISOString() });
  });
});
