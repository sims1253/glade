import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import {
  decodeWsMessage,
  type RpcError,
  type WebSocketRequest,
  type WebSocketResponse,
} from '@glade/contracts';

import {
  describeRpcCall,
  failureTitle,
  makeRequest,
  shouldSuppressSuccessToast,
  type RpcCallResult,
  type RpcClient,
  type RpcMethod,
  type RpcRequestBody,
  type RpcResultValue,
} from '../lib/rpc';
import { websocketUrl } from '../lib/runtime';
import { useConnectionStore } from '../store/connection';
import { useGraphStore } from '../store/graph';
import { useReplStore } from '../store/repl';
import { useToastStore } from '../store/toast';

const decodeJsonString = Schema.decodeUnknown(Schema.parseJson());

type PendingRequest = {
  readonly method: RpcMethod;
  readonly body: WebSocketRequest['body'];
  readonly resolve: (result: RpcCallResult<any>) => void;
  readonly timeout: number;
};

function websocketUnavailableError(message: string): RpcError {
  return {
    _tag: 'RpcError',
    code: 'websocket_unavailable',
    message,
  };
}

export function useRpcClient(): RpcClient {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const manualReconnectRef = useRef(false);
  const pendingRequestsRef = useRef(new Map<string, PendingRequest>());
  const [socketGeneration, setSocketGeneration] = useState(0);

  const finishPending = useCallback((response: WebSocketResponse) => {
    const pending = pendingRequestsRef.current.get(response.id);
    if (!pending) {
      return;
    }

    window.clearTimeout(pending.timeout);
    pendingRequestsRef.current.delete(response.id);

    if (response._tag === 'WebSocketSuccess') {
      pending.resolve({ success: true, result: response.result });
      if (!shouldSuppressSuccessToast(response.method)) {
        useToastStore.getState().pushNotification({
          tone: 'success',
          title: describeRpcCall(response.method, pending.body),
          description: null,
        });
      }
      return;
    }

    pending.resolve({ success: false, error: response.error });
    useToastStore.getState().pushNotification({
      tone: 'error',
      title: failureTitle(response.method),
      description: response.error.message,
    });
  }, []);

  const rejectAllPending = useCallback((message: string) => {
    for (const pending of pendingRequestsRef.current.values()) {
      window.clearTimeout(pending.timeout);
      pending.resolve({
        success: false,
        error: websocketUnavailableError(message),
      });
    }
    pendingRequestsRef.current.clear();
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

  useEffect(() => {
    const socket = new WebSocket(websocketUrl());
    socketRef.current = socket;
    useConnectionStore.getState().markConnecting();

    socket.onopen = () => {
      if (socketRef.current !== socket) {
        return;
      }

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      useConnectionStore.getState().markConnecting();
      manualReconnectRef.current = false;
    };

    socket.onmessage = (event) => {
      if (socketRef.current !== socket) {
        return;
      }

      void Effect.runPromise(
        Effect.gen(function* () {
          const payload = yield* decodeJsonString(String(event.data));
          const message = yield* decodeWsMessage(payload);

          if (message._tag === 'WsPush') {
            switch (message.channel) {
              case 'server.bootstrap':
                useConnectionStore.getState().applyBootstrap(message.payload);
                useReplStore.getState().replaceLines(message.payload.replHistory);
                if (message.payload.snapshot) {
                  useGraphStore.getState().applySnapshot(message.payload.snapshot);
                }
                return;
              case 'desktop.environment':
                useConnectionStore.getState().setDesktopEnvironment(message.payload);
                return;
              case 'session.status':
                useConnectionStore.getState().setSessionStatus(message.payload);
                return;
              case 'workflow.snapshot':
                useGraphStore.getState().applySnapshot(message.payload);
                return;
              case 'workflow.event':
                useGraphStore.getState().applyProtocolEvent(message.payload);
                return;
              case 'repl.output':
                useReplStore.getState().appendLine(message.payload.line);
                return;
              case 'repl.cleared':
                useReplStore.getState().clearLines();
                return;
            }
          }

          finishPending(message);
        }),
      ).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[websocket] failed to process server message', error);
        useToastStore.getState().pushNotification({
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

      useConnectionStore.getState().markDisconnected('websocket_closed');
      rejectAllPending('The websocket connection closed before the request completed.');

      if (!manualReconnectRef.current) {
        scheduleReconnect(1_000);
      }
    };

    socket.onerror = () => {
      if (socketRef.current !== socket) {
        return;
      }

      useConnectionStore.getState().setSessionStatus({
        _tag: 'SessionStatus',
        state: 'error',
        reason: 'websocket_error',
      });
    };

    return () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
        rejectAllPending('The websocket connection closed before the request completed.');
      }
      socket.close();
    };
  }, [finishPending, rejectAllPending, scheduleReconnect, socketGeneration]);

  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
    };
  }, []);

  const sendRequest = useCallback(<TMethod extends RpcMethod>(
    method: TMethod,
    body: RpcRequestBody<TMethod>,
  ): Promise<RpcCallResult<RpcResultValue<TMethod>>> => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.resolve({
        success: false,
        error: websocketUnavailableError('The websocket connection is not ready.'),
      });
    }

    const request = makeRequest(method, body);
    return new Promise<RpcCallResult<RpcResultValue<TMethod>>>((resolve) => {
      const timeout = window.setTimeout(() => {
        pendingRequestsRef.current.delete(request.id);
        const error: RpcError = {
          _tag: 'RpcError',
          code: 'command_timeout',
          message: 'Timed out waiting for the server to respond.',
        };
        useToastStore.getState().pushNotification({
          tone: 'error',
          title: failureTitle(method),
          description: error.message,
        });
        resolve({ success: false, error });
      }, 20_000);

      pendingRequestsRef.current.set(request.id, {
        method,
        body: request.body,
        resolve: resolve as (result: RpcCallResult<any>) => void,
        timeout,
      });

      socket.send(JSON.stringify(request));
    });
  }, []);

  return useMemo(() => ({
    desktop: {
      getEnvironment: () => sendRequest('desktop.getEnvironment', { _tag: 'desktop.getEnvironment' }),
      refreshEnvironment: () => sendRequest('desktop.refreshEnvironment', { _tag: 'desktop.refreshEnvironment' }),
      saveSettings: (input) => sendRequest('desktop.saveSettings', { _tag: 'desktop.saveSettings', ...input }),
      resetSettings: () => sendRequest('desktop.resetSettings', { _tag: 'desktop.resetSettings' }),
    },
    workflow: {
      addNode: (input) => sendRequest('workflow.addNode', { _tag: 'workflow.addNode', ...input }),
      deleteNode: (input) => sendRequest('workflow.deleteNode', { _tag: 'workflow.deleteNode', ...input }),
      connectNodes: (input) => sendRequest('workflow.connectNodes', { _tag: 'workflow.connectNodes', ...input }),
      renameNode: (input) => sendRequest('workflow.renameNode', { _tag: 'workflow.renameNode', ...input }),
      recordDecision: (input) => sendRequest('workflow.recordDecision', { _tag: 'workflow.recordDecision', ...input }),
      executeAction: (input) => sendRequest('workflow.executeAction', { _tag: 'workflow.executeAction', ...input }),
      updateNodeNotes: (input) => sendRequest('workflow.updateNodeNotes', { _tag: 'workflow.updateNodeNotes', ...input }),
      updateNodeParameters: (input) => sendRequest('workflow.updateNodeParameters', { _tag: 'workflow.updateNodeParameters', ...input }),
      setNodeFile: (input) => sendRequest('workflow.setNodeFile', { _tag: 'workflow.setNodeFile', ...input }),
    },
    session: {
      restart: () => sendRequest('session.restart', { _tag: 'session.restart' }),
    },
    repl: {
      write: (data) => sendRequest('repl.write', { _tag: 'repl.write', data }),
      clear: () => sendRequest('repl.clear', { _tag: 'repl.clear' }),
    },
    host: {
      openInEditor: (input) => sendRequest('host.openInEditor', { _tag: 'host.openInEditor', ...input }),
    },
    reconnect: () => {
      manualReconnectRef.current = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      socketRef.current?.close();
      setSocketGeneration((current) => current + 1);
    },
  }), [sendRequest]);
}
