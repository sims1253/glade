import type {
  AckResult,
  JsonObject,
  JsonValue,
  RpcError,
} from '@glade/contracts';

import { isJsonValue, toJsonObject, toJsonValue } from './json';
import type { HostRpc, ReplRpc, RpcCallResult, SessionRpc, WorkflowRpc } from './rpc';
import { randomUUID } from './utils';

export interface LegacyCommandResult {
  readonly type: 'CommandResult';
  readonly id: string;
  readonly success: boolean;
  readonly payload?: unknown;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly data?: unknown;
  };
}

export type LegacyWorkflowCommand =
  | { readonly type: 'AddNode'; readonly kind: string; readonly label?: string | undefined; readonly params?: Record<string, unknown> | undefined }
  | { readonly type: 'DeleteNode'; readonly nodeId: string }
  | { readonly type: 'ConnectNodes'; readonly from: string; readonly to: string; readonly edgeType?: string | undefined; readonly metadata?: Record<string, unknown> | undefined }
  | { readonly type: 'RenameNode'; readonly nodeId: string; readonly label: string }
  | { readonly type: 'RecordDecision'; readonly scope: string; readonly prompt: string; readonly choice: string; readonly rationale: string; readonly alternatives?: ReadonlyArray<string> | undefined; readonly refs?: ReadonlyArray<unknown> | undefined; readonly evidence?: ReadonlyArray<string> | undefined; readonly kind?: string | undefined; readonly metadata?: Record<string, unknown> | undefined }
  | { readonly type: 'ExecuteAction'; readonly actionId: string; readonly payload?: Record<string, unknown> | undefined }
  | { readonly type: 'UpdateNodeNotes'; readonly nodeId: string; readonly notes: string }
  | { readonly type: 'UpdateNodeParameters'; readonly nodeId: string; readonly params: Record<string, unknown> }
  | { readonly type: 'SetNodeFile'; readonly nodeId: string; readonly path: string | null }
  | { readonly type: 'RestartSession' }
  | { readonly type: 'ReplInput'; readonly data: string }
  | { readonly type: 'ClearRepl' };

export type LegacyHostCommand =
  | { readonly type: 'OpenFileInEditor'; readonly path: string };

export type LegacyWorkflowDispatch = (command: LegacyWorkflowCommand) => Promise<LegacyCommandResult>;
export type LegacyHostDispatch = (command: LegacyHostCommand) => Promise<LegacyCommandResult>;

function toJsonValueArray(value: ReadonlyArray<unknown> | undefined): ReadonlyArray<JsonValue> | undefined {
  return value?.every(isJsonValue) ? value : undefined;
}

function assertUnreachable(value: never): never {
  throw new Error(`Unhandled command type: ${String((value as { readonly type?: string }).type ?? value)}`);
}

function toRpcError(error: LegacyCommandResult['error'] | undefined): RpcError {
  const details = toJsonValue(error?.data);

  return {
    _tag: 'RpcError',
    code: error?.code ?? 'command_failed',
    message: error?.message ?? 'The request failed.',
    ...(details === undefined ? {} : { details }),
  };
}

function fromLegacyAck(result: LegacyCommandResult): RpcCallResult<AckResult> {
  return result.success
    ? { success: true, result: { _tag: 'AckResult' } }
    : { success: false, error: toRpcError(result.error) };
}

function toLegacyResult<T>(result: RpcCallResult<T>): LegacyCommandResult {
  return result.success
    ? {
        type: 'CommandResult',
        id: randomUUID(),
        success: true,
        payload: 'result' in result ? result.result : undefined,
      }
    : {
        type: 'CommandResult',
        id: randomUUID(),
        success: false,
        error: {
          code: result.error.code,
          message: result.error.message,
          data: result.error.details,
        },
      };
}

export function workflowRpcFromLegacyDispatch(dispatch: LegacyWorkflowDispatch): WorkflowRpc {
  return {
    addNode: async (input) => fromLegacyAck(await dispatch({ type: 'AddNode', ...input })),
    deleteNode: async (input) => fromLegacyAck(await dispatch({ type: 'DeleteNode', ...input })),
    connectNodes: async (input) => fromLegacyAck(await dispatch({ type: 'ConnectNodes', ...input })),
    renameNode: async (input) => fromLegacyAck(await dispatch({ type: 'RenameNode', ...input })),
    recordDecision: async (input) => fromLegacyAck(await dispatch({ type: 'RecordDecision', ...input })),
    executeAction: async (input) => fromLegacyAck(await dispatch({ type: 'ExecuteAction', ...input })),
    updateNodeNotes: async (input) => fromLegacyAck(await dispatch({ type: 'UpdateNodeNotes', ...input })),
    updateNodeParameters: async (input) => fromLegacyAck(await dispatch({ type: 'UpdateNodeParameters', ...input })),
    setNodeFile: async (input) => fromLegacyAck(await dispatch({ type: 'SetNodeFile', ...input })),
  };
}

export function hostRpcFromLegacyDispatch(dispatch: LegacyHostDispatch): HostRpc {
  return {
    openInEditor: async (input) => fromLegacyAck(await dispatch({ type: 'OpenFileInEditor', ...input })),
  };
}

export function replRpcFromLegacyDispatch(dispatch: LegacyWorkflowDispatch): ReplRpc {
  return {
    write: async (data) => fromLegacyAck(await dispatch({ type: 'ReplInput', data })),
    clear: async () => fromLegacyAck(await dispatch({ type: 'ClearRepl' })),
  };
}

export function legacyWorkflowDispatchFromRpc(
  workflow: WorkflowRpc,
  repl: ReplRpc,
  session: SessionRpc,
): LegacyWorkflowDispatch {
  return async (command) => {
    switch (command.type) {
      case 'AddNode':
        return toLegacyResult(await workflow.addNode({
          kind: command.kind,
          ...(command.label === undefined ? {} : { label: command.label }),
          ...(command.params === undefined ? {} : { params: toJsonObject(command.params) }),
        }));
      case 'DeleteNode':
        return toLegacyResult(await workflow.deleteNode({ nodeId: command.nodeId }));
      case 'ConnectNodes':
        return toLegacyResult(await workflow.connectNodes({
          from: command.from,
          to: command.to,
          ...(command.edgeType === undefined ? {} : { edgeType: command.edgeType }),
          ...(command.metadata === undefined ? {} : { metadata: toJsonObject(command.metadata) }),
        }));
      case 'RenameNode':
        return toLegacyResult(await workflow.renameNode({ nodeId: command.nodeId, label: command.label }));
      case 'RecordDecision':
        return toLegacyResult(await workflow.recordDecision({
          scope: command.scope,
          prompt: command.prompt,
          choice: command.choice,
          rationale: command.rationale,
          ...(command.alternatives === undefined ? {} : { alternatives: command.alternatives }),
          ...(command.refs === undefined ? {} : { refs: toJsonValueArray(command.refs) }),
          ...(command.evidence === undefined ? {} : { evidence: command.evidence }),
          ...(command.kind === undefined ? {} : { kind: command.kind }),
          ...(command.metadata === undefined ? {} : { metadata: toJsonObject(command.metadata) }),
        }));
      case 'ExecuteAction':
        return toLegacyResult(await workflow.executeAction({
          actionId: command.actionId,
          ...(command.payload === undefined ? {} : { payload: toJsonObject(command.payload) }),
        }));
      case 'UpdateNodeNotes':
        return toLegacyResult(await workflow.updateNodeNotes({ nodeId: command.nodeId, notes: command.notes }));
      case 'UpdateNodeParameters':
        return toLegacyResult(await workflow.updateNodeParameters({
          nodeId: command.nodeId,
          params: (toJsonObject(command.params) ?? {}) as JsonObject,
        }));
      case 'SetNodeFile':
        return toLegacyResult(await workflow.setNodeFile({ nodeId: command.nodeId, path: command.path }));
      case 'RestartSession':
        return toLegacyResult(await session.restart());
      case 'ReplInput':
        return toLegacyResult(await repl.write(command.data));
      case 'ClearRepl':
        return toLegacyResult(await repl.clear());
      default:
        return assertUnreachable(command);
    }
  };
}

export function legacyHostDispatchFromRpc(host: HostRpc): LegacyHostDispatch {
  return async (command) => toLegacyResult(await host.openInEditor({ path: command.path }));
}

export function createWorkflowCommandEnvelope(
  command: LegacyWorkflowCommand,
  id: string = randomUUID(),
): { id: string; command: LegacyWorkflowCommand } {
  return {
    id,
    command,
  };
}
