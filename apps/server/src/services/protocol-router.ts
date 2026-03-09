import * as crypto from 'node:crypto';
import type { WebSocket } from 'ws';
import open from 'open';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Ref from 'effect/Ref';
import * as Stream from 'effect/Stream';

import {
  decodeCommandEnvelope,
  normalizeGraphSnapshotExtensions,
  type BayesgroveCommand,
  type BayesgroveCommandResult,
  type CommandEnvelope,
  type CommandResult,
  type GraphSnapshot,
  type HostCommand,
  type ProtocolEvent,
  type SessionStatus,
  type WorkflowCommand,
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
import { FrontendBroadcast } from './frontend-broadcast';
import { GraphStateCache } from './graph-state-cache';
import { RProcessService } from './r-process';
import { SessionStatusStore } from './session-status';

export class ProtocolRouter extends Context.Tag('glade/ProtocolRouter')<
  ProtocolRouter,
  {
    readonly startSession: Effect.Effect<void, never>;
    readonly attachClient: (socket: WebSocket) => Effect.Effect<void>;
  }
>() {}

const INTERNAL_SNAPSHOT_PREFIX = 'internal.snapshot.';

function commandResult(
  id: string,
  success: boolean,
  payload?: unknown,
  error?: CommandResult['error'],
): CommandResult {
  return {
    type: 'CommandResult',
    id,
    success,
    ...(payload === undefined ? {} : { payload }),
    ...(error === undefined ? {} : { error }),
  };
}

function sessionStatus(state: SessionStatus['state'], reason?: string): SessionStatus {
  return reason ? { type: 'SessionStatus', state, reason } : { type: 'SessionStatus', state };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isHostCommand(command: CommandEnvelope['command']): command is HostCommand {
  return ['OpenFileInEditor', 'SelectDirectory', 'GetSystemInfo'].includes(command.type);
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
    graph: state.graph ?? {},
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

function toBayesgroveCommand(id: string, command: WorkflowCommand): BayesgroveCommand {
  switch (command.type) {
    case 'AddNode':
      return {
        protocol_version: '0.1.0',
        message_type: 'Command',
        command_id: id,
        command: 'bg_add_node',
        args: {
          kind: command.kind,
          label: command.label,
          params: command.params,
          inputs: command.inputs,
          metadata: command.metadata,
        },
      };
    case 'DeleteNode':
      return {
        protocol_version: '0.1.0',
        message_type: 'Command',
        command_id: id,
        command: 'bg_remove_node',
        args: { node_id: command.nodeId },
      };
    case 'ConnectNodes':
      return {
        protocol_version: '0.1.0',
        message_type: 'Command',
        command_id: id,
        command: 'bg_connect',
        args: {
          from: command.from,
          to: command.to,
          edge_type: command.edgeType,
          metadata: command.metadata,
        },
      };
    case 'RenameNode':
      return {
        protocol_version: '0.1.0',
        message_type: 'Command',
        command_id: id,
        command: 'bg_update_node',
        args: { node_id: command.nodeId, label: command.label },
      };
    case 'UpdateNodeNotes':
      return {
        protocol_version: '0.1.0',
        message_type: 'Command',
        command_id: id,
        command: 'bg_update_node',
        args: {
          node_id: command.nodeId,
          metadata: {
            notes: command.notes,
          },
        },
      };
    case 'UpdateNodeParameters':
      return {
        protocol_version: '0.1.0',
        message_type: 'Command',
        command_id: id,
        command: 'bg_update_node',
        args: {
          node_id: command.nodeId,
          params: command.params,
        },
      };
    case 'SetNodeFile':
      return {
        protocol_version: '0.1.0',
        message_type: 'Command',
        command_id: id,
        command: 'bg_update_node',
        args: {
          node_id: command.nodeId,
          metadata: {
            linked_file: command.path,
            file_path: command.path,
          },
        },
      };
    case 'RecordDecision':
      return {
        protocol_version: '0.1.0',
        message_type: 'Command',
        command_id: id,
        command: 'bg_record_decision',
        args: {
          scope: command.scope,
          prompt: command.prompt,
          choice: command.choice,
          alternatives: command.alternatives,
          rationale: command.rationale,
          refs: command.refs,
          evidence: command.evidence,
          kind: command.kind,
          metadata: command.metadata,
        },
      };
    default:
      throw new CommandDispatchError({
        code: 'unsupported_workflow_command',
        message: `Workflow command ${command.type} is not supported by the current bayesgrove protocol.`,
      });
  }
}

function wrapCommandMappingError(cause: unknown) {
  return cause instanceof CommandDispatchError
    ? cause
    : new CommandDispatchError({
        code: 'workflow_mapping_failed',
        message: 'Failed to map workflow command.',
        cause,
      });
}

export const ProtocolRouterLive = Layer.scoped(
  ProtocolRouter,
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const rProcess = yield* RProcessService;
    const bayesgroveSocket = yield* BayesgroveSocket;
    const cache = yield* GraphStateCache;
    const broadcast = yield* FrontendBroadcast;
    const statusStore = yield* SessionStatusStore;
    const pendingRequests = yield* Ref.make(new Map<string, WebSocket>());
    const refreshInFlight = yield* Ref.make(false);

    const publishStatus = (state: SessionStatus['state'], reason?: string) =>
      Effect.gen(function* () {
        const next = sessionStatus(state, reason);
        yield* statusStore.set(next);
        yield* broadcast.broadcast(next);
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
        Effect.catchAll(() => publishStatus('error', 'snapshot_refresh_failed')),
      );
    });

    const prepareSnapshot = (snapshot: GraphSnapshot) =>
      Effect.tryPromise(() => cacheSnapshotExtensionBundles(snapshot, config.stateDir)).pipe(Effect.orDie);

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
              yield* broadcast.broadcast(preparedSnapshot);
            }
          }
          return;
        }

        const requestMap = yield* Ref.get(pendingRequests);
        const socket = requestMap.get(result.command_id);
        if (!socket) {
          return;
        }
        requestMap.delete(result.command_id);
        yield* Ref.set(pendingRequests, new Map(requestMap));
        yield* broadcast.send(
          socket,
          result.ok
            ? commandResult(result.command_id, true, result.result)
            : commandResult(result.command_id, false, undefined, {
                code: result.error?.code ?? 'command_failed',
                message: result.error?.message ?? 'Command failed.',
                data: result.error,
              }),
        );
      });

    const handleBayesgroveMessage = (message: GraphSnapshot | ProtocolEvent | BayesgroveCommandResult) =>
      Effect.gen(function* () {
        if ('message_type' in message && message.message_type === 'GraphSnapshot') {
          const preparedSnapshot = yield* prepareSnapshot(message);
          yield* cache.writeSnapshot(preparedSnapshot);
          yield* publishStatus('ready');
          yield* broadcast.broadcast(preparedSnapshot);
          return;
        }

        if ('message_type' in message && message.message_type === 'ProtocolEvent') {
          yield* cache.writeProtocolEvent(message);
          yield* broadcast.broadcast(message);
          yield* requestSnapshotRefresh;
          return;
        }

        yield* handleCommandResult(message);
      });

    yield* Effect.forkScoped(
      Stream.runForEach(bayesgroveSocket.messages, (message) => handleBayesgroveMessage(message)),
    );

    const runHostCommand = (
      socket: WebSocket,
      id: string,
      command: HostCommand,
    ): Effect.Effect<void, unknown> =>
      Effect.gen(function* () {
        switch (command.type) {
          case 'GetSystemInfo': {
            yield* broadcast.send(
              socket,
              commandResult(id, true, {
                platform: process.platform,
                arch: process.arch,
                hostedMode: config.hostedMode,
                runtime: config.runtime,
                projectPath: config.projectPath,
              }),
            );
            return;
          }
          case 'OpenFileInEditor': {
            if (config.hostedMode) {
              return yield* Effect.fail(
                new HostedCapabilityError({
                  code: 'unsupported_in_hosted_mode',
                  message: 'OpenFileInEditor is unavailable in hosted mode.',
                }),
              );
            }
            yield* Effect.tryPromise({
              try: () =>
                config.editorCommand
                  ? open(command.path, {
                      app: {
                        name: config.editorCommand,
                      },
                    })
                  : open(command.path),
              catch: (error) =>
                new CommandDispatchError({
                  code: 'editor_open_failed',
                  message: `Failed to open file in editor: ${error instanceof Error ? error.message : String(error)}`,
                  cause: error,
                }),
            });
            yield* broadcast.send(socket, commandResult(id, true, { opened: true }));
            return;
          }
          case 'SelectDirectory':
            return yield* Effect.fail(
              new HostedCapabilityError({
                code: 'unsupported_host_command',
                message: 'SelectDirectory is not implemented yet.',
              }),
            );
        }
      });

    const runWorkflowCommand = (
      socket: WebSocket,
      id: string,
      command: WorkflowCommand,
    ): Effect.Effect<void, unknown> =>
      Effect.gen(function* () {
        if (command.type === 'RestartSession') {
          yield* cache.clear;
          yield* bayesgroveSocket.disconnect;
          yield* rProcess.restart;
          yield* bayesgroveSocket.connect;
          yield* broadcast.send(socket, commandResult(id, true, { restarted: true }));
          return;
        }

        if (command.type === 'ReplInput') {
          if (config.hostedMode) {
            return yield* Effect.fail(
              new HostedCapabilityError({
                code: 'interactive_repl_unavailable',
                message: 'Interactive REPL is unavailable in hosted mode.',
              }),
            );
          }

          const running = yield* rProcess.isRunning;
          if (!running) {
            return yield* Effect.fail(
              new RSessionUnavailableError({
                message: 'The R process is not running.',
              }),
            );
          }

          yield* rProcess.sendInput(command.data);
          yield* broadcast.send(socket, commandResult(id, true, { accepted: true }));
          return;
        }

        if (command.type === 'ClearRepl') {
          yield* broadcast.broadcast({ type: 'ReplOutput', line: '\f' });
          yield* broadcast.send(socket, commandResult(id, true, { cleared: true }));
          return;
        }

        const connected = yield* bayesgroveSocket.isConnected;
        if (!connected) {
          return yield* Effect.fail(
            new RSessionUnavailableError({
              message: 'The bayesgrove session is not connected.',
            }),
          );
        }

        const rawCommand = command.type === 'ExecuteAction'
          ? yield* Effect.gen(function* () {
            const snapshot = yield* cache.getSnapshot;
            return yield* Effect.try({
              try: () => toExecuteActionCommand(id, command, Option.getOrNull(snapshot)),
              catch: wrapCommandMappingError,
            });
          })
          : yield* Effect.try({
            try: () => toBayesgroveCommand(id, command),
            catch: wrapCommandMappingError,
          });
        const requestMap = yield* Ref.get(pendingRequests);
        requestMap.set(id, socket);
        yield* Ref.set(pendingRequests, new Map(requestMap));
        yield* bayesgroveSocket.send(rawCommand);
      });

    const commandErrorPayload = (error: unknown) => {
      if (error instanceof HostedCapabilityError || error instanceof CommandDispatchError) {
        return { code: error.code, message: error.message };
      }
      if (error instanceof RSessionUnavailableError) {
        return { code: 'r_session_unavailable', message: error.message };
      }
      return { code: 'command_failed', message: error instanceof Error ? error.message : String(error) };
    };

    const handleEnvelope = (socket: WebSocket, envelope: CommandEnvelope): Effect.Effect<void> => {
      const effect: Effect.Effect<void, unknown> = isHostCommand(envelope.command)
        ? runHostCommand(socket, envelope.id, envelope.command)
        : runWorkflowCommand(socket, envelope.id, envelope.command);

      return Effect.catchAll(effect, (error) =>
        broadcast.send(socket, commandResult(envelope.id, false, undefined, commandErrorPayload(error))),
      );
    };

    const attachClient = (socket: WebSocket) =>
      Effect.gen(function* () {
        yield* broadcast.add(socket);
        const snapshot = yield* cache.getSnapshot;
        if (Option.isSome(snapshot)) {
          yield* broadcast.send(socket, snapshot.value);
        } else {
          yield* requestSnapshotRefresh;
        }
        yield* broadcast.send(socket, yield* statusStore.get);
        for (const line of yield* cache.getReplLines(config.replReplayLimit)) {
          yield* broadcast.send(socket, { type: 'ReplOutput', line });
        }

        yield* Effect.sync(() => {
          socket.on('message', (payload) => {
            void Effect.runPromise(
              Effect.gen(function* () {
                const parsed = JSON.parse(String(payload)) as unknown;
                const envelope = yield* decodeCommandEnvelope(parsed);
                yield* handleEnvelope(socket, envelope);
              }).pipe(
                Effect.catchAll((error) =>
                  broadcast.send(
                    socket,
                    commandResult('invalid', false, undefined, {
                      code: 'invalid_command',
                      message: error instanceof Error ? error.message : String(error),
                    }),
                  ),
                ),
              ),
            );
          });

          socket.on('close', () => {
            void Effect.runPromise(broadcast.remove(socket));
          });

          socket.on('error', () => {
            void Effect.runPromise(broadcast.remove(socket));
          });
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
        publishStatus('error', error.message).pipe(Effect.zipRight(Effect.void)),
      ),
    );

    return {
      startSession,
      attachClient,
    };
  }),
);
