import * as crypto from 'node:crypto';

import type { WebSocket } from 'ws';
import open from 'open';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Ref from 'effect/Ref';
import * as Runtime from 'effect/Runtime';
import { Either, Schema } from 'effect';
import * as Stream from 'effect/Stream';

import {
  normalizeGraphSnapshotExtensions,
  type AckResult,
  type BayesgroveCommand,
  type BayesgroveCommandResult,
  type DesktopEnvironmentState,
  type GraphSnapshot,
  type JsonObject,
  type JsonValue,
  type ProtocolEvent,
  type RpcError,
  type ServerBootstrap,
  type SessionStatus,
  type WebSocketRequest as WebSocketRequestMessage,
  type WebSocketResponse,
  WebSocketRequest as WebSocketRequestSchema,
  type WsPush,
  WS_METHODS,
} from '@glade/contracts';
import { decodeJsonResult, decodeUnknownResult, formatSchemaError } from '@glade/shared';

import { ServerConfig } from '../config';
import {
  CommandDispatchError,
  RSessionUnavailableError,
} from '../errors';
import { BayesgroveSocket } from './bayesgrove-socket';
import { toExecuteActionCommand } from './execute-action';
import { GraphStateCache } from './graph-state-cache';
import { RProcessService } from './r-process';
import { SessionStatusStore } from './session-status';
import { DesktopEnvironmentService } from './desktop-environment';
import { WebSocketHub } from './websocket-hub';

export class ServerEdge extends Context.Tag('glade/ServerEdge')<
  ServerEdge,
  {
    readonly startSession: Effect.Effect<void, never>;
    readonly attachClient: (socket: WebSocket) => Effect.Effect<void>;
  }
>() {}

const INTERNAL_SNAPSHOT_PREFIX = 'internal.snapshot.';
const decodeJsonPayload = decodeJsonResult(Schema.Unknown);
const decodeWsRequestPayload = decodeUnknownResult(WebSocketRequestSchema);
const WS_METHOD_SET = new Set<string>(WS_METHODS);

type PendingRequest = {
  readonly socket: WebSocket;
  readonly method: WebSocketRequestMessage['method'];
};

function ackResult(): AckResult {
  return { _tag: 'AckResult' };
}

function rpcError(code: string, message: string, details?: unknown): RpcError {
  return {
    _tag: 'RpcError',
    code,
    message,
    ...(details === undefined ? {} : { details: details as JsonValue }),
  };
}

function successResponse(
  id: string,
  method: WebSocketRequestMessage['method'],
  result: AckResult | DesktopEnvironmentState,
): WebSocketResponse {
  return {
    _tag: 'WebSocketSuccess',
    id,
    method,
    result,
  } as WebSocketResponse;
}

function errorResponse(
  id: string,
  method: WebSocketRequestMessage['method'],
  error: RpcError,
): WebSocketResponse {
  return {
    _tag: 'WebSocketError',
    id,
    method,
    error,
  } as WebSocketResponse;
}

function sessionStatus(state: SessionStatus['state'], reason?: string): SessionStatus {
  return reason ? { _tag: 'SessionStatus', state, reason } : { _tag: 'SessionStatus', state };
}

function asObject(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function wrapSnapshotResult(result: unknown, protocolVersion: string): GraphSnapshot | null {
  const state = asObject(result);
  if (!state) {
    return null;
  }

  try {
    return normalizeGraphSnapshotExtensions({
    protocol_version: protocolVersion,
    message_type: 'GraphSnapshot',
    emitted_at: new Date().toISOString(),
    project_id: typeof state.project_id === 'string' ? state.project_id : 'unknown',
    project_name: typeof state.project_name === 'string' && state.project_name !== 'unknown' ? state.project_name : 'Glade project',
    graph: asObject(state.graph) ?? {},
    status: (state.status ?? {
      workflow_state: 'open',
      runnable_nodes: 0,
      blocked_nodes: 0,
      pending_gates: 0,
      active_jobs: 0,
      health: 'ok',
      messages: [],
    }) as GraphSnapshot['status'],
    pending_gates: (state.pending_gates ?? {}) as GraphSnapshot['pending_gates'],
    branches: (state.branches ?? {}) as GraphSnapshot['branches'],
    branch_goals: (state.branch_goals ?? {}) as GraphSnapshot['branch_goals'],
    protocol: (state.protocol ?? {
      summary: {
        n_scopes: 0,
        n_obligations: 0,
        n_actions: 0,
        n_blocking: 0,
        scopes: [],
      },
    }) as GraphSnapshot['protocol'],
    ...(state.command_surface === undefined ? {} : { command_surface: state.command_surface as GraphSnapshot['command_surface'] }),
    ...(state.extension_registry === undefined ? {} : { extension_registry: state.extension_registry as GraphSnapshot['extension_registry'] }),
  });
  } catch {
    return null;
  }
}

function toBayesgroveCommand(
  id: string,
  request: Extract<WebSocketRequestMessage, { method: `workflow.${string}` }>,
): BayesgroveCommand {
  switch (request.method) {
    case 'workflow.addNode':
      return {
        protocol_version: '0.1.0',
        message_type: 'Command',
        command_id: id,
        command: 'bg_add_node',
        args: {
          kind: request.body.kind,
          label: request.body.label,
          params: request.body.params,
          inputs: request.body.inputs,
          metadata: request.body.metadata,
        },
      };
    case 'workflow.deleteNode':
      return {
        protocol_version: '0.1.0',
        message_type: 'Command',
        command_id: id,
        command: 'bg_remove_node',
        args: { node_id: request.body.nodeId },
      };
    case 'workflow.connectNodes':
      return {
        protocol_version: '0.1.0',
        message_type: 'Command',
        command_id: id,
        command: 'bg_connect',
        args: {
          from: request.body.from,
          to: request.body.to,
          edge_type: request.body.edgeType,
          metadata: request.body.metadata,
        },
      };
    case 'workflow.renameNode':
      return {
        protocol_version: '0.1.0',
        message_type: 'Command',
        command_id: id,
        command: 'bg_update_node',
        args: { node_id: request.body.nodeId, label: request.body.label },
      };
    case 'workflow.recordDecision':
      return {
        protocol_version: '0.1.0',
        message_type: 'Command',
        command_id: id,
        command: 'bg_record_decision',
        args: {
          scope: request.body.scope,
          prompt: request.body.prompt,
          choice: request.body.choice,
          alternatives: request.body.alternatives,
          rationale: request.body.rationale,
          refs: request.body.refs,
          evidence: request.body.evidence,
          kind: request.body.kind,
          metadata: request.body.metadata,
        },
      };
    case 'workflow.useDefaultWorkflow':
      return {
        protocol_version: '0.1.0',
        message_type: 'Command',
        command_id: id,
        command: 'bg_use_default_workflow',
        args: {},
      };
    case 'workflow.useWorkflowPacks':
      return {
        protocol_version: '0.1.0',
        message_type: 'Command',
        command_id: id,
        command: 'bg_use_workflow_packs',
        args: {
          workflow_packs: request.body.workflowPacks,
        },
      };
    case 'workflow.updateNodeNotes':
      return {
        protocol_version: '0.1.0',
        message_type: 'Command',
        command_id: id,
        command: 'bg_update_node',
        args: {
          node_id: request.body.nodeId,
          metadata: {
            notes: request.body.notes,
          } satisfies JsonObject,
        },
      };
    case 'workflow.updateNodeParameters':
      return {
        protocol_version: '0.1.0',
        message_type: 'Command',
        command_id: id,
        command: 'bg_update_node',
        args: {
          node_id: request.body.nodeId,
          params: request.body.params,
        },
      };
    case 'workflow.setNodeFile':
      return {
        protocol_version: '0.1.0',
        message_type: 'Command',
        command_id: id,
        command: 'bg_update_node',
        args: {
          node_id: request.body.nodeId,
          metadata: {
            linked_file: request.body.path,
            file_path: request.body.path,
          } satisfies JsonObject,
        },
      };
    default:
      throw new CommandDispatchError({
        code: 'unsupported_workflow_command',
        message: `Workflow method ${request.method} is not supported by the current bayesgrove protocol.`,
      });
  }
}

function wrapCommandMappingError(cause: unknown) {
  return cause instanceof CommandDispatchError
    ? cause
    : new CommandDispatchError({
        code: 'workflow_mapping_failed',
        message: 'Failed to map workflow request.',
        cause,
      });
}

function commandErrorPayload(error: unknown): RpcError {
  if (error instanceof CommandDispatchError) {
    return rpcError(error.code, error.message);
  }

  if (error instanceof RSessionUnavailableError) {
    return rpcError('r_session_unavailable', error.message);
  }

  return rpcError('command_failed', error instanceof Error ? error.message : String(error));
}

function invalidRequestMetadata(value: unknown): { id: string; method: WebSocketRequestMessage['method'] } | null {
  const object = asObject(value);
  if (!object || typeof object.id !== 'string' || typeof object.method !== 'string') {
    return null;
  }

  if (!WS_METHOD_SET.has(object.method)) {
    return null;
  }

  return {
    id: object.id,
    method: object.method as WebSocketRequestMessage['method'],
  };
}

function removePendingForSocket(
  pending: ReadonlyMap<string, PendingRequest>,
  socket: WebSocket,
) {
  const next = new Map<string, PendingRequest>();
  for (const [id, request] of pending.entries()) {
    if (request.socket !== socket) {
      next.set(id, request);
    }
  }
  return next;
}

export const ServerEdgeLive = Layer.scoped(
  ServerEdge,
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const desktopEnvironment = yield* DesktopEnvironmentService;
    const rProcess = yield* RProcessService;
    const bayesgroveSocket = yield* BayesgroveSocket;
    const cache = yield* GraphStateCache;
    const hub = yield* WebSocketHub;
    const statusStore = yield* SessionStatusStore;
    const effectRuntime = yield* Effect.runtime<never>();
    const pendingRequests = yield* Ref.make(new Map<string, PendingRequest>());
    const refreshInFlight = yield* Ref.make(false);

    const publishStatus = (state: SessionStatus['state'], reason?: string) =>
      Effect.gen(function* () {
        const next = sessionStatus(state, reason);
        yield* statusStore.set(next);
        const push: WsPush = { _tag: 'WsPush', channel: 'session.status', payload: next };
        yield* hub.broadcast(push);
      });

    const publishDesktopEnvironment = (state: DesktopEnvironmentState) => {
      const push: WsPush = { _tag: 'WsPush', channel: 'desktop.environment', payload: state };
      return hub.broadcast(push);
    };

    const requestSnapshotRefresh = Effect.gen(function* () {
      const inFlight = yield* Ref.get(refreshInFlight);
      if (inFlight) {
        return;
      }
      yield* Ref.set(refreshInFlight, true);
      const commandId = `${INTERNAL_SNAPSHOT_PREFIX}${crypto.randomUUID()}`;
      yield* bayesgroveSocket.send({
        protocol_version: '0.1.0',
        message_type: 'Command',
        command_id: commandId,
        command: 'bg_snapshot',
        args: {},
      }).pipe(
        Effect.catchAll(() =>
          Ref.set(refreshInFlight, false).pipe(
            Effect.zipRight(publishStatus('error', 'snapshot_refresh_failed')),
          )),
      );
    });

    const prepareSnapshot = (snapshot: GraphSnapshot) => Effect.succeed(snapshot);
    const publishWorkflowSnapshot = (snapshot: GraphSnapshot) =>
      Effect.gen(function* () {
        const preparedSnapshot = yield* prepareSnapshot(snapshot);
        yield* cache.writeSnapshot(preparedSnapshot);
        yield* publishStatus('ready');
        const push: WsPush = { _tag: 'WsPush', channel: 'workflow.snapshot', payload: preparedSnapshot };
        yield* hub.broadcast(push);
      });
    const handleCommandResult = (result: BayesgroveCommandResult) =>
      Effect.gen(function* () {
        if (result.command_id.startsWith(INTERNAL_SNAPSHOT_PREFIX)) {
          yield* Ref.set(refreshInFlight, false);
          if (result.ok) {
            const snapshot = wrapSnapshotResult(result.result, result.protocol_version);
            if (snapshot) {
              yield* publishWorkflowSnapshot(snapshot);
            }
          }
          return;
        }

        if (result.command_id.includes('default-workflow') || result.command_id.includes('workflow-packs')) {
          console.log('[server-edge] command result', {
            commandId: result.command_id,
            ok: result.ok,
          });
        }

        if (result.ok) {
          const snapshot = wrapSnapshotResult(result.result, result.protocol_version);
          if (snapshot) {
            yield* publishWorkflowSnapshot(snapshot);
          }
        }

        const requestMap = yield* Ref.get(pendingRequests);
        const nextRequests = new Map(requestMap);
        const pending = nextRequests.get(result.command_id);
        if ((result.command_id.includes('default-workflow') || result.command_id.includes('workflow-packs'))) {
          console.log('[server-edge] pending lookup', {
            commandId: result.command_id,
            found: Boolean(pending),
            pendingIds: [...requestMap.keys()],
          });
        }
        if (!pending) {
          return;
        }

        nextRequests.delete(result.command_id);
        yield* Ref.set(pendingRequests, nextRequests);

        const response = result.ok
          ? successResponse(result.command_id, pending.method, ackResult())
          : errorResponse(
              result.command_id,
              pending.method,
              rpcError(
                result.error?.code ?? 'command_failed',
                result.error?.message ?? 'Command failed.',
                result.error,
              ),
            );
        yield* hub.send(pending.socket, response);
      });

    const handleBayesgroveMessage = (message: GraphSnapshot | ProtocolEvent | BayesgroveCommandResult) =>
      Effect.gen(function* () {
        if ('message_type' in message && message.message_type === 'GraphSnapshot') {
          yield* Ref.set(refreshInFlight, false);
          const preparedSnapshot = yield* prepareSnapshot(message);
          yield* cache.writeSnapshot(preparedSnapshot);
          yield* publishStatus('ready');
          const push: WsPush = { _tag: 'WsPush', channel: 'workflow.snapshot', payload: preparedSnapshot };
          yield* hub.broadcast(push);
          return;
        }

        if ('message_type' in message && message.message_type === 'ProtocolEvent') {
          yield* cache.writeProtocolEvent(message);
          const push: WsPush = { _tag: 'WsPush', channel: 'workflow.event', payload: message };
          yield* hub.broadcast(push);
          yield* requestSnapshotRefresh;
          return;
        }

        yield* handleCommandResult(message);
      });

    yield* Effect.forkScoped(
      Stream.runForEach(bayesgroveSocket.messages, (message) => handleBayesgroveMessage(message)),
    );

    const runImmediateRequest = (
      socket: WebSocket,
      request: Exclude<WebSocketRequestMessage, Extract<WebSocketRequestMessage, { method: `workflow.${string}` }>>,
    ): Effect.Effect<void, unknown> =>
      Effect.gen(function* () {
        switch (request.method) {
          case 'desktop.getEnvironment': {
            const result = yield* desktopEnvironment.getState;
            yield* hub.send(socket, successResponse(request.id, request.method, result));
            return;
          }
          case 'desktop.refreshEnvironment': {
            const result = yield* desktopEnvironment.refreshState;
            yield* publishDesktopEnvironment(result);
            yield* hub.send(socket, successResponse(request.id, request.method, result));
            return;
          }
          case 'desktop.saveSettings': {
            const result = yield* desktopEnvironment.saveSettings(request.body.settings);
            yield* publishDesktopEnvironment(result);
            yield* hub.send(socket, successResponse(request.id, request.method, result));
            return;
          }
          case 'desktop.resetSettings': {
            const result = yield* desktopEnvironment.resetSettings;
            yield* publishDesktopEnvironment(result);
            yield* hub.send(socket, successResponse(request.id, request.method, result));
            return;
          }
          case 'desktop.bootstrapProject': {
            const result = yield* desktopEnvironment.bootstrapProject(request.body.projectPath).pipe(
              Effect.catchAll((error) =>
                desktopEnvironment.getState.pipe(
                  Effect.tap((state) => publishDesktopEnvironment(state)),
                  Effect.zipRight(Effect.fail(error)),
                ),
              ),
            );
            yield* publishDesktopEnvironment(result);
            yield* cache.clear;
            yield* Ref.set(refreshInFlight, false);
            yield* bayesgroveSocket.disconnect;
            yield* rProcess.restart;
            yield* bayesgroveSocket.connect;
            yield* requestSnapshotRefresh;
            yield* hub.send(socket, successResponse(request.id, request.method, result));
            return;
          }
          case 'host.openInEditor': {
            const runtime = yield* desktopEnvironment.getSessionRuntime;

            yield* Effect.tryPromise({
              try: () =>
                runtime.editorCommand
                  ? open(request.body.path, { app: { name: runtime.editorCommand } })
                  : open(request.body.path),
              catch: (error) =>
                new CommandDispatchError({
                  code: 'editor_open_failed',
                  message: `Failed to open file in editor: ${error instanceof Error ? error.message : String(error)}`,
                  cause: error,
                }),
            });
            yield* hub.send(socket, successResponse(request.id, request.method, ackResult()));
            return;
          }
          case 'session.restart': {
            const nextEnvironment = yield* desktopEnvironment.refreshState;
            yield* publishDesktopEnvironment(nextEnvironment);
            yield* cache.clear;
            yield* Ref.set(refreshInFlight, false);
            yield* bayesgroveSocket.disconnect;
            yield* rProcess.restart;
            yield* bayesgroveSocket.connect;
            yield* requestSnapshotRefresh;
            yield* hub.send(socket, successResponse(request.id, request.method, ackResult()));
            return;
          }
          case 'repl.write': {
            const running = yield* rProcess.isRunning;
            if (!running) {
              return yield* new RSessionUnavailableError({
                message: 'The R process is not running.',
              });
            }

            yield* rProcess.sendInput(request.body.data);
            yield* requestSnapshotRefresh;
            yield* hub.send(socket, successResponse(request.id, request.method, ackResult()));
            return;
          }
          case 'repl.clear': {
            yield* cache.clearReplLines;
            const push: WsPush = {
              _tag: 'WsPush',
              channel: 'repl.cleared',
              payload: { _tag: 'ReplCleared' },
            };
            yield* hub.broadcast(push);
            yield* hub.send(socket, successResponse(request.id, request.method, ackResult()));
            return;
          }
        }
      });

    const runWorkflowRequest = (
      socket: WebSocket,
      request: Extract<WebSocketRequestMessage, { method: `workflow.${string}` }>,
    ): Effect.Effect<void, unknown> =>
      Effect.gen(function* () {
        const connected = yield* bayesgroveSocket.isConnected;
        if (!connected) {
          return yield* new RSessionUnavailableError({
            message: 'The bayesgrove session is not connected.',
          });
        }

        if (request.method === 'workflow.executeAction') {
          const snapshot = yield* cache.getSnapshot;
          const rawCommand = yield* Effect.try({
            try: () => toExecuteActionCommand(request.id, request.body, Option.getOrNull(snapshot)),
            catch: wrapCommandMappingError,
          });
          yield* Ref.update(
            pendingRequests,
            (current) => new Map(current).set(request.id, { socket, method: request.method }),
          );
          yield* bayesgroveSocket.send(rawCommand);
          return;
        }

        const rawCommand = yield* Effect.try({
          try: () => toBayesgroveCommand(request.id, request),
          catch: wrapCommandMappingError,
        });

        yield* Ref.update(
          pendingRequests,
          (current) => new Map(current).set(request.id, { socket, method: request.method }),
        );
        if (request.method === 'workflow.useDefaultWorkflow' || request.method === 'workflow.useWorkflowPacks') {
          console.log('[server-edge] queued workflow request', {
            id: request.id,
            method: request.method,
          });
        }
        yield* bayesgroveSocket.send(rawCommand);
      });

    const handleRequest = (socket: WebSocket, request: WebSocketRequestMessage): Effect.Effect<void> => {
      const effect = request.method.startsWith('workflow.')
        ? runWorkflowRequest(socket, request as Extract<WebSocketRequestMessage, { method: `workflow.${string}` }>)
        : runImmediateRequest(socket, request as Exclude<WebSocketRequestMessage, Extract<WebSocketRequestMessage, { method: `workflow.${string}` }>>);

      return Effect.catchAll(effect, (error) =>
        hub.send(socket, errorResponse(request.id, request.method, commandErrorPayload(error))),
      );
    };

    const bootstrapFor = (
      snapshot: Option.Option<GraphSnapshot>,
      replHistory: ReadonlyArray<string>,
      currentStatus: SessionStatus,
      currentDesktopEnvironment: DesktopEnvironmentState,
    ): ServerBootstrap => ({
      _tag: 'ServerBootstrap',
      version: config.version,
      projectPath: currentDesktopEnvironment.preflight.projectPath,
      sessionStatus: currentStatus,
      desktopEnvironment: currentDesktopEnvironment,
      ...(Option.isSome(snapshot) ? { snapshot: snapshot.value } : {}),
      replHistory: [...replHistory],
    });

    const handleRawMessage = (socket: WebSocket, payload: unknown) =>
      Effect.gen(function* () {
        const parsedResult = decodeJsonPayload(String(payload));
        if (Either.isLeft(parsedResult)) {
          yield* Effect.sync(() => socket.close(1008, 'Invalid websocket request.'));
          return;
        }
        const parsed = parsedResult.right;

        const decoded = decodeWsRequestPayload(parsed);
        if (Either.isRight(decoded)) {
          yield* handleRequest(socket, decoded.right);
          return;
        }

        const fallback = invalidRequestMetadata(parsed);
        if (!fallback) {
          yield* Effect.sync(() => socket.close(1008, 'Invalid websocket request.'));
          return;
        }

        yield* hub.send(
          socket,
          errorResponse(
            fallback.id,
            fallback.method,
            rpcError(
              'invalid_request',
              `The websocket request payload could not be decoded. ${formatSchemaError(decoded.left)}`,
              parsed,
            ),
          ),
        );
      });

    const attachClient = (socket: WebSocket) =>
      Effect.gen(function* () {
        const snapshot = yield* cache.getSnapshot;
        const currentStatus = yield* statusStore.get;
        const replHistory = yield* cache.getReplLines(config.replReplayLimit);
        const currentDesktopEnvironment = yield* desktopEnvironment.getState;
        const bootstrapPush: WsPush = {
          _tag: 'WsPush',
          channel: 'server.bootstrap',
          payload: bootstrapFor(snapshot, replHistory, currentStatus, currentDesktopEnvironment),
        };
        const bootstrapDelivered = yield* hub.send(socket, bootstrapPush);
        if (!bootstrapDelivered) {
          return;
        }

        yield* hub.add(socket);
        yield* hub.replayLatest(socket);

        if (Option.isNone(snapshot)) {
          yield* requestSnapshotRefresh;
        }

        yield* Effect.sync(() => {
          socket.on('message', (payload) => {
            void Runtime.runPromise(effectRuntime, handleRawMessage(socket, payload));
          });

          const cleanup = () => {
            void Runtime.runPromise(
              effectRuntime,
              Effect.gen(function* () {
                yield* hub.remove(socket);
                yield* Ref.update(pendingRequests, (current) => removePendingForSocket(current, socket));
              }),
            );
          };

          socket.on('close', cleanup);
          socket.on('error', cleanup);
        });
      });

    const startSession = Effect.gen(function* () {
      yield* desktopEnvironment.refreshState;
      yield* cache.clear;
      yield* rProcess.start;
      yield* bayesgroveSocket.connect;
      yield* requestSnapshotRefresh;
    }).pipe(
      Effect.catchAll((error) =>
        publishStatus('error', error instanceof Error ? error.message : String(error)).pipe(
          Effect.zipRight(Effect.void),
        ),
      ),
    );

    return {
      startSession,
      attachClient,
    };
  }),
);
