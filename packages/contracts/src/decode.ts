import { Schema } from 'effect';

import {
  BayesgroveCommand,
  BayesgroveCommandResult,
  Command,
  CommandEnvelope,
  GraphSnapshot,
  HealthResponse,
  HostCommand,
  ProtocolEvent,
  ServerMessage,
  SessionStatus,
  WorkflowCommand,
} from './messages';

const makeDecoder = <TSchema extends Schema.Schema.AnyNoContext>(schema: TSchema) =>
  Schema.decodeUnknown(schema);

export const decodeHealthResponse = makeDecoder(HealthResponse);
export const decodeSessionStatus = makeDecoder(SessionStatus);
export const decodeGraphSnapshot = makeDecoder(GraphSnapshot);
export const decodeProtocolEvent = makeDecoder(ProtocolEvent);
export const decodeBayesgroveCommand = makeDecoder(BayesgroveCommand);
export const decodeBayesgroveCommandResult = makeDecoder(BayesgroveCommandResult);
export const decodeWorkflowCommand = makeDecoder(WorkflowCommand);
export const decodeHostCommand = makeDecoder(HostCommand);
export const decodeCommand = makeDecoder(Command);
export const decodeCommandEnvelope = makeDecoder(CommandEnvelope);
export const decodeServerMessage = makeDecoder(ServerMessage);
