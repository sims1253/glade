import { Schema } from 'effect';

import { JsonObject, JsonValue } from './json';
import {
  DesktopEnvironmentState,
  DesktopSettings,
  GraphSnapshot,
  HealthResponse,
  ProtocolEvent,
} from './messages';

export const WS_METHODS = [
  'desktop.getEnvironment',
  'desktop.refreshEnvironment',
  'desktop.saveSettings',
  'desktop.resetSettings',
  'workflow.addNode',
  'workflow.deleteNode',
  'workflow.connectNodes',
  'workflow.renameNode',
  'workflow.recordDecision',
  'workflow.executeAction',
  'workflow.updateNodeNotes',
  'workflow.updateNodeParameters',
  'workflow.setNodeFile',
  'session.restart',
  'repl.write',
  'repl.clear',
  'host.openInEditor',
] as const;
export type WsMethod = (typeof WS_METHODS)[number];

export const WS_CHANNELS = [
  'server.bootstrap',
  'desktop.environment',
  'session.status',
  'workflow.snapshot',
  'workflow.event',
  'repl.output',
  'repl.cleared',
] as const;
export type WsChannel = (typeof WS_CHANNELS)[number];

const RequestId = Schema.String;

export const SessionStatus = Schema.TaggedStruct('SessionStatus', {
  state: Schema.Literal('connecting', 'ready', 'error'),
  reason: Schema.optional(Schema.String),
});
export type SessionStatus = Schema.Schema.Type<typeof SessionStatus>;

export const AckResult = Schema.TaggedStruct('AckResult', {});
export type AckResult = Schema.Schema.Type<typeof AckResult>;

export const RpcError = Schema.TaggedStruct('RpcError', {
  code: Schema.String,
  message: Schema.String,
  details: Schema.optional(JsonValue),
});
export type RpcError = Schema.Schema.Type<typeof RpcError>;

export const ServerBootstrap = Schema.TaggedStruct('ServerBootstrap', {
  version: Schema.String,
  projectPath: Schema.NullOr(Schema.String),
  sessionStatus: SessionStatus,
  desktopEnvironment: Schema.optional(DesktopEnvironmentState),
  snapshot: Schema.optional(GraphSnapshot),
  replHistory: Schema.Array(Schema.String),
});
export type ServerBootstrap = Schema.Schema.Type<typeof ServerBootstrap>;

export const ReplOutput = Schema.TaggedStruct('ReplOutput', {
  line: Schema.String,
});
export type ReplOutput = Schema.Schema.Type<typeof ReplOutput>;

export const ReplCleared = Schema.TaggedStruct('ReplCleared', {});
export type ReplCleared = Schema.Schema.Type<typeof ReplCleared>;

export const DesktopGetEnvironmentInput = Schema.TaggedStruct('desktop.getEnvironment', {});
export type DesktopGetEnvironmentInput = Schema.Schema.Type<typeof DesktopGetEnvironmentInput>;
export const DesktopGetEnvironmentResult = DesktopEnvironmentState;

export const DesktopRefreshEnvironmentInput = Schema.TaggedStruct('desktop.refreshEnvironment', {});
export type DesktopRefreshEnvironmentInput = Schema.Schema.Type<typeof DesktopRefreshEnvironmentInput>;
export const DesktopRefreshEnvironmentResult = DesktopEnvironmentState;

export const DesktopSaveSettingsInput = Schema.TaggedStruct('desktop.saveSettings', {
  settings: DesktopSettings,
});
export type DesktopSaveSettingsInput = Schema.Schema.Type<typeof DesktopSaveSettingsInput>;
export const DesktopSaveSettingsResult = DesktopEnvironmentState;

export const DesktopResetSettingsInput = Schema.TaggedStruct('desktop.resetSettings', {});
export type DesktopResetSettingsInput = Schema.Schema.Type<typeof DesktopResetSettingsInput>;
export const DesktopResetSettingsResult = DesktopEnvironmentState;

export const WorkflowAddNodeInput = Schema.TaggedStruct('workflow.addNode', {
  kind: Schema.String,
  label: Schema.optional(Schema.String),
  params: Schema.optional(JsonObject),
  inputs: Schema.optional(Schema.Array(Schema.String)),
  metadata: Schema.optional(JsonObject),
});
export type WorkflowAddNodeInput = Schema.Schema.Type<typeof WorkflowAddNodeInput>;
export const WorkflowAddNodeResult = AckResult;

export const WorkflowDeleteNodeInput = Schema.TaggedStruct('workflow.deleteNode', {
  nodeId: Schema.String,
});
export type WorkflowDeleteNodeInput = Schema.Schema.Type<typeof WorkflowDeleteNodeInput>;
export const WorkflowDeleteNodeResult = AckResult;

export const WorkflowConnectNodesInput = Schema.TaggedStruct('workflow.connectNodes', {
  from: Schema.String,
  to: Schema.String,
  edgeType: Schema.optional(Schema.String),
  metadata: Schema.optional(JsonObject),
});
export type WorkflowConnectNodesInput = Schema.Schema.Type<typeof WorkflowConnectNodesInput>;
export const WorkflowConnectNodesResult = AckResult;

export const WorkflowRenameNodeInput = Schema.TaggedStruct('workflow.renameNode', {
  nodeId: Schema.String,
  label: Schema.String,
});
export type WorkflowRenameNodeInput = Schema.Schema.Type<typeof WorkflowRenameNodeInput>;
export const WorkflowRenameNodeResult = AckResult;

export const WorkflowRecordDecisionInput = Schema.TaggedStruct('workflow.recordDecision', {
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

export const WorkflowExecuteActionInput = Schema.TaggedStruct('workflow.executeAction', {
  actionId: Schema.String,
  payload: Schema.optional(JsonObject),
});
export type WorkflowExecuteActionInput = Schema.Schema.Type<typeof WorkflowExecuteActionInput>;
export const WorkflowExecuteActionResult = AckResult;

export const WorkflowUpdateNodeNotesInput = Schema.TaggedStruct('workflow.updateNodeNotes', {
  nodeId: Schema.String,
  notes: Schema.String,
});
export type WorkflowUpdateNodeNotesInput = Schema.Schema.Type<typeof WorkflowUpdateNodeNotesInput>;
export const WorkflowUpdateNodeNotesResult = AckResult;

export const WorkflowUpdateNodeParametersInput = Schema.TaggedStruct('workflow.updateNodeParameters', {
  nodeId: Schema.String,
  params: JsonObject,
});
export type WorkflowUpdateNodeParametersInput = Schema.Schema.Type<typeof WorkflowUpdateNodeParametersInput>;
export const WorkflowUpdateNodeParametersResult = AckResult;

export const WorkflowSetNodeFileInput = Schema.TaggedStruct('workflow.setNodeFile', {
  nodeId: Schema.String,
  path: Schema.NullOr(Schema.String),
});
export type WorkflowSetNodeFileInput = Schema.Schema.Type<typeof WorkflowSetNodeFileInput>;
export const WorkflowSetNodeFileResult = AckResult;

export const SessionRestartInput = Schema.TaggedStruct('session.restart', {});
export type SessionRestartInput = Schema.Schema.Type<typeof SessionRestartInput>;
export const SessionRestartResult = AckResult;

export const ReplWriteInput = Schema.TaggedStruct('repl.write', {
  data: Schema.String,
});
export type ReplWriteInput = Schema.Schema.Type<typeof ReplWriteInput>;
export const ReplWriteResult = AckResult;

export const ReplClearInput = Schema.TaggedStruct('repl.clear', {});
export type ReplClearInput = Schema.Schema.Type<typeof ReplClearInput>;
export const ReplClearResult = AckResult;

export const HostOpenInEditorInput = Schema.TaggedStruct('host.openInEditor', {
  path: Schema.String,
});
export type HostOpenInEditorInput = Schema.Schema.Type<typeof HostOpenInEditorInput>;
export const HostOpenInEditorResult = AckResult;

function requestSchema<TMethod extends WsMethod, TBody extends Schema.Schema.AnyNoContext>(
  method: TMethod,
  body: TBody,
) {
  return Schema.TaggedStruct('WebSocketRequest', {
    id: RequestId,
    method: Schema.Literal(method),
    body,
  });
}

function successResponseSchema<TMethod extends WsMethod, TResult extends Schema.Schema.AnyNoContext>(
  method: TMethod,
  result: TResult,
) {
  return Schema.TaggedStruct('WebSocketSuccess', {
    id: RequestId,
    method: Schema.Literal(method),
    result,
  });
}

function errorResponseSchema<TMethod extends WsMethod>(method: TMethod) {
  return Schema.TaggedStruct('WebSocketError', {
    id: RequestId,
    method: Schema.Literal(method),
    error: RpcError,
  });
}

function pushSchema<TChannel extends WsChannel, TPayload extends Schema.Schema.AnyNoContext>(
  channel: TChannel,
  payload: TPayload,
) {
  return Schema.TaggedStruct('WsPush', {
    channel: Schema.Literal(channel),
    payload,
  });
}

export const WebSocketRequest = Schema.Union(
  requestSchema('desktop.getEnvironment', DesktopGetEnvironmentInput),
  requestSchema('desktop.refreshEnvironment', DesktopRefreshEnvironmentInput),
  requestSchema('desktop.saveSettings', DesktopSaveSettingsInput),
  requestSchema('desktop.resetSettings', DesktopResetSettingsInput),
  requestSchema('workflow.addNode', WorkflowAddNodeInput),
  requestSchema('workflow.deleteNode', WorkflowDeleteNodeInput),
  requestSchema('workflow.connectNodes', WorkflowConnectNodesInput),
  requestSchema('workflow.renameNode', WorkflowRenameNodeInput),
  requestSchema('workflow.recordDecision', WorkflowRecordDecisionInput),
  requestSchema('workflow.executeAction', WorkflowExecuteActionInput),
  requestSchema('workflow.updateNodeNotes', WorkflowUpdateNodeNotesInput),
  requestSchema('workflow.updateNodeParameters', WorkflowUpdateNodeParametersInput),
  requestSchema('workflow.setNodeFile', WorkflowSetNodeFileInput),
  requestSchema('session.restart', SessionRestartInput),
  requestSchema('repl.write', ReplWriteInput),
  requestSchema('repl.clear', ReplClearInput),
  requestSchema('host.openInEditor', HostOpenInEditorInput),
);
export type WebSocketRequest = Schema.Schema.Type<typeof WebSocketRequest>;

export const WebSocketResponse = Schema.Union(
  successResponseSchema('desktop.getEnvironment', DesktopGetEnvironmentResult),
  successResponseSchema('desktop.refreshEnvironment', DesktopRefreshEnvironmentResult),
  successResponseSchema('desktop.saveSettings', DesktopSaveSettingsResult),
  successResponseSchema('desktop.resetSettings', DesktopResetSettingsResult),
  successResponseSchema('workflow.addNode', WorkflowAddNodeResult),
  successResponseSchema('workflow.deleteNode', WorkflowDeleteNodeResult),
  successResponseSchema('workflow.connectNodes', WorkflowConnectNodesResult),
  successResponseSchema('workflow.renameNode', WorkflowRenameNodeResult),
  successResponseSchema('workflow.recordDecision', WorkflowRecordDecisionResult),
  successResponseSchema('workflow.executeAction', WorkflowExecuteActionResult),
  successResponseSchema('workflow.updateNodeNotes', WorkflowUpdateNodeNotesResult),
  successResponseSchema('workflow.updateNodeParameters', WorkflowUpdateNodeParametersResult),
  successResponseSchema('workflow.setNodeFile', WorkflowSetNodeFileResult),
  successResponseSchema('session.restart', SessionRestartResult),
  successResponseSchema('repl.write', ReplWriteResult),
  successResponseSchema('repl.clear', ReplClearResult),
  successResponseSchema('host.openInEditor', HostOpenInEditorResult),
  errorResponseSchema('desktop.getEnvironment'),
  errorResponseSchema('desktop.refreshEnvironment'),
  errorResponseSchema('desktop.saveSettings'),
  errorResponseSchema('desktop.resetSettings'),
  errorResponseSchema('workflow.addNode'),
  errorResponseSchema('workflow.deleteNode'),
  errorResponseSchema('workflow.connectNodes'),
  errorResponseSchema('workflow.renameNode'),
  errorResponseSchema('workflow.recordDecision'),
  errorResponseSchema('workflow.executeAction'),
  errorResponseSchema('workflow.updateNodeNotes'),
  errorResponseSchema('workflow.updateNodeParameters'),
  errorResponseSchema('workflow.setNodeFile'),
  errorResponseSchema('session.restart'),
  errorResponseSchema('repl.write'),
  errorResponseSchema('repl.clear'),
  errorResponseSchema('host.openInEditor'),
);
export type WebSocketResponse = Schema.Schema.Type<typeof WebSocketResponse>;

export const WsPush = Schema.Union(
  pushSchema('server.bootstrap', ServerBootstrap),
  pushSchema('desktop.environment', DesktopEnvironmentState),
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
