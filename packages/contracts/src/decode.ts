import { Schema } from 'effect';

import {
  Command,
  HealthResponse,
  ServerMessage,
  SessionStatus,
} from './messages';

export const decodeHealthResponse = Schema.decodeUnknown(HealthResponse);
export const decodeSessionStatus = Schema.decodeUnknown(SessionStatus);
export const decodeCommand = Schema.decodeUnknown(Command);
export const decodeServerMessage = Schema.decodeUnknown(ServerMessage);
