import * as crypto from 'node:crypto';

import type { WebSocket } from 'ws';
import open from 'open';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Ref from 'effect/Ref';
import * as Runtime from 'effect/Runtime';
import * as Schema from 'effect/Schema';
import * as Stream from 'effect/Stream';

import {
  decodeWebSocketRequest,
  normalizeGraphSnapshotExtensions,
  type AckResult,
  type BayesgroveCommand,
  type BayesgroveCommandResult,
  type GraphSnapshot,
  type JsonObject,
  type JsonValue,
  type ProtocolEvent,
  type RpcError,
  type ServerBootstrap,
  type SessionStatus,
  type SystemInfoResult,
  type WebSocketRequest,
  type WebSocketResponse,
  type WsPush,
  WS_METHODS,
} from '@glade/contracts';

import { ServerConfig } from '../config';
import { cacheSnapshotExtensionBundles } from '../lib/extension-registry';
import {
  CommandDispatchError,
  HostedCapabilityError,
  RSessionUnavailableError,
} from '../errors';
import { BayesgroveSocket } from './bayesgrove-socket';
import { toExecuteActionCommand } from './execute-action';
import {
  mergeToolExecutionMetadata,
  resolveNodeExecution,
  toSubmitNodeCommand,
  toUpdateNodeMetadataCommand,
} from './execute-node';
import { GraphStateCache } from './graph-state-cache';
import { ProcessSupervisor } from './process-supervisor';
import { RProcessService } from './r-process';
import { SessionStatusStore } from './session-status';
import { executeToolNode } from './tool-runtime';
import { WebSocketHub } from './websocket-hub';

export class ServerEdge extends Context.Tag('glade/ServerEdge')<
  ServerEdge,
  {
    readonly startSession: Effect.Effect<void, never>;
    readonly attachClient: (socket: WebSocket) => Effect.Effect<void>;
  }
>() {}

const INTERNAL_SNAPSHOT_PREFIX = 'internal.snapshot.';
const decodeJsonString = Schema.decodeUnknown(Schema.parseJson());
const WS_METHOD_SET = new Set<string>(WS_METHODS);

type PendingRequest = {
  readonly socket: WebSocket;
  readonly method: WebSocketRequest['method'];
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
  method: WebSocketRequest['method'],
  result: AckResult | SystemInfoResult,
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
  method: WebSocketRequest['method'],
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

  return normalizeGraphSnapshotExtensions({
    protocol_version: protocolVersion,
    message_type: 'GraphSnapshot',
    emitted_at: new Date().toISOString(),
    project_id: typeof state.project_id === 'string' ? state.project_id : 'unknown',
    project_name: typeof state.project_name === 'string' ? state.project_name : 'unknown',
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
    extension_registry: (state.extension_registry ?? []) as GraphSnapshot['extension_registry'],
  });
}

function toBayesgroveCommand(
  id: string,
  request: Extract<WebSocketRequest, { method: `workflow.${string}` }>,
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
  if (error instanceof HostedCapabilityError || error instanceof CommandDispatchError) {
    return rpcError(error.code, error.message);
  }

  if (error instanceof RSessionUnavailableError) {
    return rpcError('r_session_unavailable', error.message);
  }

  return rpcError('command_failed', error instanceof Error ? error.message : String(error));
}

function invalidRequestMetadata(value: unknown): { id: string; method: WebSocketRequest['method'] } | null {
  const object = asObject(value);
  if (!object || typeof object.id !== 'string' || typeof object.method !== 'string') {
    return null;
  }

  if (!WS_METHOD_SET.has(object.method)) {
    return null;
  }

  return {
    id: object.id,
    method: object.method as WebSocketRequest['method'],
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
    const rProcess = yield* RProcessService;
    const bayesgroveSocket = yield* BayesgroveSocket;
    const cache = yield* GraphStateCache;
    const hub = yield* WebSocketHub;
    const processSupervisor = yield* ProcessSupervisor;
    const statusStore = yield* SessionStatusStore;
    const effectRuntime = yield* Effect.runtime<never>();
    const pendingRequests = yield* Ref.make(new Map<string, PendingRequest>());
    const refreshInFlight = yield* Ref.make(false);
    const approvedNonLocalExecutions = yield* Ref.make(new Set<string>());

    const publishStatus = (state: SessionStatus['state'], reason?: string) =>
      Effect.gen(function* () {
        const next = sessionStatus(state, reason);
        yield* statusStore.set(next);
        const push: WsPush = { _tag: 'WsPush', channel: 'session.status', payload: next };
        yield* hub.broadcast(push);
      });

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

    const prepareSnapshot = (snapshot: GraphSnapshot) =>
      Effect.tryPromise(() => cacheSnapshotExtensionBundles(snapshot, config.stateDir)).pipe(
        Effect.catchAll((error) =>
          publishStatus('error', `snapshot_cache_failed:${error instanceof Error ? error.message : String(error)}`).pipe(
            Effect.zipRight(Effect.succeed(snapshot)),
          )),
      );

    const registerPending = (id: string, method: WebSocketRequest['method'], socket: WebSocket) =>
      Ref.update(pendingRequests, (current) => new Map(current).set(id, { socket, method }));

    const handleCommandResult = (result: BayesgroveCommandResult) =>
      Effect.gen(function* () {
        if (result.command_id.startsWith(INTERNAL_SNAPSHOT_PREFIX)) {
          yield* Ref.set(refreshInFlight, false);
          if (result.ok) {
            const snapshot = wrapSnapshotResult(result.result, result.protocol_version);
            if (snapshot) {
              const preparedSnapshot = yield* prepareSnapshot(snapshot);
              yield* cache.writeSnapshot(preparedSnapshot);
              yield* publishStatus('ready');
              const push: WsPush = { _tag: 'WsPush', channel: 'workflow.snapshot', payload: preparedSnapshot };
              yield* hub.broadcast(push);
            }
          }
          return;
        }

        const requestMap = yield* Ref.get(pendingRequests);
        const nextRequests = new Map(requestMap);
        const pending = nextRequests.get(result.command_id);
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
      request: Exclude<WebSocketRequest, Extract<WebSocketRequest, { method: `workflow.${string}` }>>,
    ): Effect.Effect<void, unknown> =>
      Effect.gen(function* () {
        switch (request.method) {
          case 'system.getInfo': {
            const result: SystemInfoResult = {
              _tag: 'SystemInfo',
              platform: process.platform,
              arch: process.arch,
              hostedMode: config.hostedMode,
              runtime: config.runtime,
              projectPath: config.projectPath,
            };
            yield* hub.send(socket, successResponse(request.id, request.method, result));
            return;
          }
          case 'host.openInEditor': {
            if (config.hostedMode) {
              return yield* new HostedCapabilityError({
                code: 'unsupported_in_hosted_mode',
                message: 'OpenInEditor is unavailable in hosted mode.',
              });
            }

            yield* Effect.tryPromise({
              try: () =>
                config.editorCommand
                  ? open(request.body.path, { app: { name: config.editorCommand } })
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
            yield* cache.clear;
            yield* bayesgroveSocket.disconnect;
            yield* rProcess.restart;
            yield* bayesgroveSocket.connect;
            yield* requestSnapshotRefresh;
            yield* hub.send(socket, successResponse(request.id, request.method, ackResult()));
            return;
          }
          case 'repl.write': {
            if (config.hostedMode) {
              return yield* new HostedCapabilityError({
                code: 'interactive_repl_unavailable',
                message: 'Interactive REPL is unavailable in hosted mode.',
              });
            }

            const running = yield* rProcess.isRunning;
            if (!running) {
              return yield* new RSessionUnavailableError({
                message: 'The R process is not running.',
              });
            }

            yield* rProcess.sendInput(request.body.data);
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
      request: Extract<WebSocketRequest, { method: `workflow.${string}` }>,
    ): Effect.Effect<void, unknown> =>
      Effect.gen(function* () {
        const connected = yield* bayesgroveSocket.isConnected;
        if (!connected) {
          return yield* new RSessionUnavailableError({
            message: 'The bayesgrove session is not connected.',
          });
        }

        if (request.method === 'workflow.executeNode') {
          const snapshot = yield* cache.getSnapshot;
          const currentSnapshot = Option.getOrNull(snapshot);
          if (!currentSnapshot) {
            return yield* new CommandDispatchError({
              code: 'missing_graph_snapshot',
              message: 'ExecuteNode requires a current GraphSnapshot.',
            });
          }

          const execution = yield* Effect.try({
            try: () => resolveNodeExecution(currentSnapshot, request.body.nodeId, {
              rootDir: config.rootDir,
              projectPath: config.projectPath,
            }),
            catch: wrapCommandMappingError,
          });

          if (execution.runtime === 'r_session') {
            yield* registerPending(request.id, request.method, socket);
            yield* bayesgroveSocket.send(toSubmitNodeCommand(request.id, request.body.nodeId));
            return;
          }

          if (!execution.command) {
            return yield* new CommandDispatchError({
              code: 'missing_tool_command',
              message: `Node ${execution.nodeId} does not declare a command for runtime ${execution.runtime}.`,
            });
          }

          const command = execution.command;

          const approvalKey = execution.extensionId ?? execution.kind;
          const approved = yield* Ref.get(approvedNonLocalExecutions);
          if (!execution.isLocalExtension && !approved.has(approvalKey) && !request.body.confirmNonLocalExecution) {
            return yield* new CommandDispatchError({
              code: 'tool_execution_confirmation_required',
              message: `Running ${execution.label} will execute a command from non-local extension ${execution.extensionPackageName ?? execution.kind}. Confirm to continue.`,
            });
          }

          const toolResult = yield* Effect.tryPromise({
            try: () => executeToolNode({
              nodeId: execution.nodeId,
              runtime: execution.runtime,
              command,
              argsTemplate: execution.argsTemplate,
              inputSerializer: execution.inputSerializer,
              outputParser: execution.outputParser,
              allowShell: execution.allowShell,
              inputs: execution.inputs,
              stateDir: config.stateDir,
              timeoutMs: config.toolExecutionTimeoutMs,
            }, {
              runProcess: (options) =>
                Runtime.runPromise(effectRuntime, processSupervisor.runBuffered({
                  command: options.command,
                  args: options.args,
                  env: options.env,
                  stdin: options.stdin,
                  stdio: ['pipe', 'pipe', 'pipe'],
                  timeoutMs: options.timeoutMs,
                })),
            }),
            catch: (error) =>
              error instanceof CommandDispatchError
                ? error
                : new CommandDispatchError({
                    code: 'tool_execution_failed',
                    message: error instanceof Error ? error.message : String(error),
                    cause: error,
                  }),
          });

          if (!execution.isLocalExtension && !approved.has(approvalKey) && request.body.confirmNonLocalExecution) {
            yield* Ref.set(approvedNonLocalExecutions, new Set(approved).add(approvalKey));
          }

          yield* registerPending(request.id, request.method, socket);
          yield* bayesgroveSocket.send(
            toUpdateNodeMetadataCommand(
              request.id,
              request.body.nodeId,
              mergeToolExecutionMetadata(execution.metadata, toolResult),
            ),
          );
          return;
        }

        if (request.method === 'workflow.executeAction') {
          const snapshot = yield* cache.getSnapshot;
          const rawCommand = yield* Effect.try({
            try: () => toExecuteActionCommand(request.id, request.body, Option.getOrNull(snapshot)),
            catch: wrapCommandMappingError,
          });
          yield* registerPending(request.id, request.method, socket);
          yield* bayesgroveSocket.send(rawCommand);
          return;
        }

        const rawCommand = yield* Effect.try({
          try: () => toBayesgroveCommand(request.id, request),
          catch: wrapCommandMappingError,
        });

        yield* registerPending(request.id, request.method, socket);
        yield* bayesgroveSocket.send(rawCommand);
      });

    const handleRequest = (socket: WebSocket, request: WebSocketRequest): Effect.Effect<void> => {
      const effect = request.method.startsWith('workflow.')
        ? runWorkflowRequest(socket, request as Extract<WebSocketRequest, { method: `workflow.${string}` }>)
        : runImmediateRequest(socket, request as Exclude<WebSocketRequest, Extract<WebSocketRequest, { method: `workflow.${string}` }>>);

      return Effect.catchAll(effect, (error) =>
        hub.send(socket, errorResponse(request.id, request.method, commandErrorPayload(error))),
      );
    };

    const bootstrapFor = (snapshot: Option.Option<GraphSnapshot>, replHistory: ReadonlyArray<string>, currentStatus: SessionStatus): ServerBootstrap => ({
      _tag: 'ServerBootstrap',
      version: config.version,
      runtime: config.runtime,
      hostedMode: config.hostedMode,
      projectPath: config.projectPath,
      sessionStatus: currentStatus,
      ...(Option.isSome(snapshot) ? { snapshot: snapshot.value } : {}),
      replHistory: [...replHistory],
    });

    const handleRawMessage = (socket: WebSocket, payload: unknown) =>
      Effect.gen(function* () {
        const parsedResult = yield* Effect.either(decodeJsonString(String(payload)));
        if (parsedResult._tag === 'Left') {
          yield* Effect.sync(() => socket.close(1008, 'Invalid websocket request.'));
          return;
        }
        const parsed = parsedResult.right;

        const decoded = yield* Effect.either(decodeWebSocketRequest(parsed));
        if (decoded._tag === 'Right') {
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
            rpcError('invalid_request', 'The websocket request payload could not be decoded.', parsed),
          ),
        );
      });

    const attachClient = (socket: WebSocket) =>
      Effect.gen(function* () {
        yield* hub.add(socket);
        const snapshot = yield* cache.getSnapshot;
        const currentStatus = yield* statusStore.get;
        const replHistory = yield* cache.getReplLines(config.replReplayLimit);
        const bootstrapPush: WsPush = {
          _tag: 'WsPush',
          channel: 'server.bootstrap',
          payload: bootstrapFor(snapshot, replHistory, currentStatus),
        };
        yield* hub.send(socket, bootstrapPush);

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
      if (!config.projectPath) {
        yield* publishStatus('error', 'project_path_not_configured');
        return;
      }

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
