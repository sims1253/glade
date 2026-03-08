import { Schema } from 'effect';

export const HealthResponse = Schema.Struct({
  status: Schema.Literal('ok'),
  version: Schema.String,
});
export type HealthResponse = Schema.Schema.Type<typeof HealthResponse>;

export const SessionStatus = Schema.Struct({
  type: Schema.Literal('SessionStatus'),
  state: Schema.Literal('connecting', 'ready', 'error'),
  reason: Schema.optional(Schema.String),
});
export type SessionStatus = Schema.Schema.Type<typeof SessionStatus>;

export const PingCommand = Schema.Struct({
  type: Schema.Literal('Ping'),
});
export type PingCommand = Schema.Schema.Type<typeof PingCommand>;

export const GetSessionStatusCommand = Schema.Struct({
  type: Schema.Literal('GetSessionStatus'),
});
export type GetSessionStatusCommand = Schema.Schema.Type<typeof GetSessionStatusCommand>;

export const Command = Schema.Union(PingCommand, GetSessionStatusCommand);
export type Command = Schema.Schema.Type<typeof Command>;

export const PongMessage = Schema.Struct({
  type: Schema.Literal('Pong'),
  at: Schema.String,
});
export type PongMessage = Schema.Schema.Type<typeof PongMessage>;

export const ServerMessage = Schema.Union(SessionStatus, PongMessage);
export type ServerMessage = Schema.Schema.Type<typeof ServerMessage>;
