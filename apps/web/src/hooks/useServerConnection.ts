import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Effect from 'effect/Effect';

import {
  decodeHealthResponse,
  decodeServerMessage,
  type Command,
  type CommandResult,
  type HostCommand,
  type WorkflowCommand,
} from '@glade/contracts';

import { websocketUrl } from '../lib/runtime';
import { createCommandEnvelope, describeCommand } from '../lib/workflow-commands';
import { useAppStore } from '../store/app';
import { useGraphStore } from '../store/graph';

export const healthQueryKey = ['health'] as const;

async function fetchHealth() {
  const response = await fetch('/health');
  const payload = (await response.json()) as unknown;
  return await Effect.runPromise(decodeHealthResponse(payload));
}

export function useServerConnection() {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const manualReconnectRef = useRef(false);
  const pendingCommandsRef = useRef(new Map<string, {
    readonly command: Command;
    readonly resolve: (result: CommandResult) => void;
    readonly timeout: number;
  }>());
  const [socketGeneration, setSocketGeneration] = useState(0);
  const setServerConnected = useAppStore((state) => state.setServerConnected);
  const setServerVersion = useAppStore((state) => state.setServerVersion);
  const setSessionState = useAppStore((state) => state.setSessionState);
  const setSessionReason = useAppStore((state) => state.setSessionReason);
  const pushNotification = useAppStore((state) => state.pushNotification);
  const appendReplLine = useAppStore((state) => state.appendReplLine);
  const applySnapshot = useGraphStore((state) => state.applySnapshot);
  const applyProtocolEvent = useGraphStore((state) => state.applyProtocolEvent);

  const finishPendingCommand = useCallback((result: CommandResult) => {
    const pending = pendingCommandsRef.current.get(result.id);
    if (!pending) {
      return;
    }

    window.clearTimeout(pending.timeout);
    pendingCommandsRef.current.delete(result.id);
    pending.resolve(result);

    if (result.success) {
      if (pending.command.type === 'ReplInput' || pending.command.type === 'ClearRepl') {
        return;
      }

      pushNotification({
        tone: 'success',
        title: describeCommand(pending.command),
        description: null,
      });
      return;
    }

    pushNotification({
      tone: 'error',
      title: `Could not ${pending.command.type}`,
      description: result.error?.message ?? 'The bayesgrove session rejected the command.',
    });
  }, [pushNotification]);

  const rejectAllPending = useCallback((message: string) => {
    for (const [id, pending] of pendingCommandsRef.current.entries()) {
      window.clearTimeout(pending.timeout);
      pending.resolve({
        type: 'CommandResult',
        id,
        success: false,
        error: {
          code: 'websocket_closed',
          message,
        },
      });
    }
    pendingCommandsRef.current.clear();
  }, []);

  const scheduleReconnect = useCallback((delayMs: number) => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
    }

    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      setSocketGeneration((current) => current + 1);
    }, delayMs);
  }, []);

  const healthQuery = useQuery({
    queryKey: healthQueryKey,
    queryFn: fetchHealth,
    refetchInterval: 15_000,
    retry: 2,
  });

  useEffect(() => {
    if (healthQuery.data) {
      setServerConnected(true);
      setServerVersion(healthQuery.data.version);
      setSessionReason(null);
    }

    if (healthQuery.isError) {
      setServerConnected(false);
      setSessionState('error');
      setSessionReason('health_check_failed');
    }
  }, [healthQuery.data, healthQuery.isError, setServerConnected, setServerVersion, setSessionReason, setSessionState]);

  useEffect(() => {
    const socket = new WebSocket(websocketUrl());
    socketRef.current = socket;

    socket.onopen = () => {
      if (socketRef.current !== socket) {
        return;
      }

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      setServerConnected(true);
      setSessionState('ready');
      setSessionReason(null);
      manualReconnectRef.current = false;
    };

    socket.onmessage = (event) => {
      if (socketRef.current !== socket) {
        return;
      }

      void Effect.runPromise(
        Effect.gen(function* () {
          const message = yield* decodeServerMessage(JSON.parse(String(event.data)));
          if (message.type === 'SessionStatus') {
            setSessionState(message.state);
            setSessionReason(message.reason ?? null);
            setServerConnected(message.state !== 'error');
            return;
          }

          if (message.type === 'CommandResult') {
            finishPendingCommand(message);
            return;
          }

          if (message.type === 'ReplOutput') {
            appendReplLine(message.line);
            return;
          }

          if (message.message_type === 'GraphSnapshot') {
            applySnapshot(message);
            return;
          }

          if (message.message_type === 'ProtocolEvent') {
            applyProtocolEvent(message);
          }
        }),
      ).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[websocket] failed to process server message', error);
        pushNotification({
          tone: 'error',
          title: 'Could not process server message',
          description: message,
        });
      });
    };

    socket.onclose = () => {
      if (socketRef.current !== socket) {
        return;
      }

      setServerConnected(false);
      setSessionState('error');
      setSessionReason('websocket_closed');
      rejectAllPending('The websocket connection closed before the command completed.');

      if (!manualReconnectRef.current) {
        scheduleReconnect(1_000);
      }
    };

    socket.onerror = () => {
      if (socketRef.current !== socket) {
        return;
      }

      setSessionState('error');
      setSessionReason('websocket_error');
    };

    return () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
        rejectAllPending('The websocket connection closed before the command completed.');
      }
      socket.close();
    };
  }, [
    appendReplLine,
    applyProtocolEvent,
    applySnapshot,
    finishPendingCommand,
    rejectAllPending,
    scheduleReconnect,
    setServerConnected,
    setSessionReason,
    setSessionState,
    socketGeneration,
  ]);

  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
    };
  }, []);

  const dispatchCommand = useCallback((command: Command) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      const result: CommandResult = {
        type: 'CommandResult',
        id: crypto.randomUUID(),
        success: false,
        error: {
          code: 'websocket_unavailable',
          message: 'The websocket connection is not ready.',
        },
      };
      pushNotification({
        tone: 'error',
        title: `Could not ${command.type}`,
        description: result.error?.message ?? 'The websocket connection is not ready.',
      });
      return Promise.resolve(result);
    }

    const envelope = createCommandEnvelope(command);
    return new Promise<CommandResult>((resolve) => {
      const timeout = window.setTimeout(() => {
        pendingCommandsRef.current.delete(envelope.id);
        const result: CommandResult = {
          type: 'CommandResult',
          id: envelope.id,
          success: false,
          error: {
            code: 'command_timeout',
            message: 'Timed out waiting for bayesgrove to respond.',
          },
        };
        pushNotification({
          tone: 'error',
          title: `Could not ${command.type}`,
          description: result.error?.message ?? 'Timed out waiting for bayesgrove to respond.',
        });
        resolve(result);
      }, 20_000);

      pendingCommandsRef.current.set(envelope.id, {
        command,
        resolve,
        timeout,
      });

      socket.send(JSON.stringify(envelope));
    });
  }, [pushNotification]);

  return {
    dispatchCommand: (command: WorkflowCommand) => dispatchCommand(command),
    dispatchHostCommand: (command: HostCommand) => dispatchCommand(command),
    healthQuery,
    reconnect: () => {
      manualReconnectRef.current = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      socketRef.current?.close();
      setSocketGeneration((current) => current + 1);
      return queryClient.invalidateQueries({ queryKey: healthQueryKey });
    },
  };
}
