import * as Data from 'effect/Data';

export class CommandDispatchError extends Data.TaggedError('CommandDispatchError')<{
  readonly message: string;
  readonly code: string;
  readonly cause?: unknown;
}> {}

export class HostedCapabilityError extends Data.TaggedError('HostedCapabilityError')<{
  readonly message: string;
  readonly code: string;
}> {}

export class ProtocolDecodeError extends Data.TaggedError('ProtocolDecodeError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class RSessionUnavailableError extends Data.TaggedError('RSessionUnavailableError')<{
  readonly message: string;
}> {}

export class SessionStartupError extends Data.TaggedError('SessionStartupError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
