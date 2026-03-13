import type {
  AckResult,
  DesktopBootstrapProjectInput,
  DesktopEnvironmentState,
  DesktopGetEnvironmentInput,
  DesktopRefreshEnvironmentInput,
  DesktopResetSettingsInput,
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
  WorkflowUpdateNodeNotesInput,
  WorkflowUpdateNodeParametersInput,
} from '@glade/contracts';

import { randomUUID } from './utils';

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
  readonly updateNodeNotes: (input: WithoutTag<WorkflowUpdateNodeNotesInput>) => Promise<RpcCallResult<AckResult>>;
  readonly updateNodeParameters: (input: WithoutTag<WorkflowUpdateNodeParametersInput>) => Promise<RpcCallResult<AckResult>>;
  readonly setNodeFile: (input: WithoutTag<WorkflowSetNodeFileInput>) => Promise<RpcCallResult<AckResult>>;
}

export interface DesktopRpc {
  readonly getEnvironment: (input?: WithoutTag<DesktopGetEnvironmentInput>) => Promise<RpcCallResult<DesktopEnvironmentState>>;
  readonly refreshEnvironment: (input?: WithoutTag<DesktopRefreshEnvironmentInput>) => Promise<RpcCallResult<DesktopEnvironmentState>>;
  readonly saveSettings: (input: WithoutTag<DesktopSaveSettingsInput>) => Promise<RpcCallResult<DesktopEnvironmentState>>;
  readonly resetSettings: (input?: WithoutTag<DesktopResetSettingsInput>) => Promise<RpcCallResult<DesktopEnvironmentState>>;
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

function assertUnreachable(value: never): never {
  throw new Error(`Unhandled RPC method: ${String(value)}`);
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

export function describeRpcCall(method: WebSocketRequest['method'], body: WebSocketRequest['body']) {
  switch (method) {
    case 'desktop.getEnvironment':
      return 'Loaded desktop environment';
    case 'desktop.refreshEnvironment':
      return 'Refreshed desktop environment';
    case 'desktop.saveSettings':
      return 'Saved desktop settings';
    case 'desktop.resetSettings':
      return 'Reset desktop settings';
    case 'desktop.bootstrapProject':
      return 'Bootstrapped project';
    case 'workflow.addNode': {
      const request = body as WorkflowAddNodeInput;
      return `Added ${request.label?.trim() || request.kind}`;
    }
    case 'workflow.deleteNode':
      return 'Deleted node';
    case 'workflow.connectNodes':
      return 'Connected nodes';
    case 'workflow.renameNode':
      return `Renamed node to ${(body as WorkflowRenameNodeInput).label}`;
    case 'workflow.recordDecision':
      return 'Recorded workflow decision';
    case 'workflow.executeAction':
      return 'Executed workflow action';
    case 'workflow.updateNodeNotes':
      return 'Saved node notes';
    case 'workflow.updateNodeParameters':
      return 'Saved node parameters';
    case 'workflow.setNodeFile':
      return (body as WorkflowSetNodeFileInput).path ? 'Linked node file' : 'Removed node file link';
    case 'session.restart':
      return 'Restarted session';
    case 'repl.write':
      return 'Sent REPL input';
    case 'repl.clear':
      return 'Cleared REPL terminal';
    case 'host.openInEditor':
      return 'Opened linked file in editor';
    default:
      return assertUnreachable(method);
  }
}

export function shouldSuppressSuccessToast(method: WebSocketRequest['method']) {
  return method === 'repl.write' || method === 'repl.clear';
}

export function failureTitle(method: WebSocketRequest['method']) {
  switch (method) {
    case 'desktop.getEnvironment':
      return 'Could not load desktop environment';
    case 'desktop.refreshEnvironment':
      return 'Could not refresh desktop environment';
    case 'desktop.saveSettings':
      return 'Could not save desktop settings';
    case 'desktop.resetSettings':
      return 'Could not reset desktop settings';
    case 'desktop.bootstrapProject':
      return 'Could not bootstrap project';
    case 'workflow.addNode':
      return 'Could not add node';
    case 'workflow.deleteNode':
      return 'Could not delete node';
    case 'workflow.connectNodes':
      return 'Could not connect nodes';
    case 'workflow.renameNode':
      return 'Could not rename node';
    case 'workflow.recordDecision':
      return 'Could not record workflow decision';
    case 'workflow.executeAction':
      return 'Could not execute workflow action';
    case 'workflow.updateNodeNotes':
      return 'Could not save node notes';
    case 'workflow.updateNodeParameters':
      return 'Could not save node parameters';
    case 'workflow.setNodeFile':
      return 'Could not update linked file';
    case 'session.restart':
      return 'Could not restart session';
    case 'repl.write':
      return 'Could not send REPL input';
    case 'repl.clear':
      return 'Could not clear REPL terminal';
    case 'host.openInEditor':
      return 'Could not open file in editor';
    default:
      return assertUnreachable(method);
  }
}

export type RpcMethod = WebSocketRequest['method'];
export type RpcRequestBody<TMethod extends RpcMethod> = Extract<WebSocketRequest, { method: TMethod }>['body'];
export type RpcSuccessResponse<TMethod extends RpcMethod> = Extract<
  Extract<WebSocketResponse, { method: TMethod }>,
  { _tag: 'WebSocketSuccess' }
>;
export type RpcResultValue<TMethod extends RpcMethod> = RpcSuccessResponse<TMethod>['result'];
