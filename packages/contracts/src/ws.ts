import { Schema } from 'effect';

import { JsonObject, JsonValue } from './json';
import { GraphSnapshot, HealthResponse, ProtocolEvent } from './messages';

export const WS_METHODS = [
  'workflow.addNode',
  'workflow.deleteNode',
  'workflow.connectNodes',
  'workflow.renameNode',
  'workflow.recordDecision',
  'workflow.executeAction',
  'workflow.executeNode',
  'workflow.updateNodeNotes',
  'workflow.updateNodeParameters',
  'workflow.setNodeFile',
  'session.restart',
  'repl.write',
  'repl.clear',
  'host.openInEditor',
  'system.getInfo',
] as const;
export type WsMethod = (typeof WS_METHODS)[number];

export const WS_CHANNELS = [
  'server.bootstrap',
  'session.status',
  'workflow.snapshot',
  'workflow.event',
  'repl.output',
  'repl.cleared',
] as const;
export type WsChannel = (typeof WS_CHANNELS)[number];

const RequestId = Schema.String;

export const SessionStatus = Schema.Struct({
  _tag: Schema.Literal('SessionStatus'),
  state: Schema.Literal('connecting', 'ready', 'error'),
  reason: Schema.optional(Schema.String),
});
export type SessionStatus = Schema.Schema.Type<typeof SessionStatus>;

export const AckResult = Schema.Struct({
  _tag: Schema.Literal('AckResult'),
});
export type AckResult = Schema.Schema.Type<typeof AckResult>;

export const RpcError = Schema.Struct({
  _tag: Schema.Literal('RpcError'),
  code: Schema.String,
  message: Schema.String,
  details: Schema.optional(JsonValue),
});
export type RpcError = Schema.Schema.Type<typeof RpcError>;

export const SystemInfoResult = Schema.Struct({
  _tag: Schema.Literal('SystemInfo'),
  platform: Schema.String,
  arch: Schema.String,
  hostedMode: Schema.Boolean,
  runtime: Schema.String,
  projectPath: Schema.NullOr(Schema.String),
});
export type SystemInfoResult = Schema.Schema.Type<typeof SystemInfoResult>;

export const ServerBootstrap = Schema.Struct({
  _tag: Schema.Literal('ServerBootstrap'),
  version: Schema.String,
  runtime: Schema.String,
  hostedMode: Schema.Boolean,
  projectPath: Schema.NullOr(Schema.String),
  sessionStatus: SessionStatus,
  snapshot: Schema.optional(GraphSnapshot),
  replHistory: Schema.Array(Schema.String),
});
export type ServerBootstrap = Schema.Schema.Type<typeof ServerBootstrap>;

export const ReplOutput = Schema.Struct({
  _tag: Schema.Literal('ReplOutput'),
  line: Schema.String,
});
export type ReplOutput = Schema.Schema.Type<typeof ReplOutput>;

export const ReplCleared = Schema.Struct({
  _tag: Schema.Literal('ReplCleared'),
});
export type ReplCleared = Schema.Schema.Type<typeof ReplCleared>;

export const WorkflowAddNodeInput = Schema.Struct({
  _tag: Schema.Literal('workflow.addNode'),
  kind: Schema.String,
  label: Schema.optional(Schema.String),
  params: Schema.optional(JsonObject),
  inputs: Schema.optional(Schema.Array(Schema.String)),
  metadata: Schema.optional(JsonObject),
});
export type WorkflowAddNodeInput = Schema.Schema.Type<typeof WorkflowAddNodeInput>;
export const WorkflowAddNodeResult = AckResult;

export const WorkflowDeleteNodeInput = Schema.Struct({
  _tag: Schema.Literal('workflow.deleteNode'),
  nodeId: Schema.String,
});
export type WorkflowDeleteNodeInput = Schema.Schema.Type<typeof WorkflowDeleteNodeInput>;
export const WorkflowDeleteNodeResult = AckResult;

export const WorkflowConnectNodesInput = Schema.Struct({
  _tag: Schema.Literal('workflow.connectNodes'),
  from: Schema.String,
  to: Schema.String,
  edgeType: Schema.optional(Schema.String),
  metadata: Schema.optional(JsonObject),
});
export type WorkflowConnectNodesInput = Schema.Schema.Type<typeof WorkflowConnectNodesInput>;
export const WorkflowConnectNodesResult = AckResult;

export const WorkflowRenameNodeInput = Schema.Struct({
  _tag: Schema.Literal('workflow.renameNode'),
  nodeId: Schema.String,
  label: Schema.String,
});
export type WorkflowRenameNodeInput = Schema.Schema.Type<typeof WorkflowRenameNodeInput>;
export const WorkflowRenameNodeResult = AckResult;

export const WorkflowRecordDecisionInput = Schema.Struct({
  _tag: Schema.Literal('workflow.recordDecision'),
  scope: Schema.String,
  prompt: Schema.String,
  choice: Schema.String,
  alternatives: Schema.optional(Schema.Array(Schema.String)),
  rationale: Schema.String,
  refs: Schema.optional(Schema.Array(JsonValue)),
  evidence: Schema.optional(Schema.Array(Schema.String)),
  kind: Schema.optional(Schema.String),
  metadata: Schema.optional(JsonObject),
});
export type WorkflowRecordDecisionInput = Schema.Schema.Type<typeof WorkflowRecordDecisionInput>;
export const WorkflowRecordDecisionResult = AckResult;

export const WorkflowExecuteActionInput = Schema.Struct({
  _tag: Schema.Literal('workflow.executeAction'),
  actionId: Schema.String,
  payload: Schema.optional(JsonObject),
});
export type WorkflowExecuteActionInput = Schema.Schema.Type<typeof WorkflowExecuteActionInput>;
export const WorkflowExecuteActionResult = AckResult;

export const WorkflowExecuteNodeInput = Schema.Struct({
  _tag: Schema.Literal('workflow.executeNode'),
  nodeId: Schema.String,
  confirmNonLocalExecution: Schema.optional(Schema.Boolean),
});
export type WorkflowExecuteNodeInput = Schema.Schema.Type<typeof WorkflowExecuteNodeInput>;
export const WorkflowExecuteNodeResult = AckResult;

export const WorkflowUpdateNodeNotesInput = Schema.Struct({
  _tag: Schema.Literal('workflow.updateNodeNotes'),
  nodeId: Schema.String,
  notes: Schema.String,
});
export type WorkflowUpdateNodeNotesInput = Schema.Schema.Type<typeof WorkflowUpdateNodeNotesInput>;
export const WorkflowUpdateNodeNotesResult = AckResult;

export const WorkflowUpdateNodeParametersInput = Schema.Struct({
  _tag: Schema.Literal('workflow.updateNodeParameters'),
  nodeId: Schema.String,
  params: JsonObject,
});
export type WorkflowUpdateNodeParametersInput = Schema.Schema.Type<typeof WorkflowUpdateNodeParametersInput>;
export const WorkflowUpdateNodeParametersResult = AckResult;

export const WorkflowSetNodeFileInput = Schema.Struct({
  _tag: Schema.Literal('workflow.setNodeFile'),
  nodeId: Schema.String,
  path: Schema.NullOr(Schema.String),
});
export type WorkflowSetNodeFileInput = Schema.Schema.Type<typeof WorkflowSetNodeFileInput>;
export const WorkflowSetNodeFileResult = AckResult;

export const SessionRestartInput = Schema.Struct({
  _tag: Schema.Literal('session.restart'),
});
export type SessionRestartInput = Schema.Schema.Type<typeof SessionRestartInput>;
export const SessionRestartResult = AckResult;

export const ReplWriteInput = Schema.Struct({
  _tag: Schema.Literal('repl.write'),
  data: Schema.String,
});
export type ReplWriteInput = Schema.Schema.Type<typeof ReplWriteInput>;
export const ReplWriteResult = AckResult;

export const ReplClearInput = Schema.Struct({
  _tag: Schema.Literal('repl.clear'),
});
export type ReplClearInput = Schema.Schema.Type<typeof ReplClearInput>;
export const ReplClearResult = AckResult;

export const HostOpenInEditorInput = Schema.Struct({
  _tag: Schema.Literal('host.openInEditor'),
  path: Schema.String,
});
export type HostOpenInEditorInput = Schema.Schema.Type<typeof HostOpenInEditorInput>;
export const HostOpenInEditorResult = AckResult;

export const SystemGetInfoInput = Schema.Struct({
  _tag: Schema.Literal('system.getInfo'),
});
export type SystemGetInfoInput = Schema.Schema.Type<typeof SystemGetInfoInput>;

function requestSchema<TMethod extends WsMethod, TBody extends Schema.Schema.AnyNoContext>(
  method: TMethod,
  body: TBody,
) {
  return Schema.Struct({
    _tag: Schema.Literal('WebSocketRequest'),
    id: RequestId,
    method: Schema.Literal(method),
    body,
  });
}

function successResponseSchema<TMethod extends WsMethod, TResult extends Schema.Schema.AnyNoContext>(
  method: TMethod,
  result: TResult,
) {
  return Schema.Struct({
    _tag: Schema.Literal('WebSocketSuccess'),
    id: RequestId,
    method: Schema.Literal(method),
    result,
  });
}

function errorResponseSchema<TMethod extends WsMethod>(method: TMethod) {
  return Schema.Struct({
    _tag: Schema.Literal('WebSocketError'),
    id: RequestId,
    method: Schema.Literal(method),
    error: RpcError,
  });
}

function pushSchema<TChannel extends WsChannel, TPayload extends Schema.Schema.AnyNoContext>(
  channel: TChannel,
  payload: TPayload,
) {
  return Schema.Struct({
    _tag: Schema.Literal('WsPush'),
    channel: Schema.Literal(channel),
    payload,
  });
}

export const WebSocketRequest = Schema.Union(
  requestSchema('workflow.addNode', WorkflowAddNodeInput),
  requestSchema('workflow.deleteNode', WorkflowDeleteNodeInput),
  requestSchema('workflow.connectNodes', WorkflowConnectNodesInput),
  requestSchema('workflow.renameNode', WorkflowRenameNodeInput),
  requestSchema('workflow.recordDecision', WorkflowRecordDecisionInput),
  requestSchema('workflow.executeAction', WorkflowExecuteActionInput),
  requestSchema('workflow.executeNode', WorkflowExecuteNodeInput),
  requestSchema('workflow.updateNodeNotes', WorkflowUpdateNodeNotesInput),
  requestSchema('workflow.updateNodeParameters', WorkflowUpdateNodeParametersInput),
  requestSchema('workflow.setNodeFile', WorkflowSetNodeFileInput),
  requestSchema('session.restart', SessionRestartInput),
  requestSchema('repl.write', ReplWriteInput),
  requestSchema('repl.clear', ReplClearInput),
  requestSchema('host.openInEditor', HostOpenInEditorInput),
  requestSchema('system.getInfo', SystemGetInfoInput),
);
export type WebSocketRequest = Schema.Schema.Type<typeof WebSocketRequest>;

export const WebSocketResponse = Schema.Union(
  successResponseSchema('workflow.addNode', WorkflowAddNodeResult),
  successResponseSchema('workflow.deleteNode', WorkflowDeleteNodeResult),
  successResponseSchema('workflow.connectNodes', WorkflowConnectNodesResult),
  successResponseSchema('workflow.renameNode', WorkflowRenameNodeResult),
  successResponseSchema('workflow.recordDecision', WorkflowRecordDecisionResult),
  successResponseSchema('workflow.executeAction', WorkflowExecuteActionResult),
  successResponseSchema('workflow.executeNode', WorkflowExecuteNodeResult),
  successResponseSchema('workflow.updateNodeNotes', WorkflowUpdateNodeNotesResult),
  successResponseSchema('workflow.updateNodeParameters', WorkflowUpdateNodeParametersResult),
  successResponseSchema('workflow.setNodeFile', WorkflowSetNodeFileResult),
  successResponseSchema('session.restart', SessionRestartResult),
  successResponseSchema('repl.write', ReplWriteResult),
  successResponseSchema('repl.clear', ReplClearResult),
  successResponseSchema('host.openInEditor', HostOpenInEditorResult),
  successResponseSchema('system.getInfo', SystemInfoResult),
  errorResponseSchema('workflow.addNode'),
  errorResponseSchema('workflow.deleteNode'),
  errorResponseSchema('workflow.connectNodes'),
  errorResponseSchema('workflow.renameNode'),
  errorResponseSchema('workflow.recordDecision'),
  errorResponseSchema('workflow.executeAction'),
  errorResponseSchema('workflow.executeNode'),
  errorResponseSchema('workflow.updateNodeNotes'),
  errorResponseSchema('workflow.updateNodeParameters'),
  errorResponseSchema('workflow.setNodeFile'),
  errorResponseSchema('session.restart'),
  errorResponseSchema('repl.write'),
  errorResponseSchema('repl.clear'),
  errorResponseSchema('host.openInEditor'),
  errorResponseSchema('system.getInfo'),
);
export type WebSocketResponse = Schema.Schema.Type<typeof WebSocketResponse>;

export const WsPush = Schema.Union(
  pushSchema('server.bootstrap', ServerBootstrap),
  pushSchema('session.status', SessionStatus),
  pushSchema('workflow.snapshot', GraphSnapshot),
  pushSchema('workflow.event', ProtocolEvent),
  pushSchema('repl.output', ReplOutput),
  pushSchema('repl.cleared', ReplCleared),
);
export type WsPush = Schema.Schema.Type<typeof WsPush>;

export const WsMessage = Schema.Union(WebSocketRequest, WebSocketResponse, WsPush);
export type WsMessage = Schema.Schema.Type<typeof WsMessage>;

export { HealthResponse };
