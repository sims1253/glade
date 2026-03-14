import type {
  AckResult,
  DesktopBootstrapProjectInput,
  DesktopEnvironmentState,
  DesktopSaveSettingsInput,
  HostOpenInEditorInput,
  RpcError,
  SessionRestartInput,
  WebSocketRequest,
  WebSocketResponse,
  WorkflowAddNodeInput,
  WorkflowConnectNodesInput,
  WorkflowDeleteNodeInput,
  WorkflowExecuteActionInput,
  WorkflowRecordDecisionInput,
  WorkflowRenameNodeInput,
  WorkflowSetNodeFileInput,
  WorkflowUseDefaultWorkflowInput,
  WorkflowUseWorkflowPacksInput,
  WorkflowUpdateNodeNotesInput,
  WorkflowUpdateNodeParametersInput,
} from '@glade/contracts';

import { assertUnreachable, randomUUID } from './utils';

type WithoutTag<T extends { readonly _tag: string }> = Omit<T, '_tag'>;

export type RpcCallResult<TResult> =
  | { readonly success: true; readonly result: TResult }
  | { readonly success: false; readonly error: RpcError };

export interface WorkflowRpc {
  readonly addNode: (input: WithoutTag<WorkflowAddNodeInput>) => Promise<RpcCallResult<AckResult>>;
  readonly deleteNode: (input: WithoutTag<WorkflowDeleteNodeInput>) => Promise<RpcCallResult<AckResult>>;
  readonly connectNodes: (input: WithoutTag<WorkflowConnectNodesInput>) => Promise<RpcCallResult<AckResult>>;
  readonly renameNode: (input: WithoutTag<WorkflowRenameNodeInput>) => Promise<RpcCallResult<AckResult>>;
  readonly recordDecision: (input: WithoutTag<WorkflowRecordDecisionInput>) => Promise<RpcCallResult<AckResult>>;
  readonly executeAction: (input: WithoutTag<WorkflowExecuteActionInput>) => Promise<RpcCallResult<AckResult>>;
  readonly useDefaultWorkflow: (input?: WithoutTag<WorkflowUseDefaultWorkflowInput>) => Promise<RpcCallResult<AckResult>>;
  readonly useWorkflowPacks: (input: WithoutTag<WorkflowUseWorkflowPacksInput>) => Promise<RpcCallResult<AckResult>>;
  readonly updateNodeNotes: (input: WithoutTag<WorkflowUpdateNodeNotesInput>) => Promise<RpcCallResult<AckResult>>;
  readonly updateNodeParameters: (input: WithoutTag<WorkflowUpdateNodeParametersInput>) => Promise<RpcCallResult<AckResult>>;
  readonly setNodeFile: (input: WithoutTag<WorkflowSetNodeFileInput>) => Promise<RpcCallResult<AckResult>>;
}

export interface DesktopRpc {
  readonly getEnvironment: () => Promise<RpcCallResult<DesktopEnvironmentState>>;
  readonly refreshEnvironment: () => Promise<RpcCallResult<DesktopEnvironmentState>>;
  readonly saveSettings: (input: WithoutTag<DesktopSaveSettingsInput>) => Promise<RpcCallResult<DesktopEnvironmentState>>;
  readonly resetSettings: () => Promise<RpcCallResult<DesktopEnvironmentState>>;
  readonly bootstrapProject: (input: WithoutTag<DesktopBootstrapProjectInput>) => Promise<RpcCallResult<DesktopEnvironmentState>>;
}

export interface SessionRpc {
  readonly restart: (input?: WithoutTag<SessionRestartInput>) => Promise<RpcCallResult<AckResult>>;
}

export interface ReplRpc {
  readonly write: (data: string) => Promise<RpcCallResult<AckResult>>;
  readonly clear: () => Promise<RpcCallResult<AckResult>>;
}

export interface HostRpc {
  readonly openInEditor: (input: WithoutTag<HostOpenInEditorInput>) => Promise<RpcCallResult<AckResult>>;
}

export interface RpcClient {
  readonly desktop: DesktopRpc;
  readonly workflow: WorkflowRpc;
  readonly session: SessionRpc;
  readonly repl: ReplRpc;
  readonly host: HostRpc;
  readonly reconnect: () => void;
}

export function makeRequest<TMethod extends RpcMethod>(
  method: TMethod,
  body: RpcRequestBody<TMethod>,
  id = randomUUID(),
): WebSocketRequest {
  return {
    _tag: 'WebSocketRequest',
    id,
    method,
    body,
  } as WebSocketRequest;
}

export { describeRpcCall, shouldSuppressSuccessToast, failureTitle } from './rpc-ui';
export type RpcMethod = WebSocketRequest['method'];
export type RpcRequestBody<TMethod extends RpcMethod> = Extract<WebSocketRequest, { method: TMethod }>['body'];
export type RpcSuccessResponse<TMethod extends RpcMethod> = Extract<
  Extract<WebSocketResponse, { method: TMethod }>,
  { _tag: 'WebSocketSuccess' }
>;
export type RpcResultValue<TMethod extends RpcMethod> = RpcSuccessResponse<TMethod>['result'];
