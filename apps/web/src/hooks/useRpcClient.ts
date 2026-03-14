import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Either } from 'effect';

import {
  type RpcError,
  type WebSocketRequest,
  type WebSocketResponse,
  WsMessage,
} from '@glade/contracts';
import { decodeJsonResult, formatSchemaError } from '@glade/shared';

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

const REQUEST_TIMEOUT_MS = 20_000;
const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000] as const;
const decodeWsInbound = decodeJsonResult(WsMessage);

type PendingRequest = {
  readonly method: RpcMethod;
  readonly body: WebSocketRequest['body'];
  readonly resolve: (result: RpcCallResult<any>) => void;
  readonly timeout: number;
  readonly encodedRequest: string;
  queued: boolean;
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
  const reconnectAttemptRef = useRef(0);
  const manualReconnectRef = useRef(false);
  const unmountingRef = useRef(false);
  const pendingRequestsRef = useRef(new Map<string, PendingRequest>());
  const outboundQueueRef = useRef<Array<string>>([]);
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
    outboundQueueRef.current = [];
  }, []);

  const flushOutboundQueue = useCallback((socket: WebSocket | null = socketRef.current) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    while (outboundQueueRef.current.length > 0) {
      const requestId = outboundQueueRef.current[0];
      if (!requestId) {
        outboundQueueRef.current.shift();
        continue;
      }

      const pending = pendingRequestsRef.current.get(requestId);
      if (!pending) {
        outboundQueueRef.current.shift();
        continue;
      }

      try {
        socket.send(pending.encodedRequest);
        pending.queued = false;
        outboundQueueRef.current.shift();
      } catch (error) {
        console.warn('[websocket] failed to flush queued request', error);
        break;
      }
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      return;
    }

    const delayMs = RECONNECT_DELAYS_MS[
      Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS_MS.length - 1)
    ] ?? RECONNECT_DELAYS_MS[0];
    reconnectAttemptRef.current += 1;

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
      reconnectAttemptRef.current = 0;
      useConnectionStore.getState().markConnecting();
      manualReconnectRef.current = false;
      flushOutboundQueue(socket);
    };

    socket.onmessage = (event) => {
      if (socketRef.current !== socket) {
        return;
      }

      const decoded = decodeWsInbound(event.data);
      if (Either.isLeft(decoded)) {
        const message = formatSchemaError(decoded.left);
        console.warn('[websocket] dropped inbound server message', message);
        useToastStore.getState().pushNotification({
          tone: 'error',
          title: 'Could not process server message',
          description: message,
        });
        return;
      }

      const message = decoded.right;
      if (message._tag === 'WsPush') {
        switch (message.channel) {
          case 'server.bootstrap':
            useConnectionStore.getState().applyBootstrap(message.payload);
            useReplStore.getState().clearRawLines();
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
          case 'repl.rawOutput':
            useReplStore.getState().appendRawLine(message.payload.line);
            return;
          case 'repl.cleared':
            useReplStore.getState().clearLines();
            return;
        }
      }

      if (message._tag === 'WebSocketSuccess' || message._tag === 'WebSocketError') {
        finishPending(message);
      }
    };

    socket.onclose = () => {
      if (socketRef.current !== socket) {
        return;
      }

      useConnectionStore.getState().markDisconnected('websocket_closed');

      if (!manualReconnectRef.current) {
        scheduleReconnect();
      }
    };

    socket.onerror = (event) => {
      if (socketRef.current !== socket) {
        return;
      }

      console.warn('[websocket] connection error', event);

      useConnectionStore.getState().setSessionStatus({
        _tag: 'SessionStatus',
        state: 'error',
        reason: 'websocket_error',
      });
    };

    return () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
        if (unmountingRef.current) {
          rejectAllPending('The websocket connection closed before the request completed.');
        }
      }
      socket.close();
    };
  }, [finishPending, flushOutboundQueue, rejectAllPending, scheduleReconnect, socketGeneration]);

  useEffect(() => {
    return () => {
      unmountingRef.current = true;
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
    const request = makeRequest(method, body);
    const encodedRequest = JSON.stringify(request);

    return new Promise<RpcCallResult<RpcResultValue<TMethod>>>((resolve) => {
      const timeout = window.setTimeout(() => {
        const pending = pendingRequestsRef.current.get(request.id);
        if (pending?.queued) {
          outboundQueueRef.current = outboundQueueRef.current.filter((entry) => entry !== request.id);
        }
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
      }, REQUEST_TIMEOUT_MS);

      pendingRequestsRef.current.set(request.id, {
        method,
        body: request.body,
        resolve: resolve as (result: RpcCallResult<any>) => void,
        timeout,
        encodedRequest,
        queued: true,
      });

      outboundQueueRef.current.push(request.id);

      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }

      flushOutboundQueue(socket);
    });
  }, [flushOutboundQueue]);

  return useMemo(() => ({
    desktop: {
      getEnvironment: () => sendRequest('desktop.getEnvironment', { _tag: 'desktop.getEnvironment' }),
      refreshEnvironment: () => sendRequest('desktop.refreshEnvironment', { _tag: 'desktop.refreshEnvironment' }),
      saveSettings: (input) => sendRequest('desktop.saveSettings', { _tag: 'desktop.saveSettings', ...input }),
      resetSettings: () => sendRequest('desktop.resetSettings', { _tag: 'desktop.resetSettings' }),
      bootstrapProject: (input) => sendRequest('desktop.bootstrapProject', { _tag: 'desktop.bootstrapProject', ...input }),
    },
    workflow: {
      addNode: (input) => sendRequest('workflow.addNode', { _tag: 'workflow.addNode', ...input }),
      deleteNode: (input) => sendRequest('workflow.deleteNode', { _tag: 'workflow.deleteNode', ...input }),
      connectNodes: (input) => sendRequest('workflow.connectNodes', { _tag: 'workflow.connectNodes', ...input }),
      renameNode: (input) => sendRequest('workflow.renameNode', { _tag: 'workflow.renameNode', ...input }),
      recordDecision: (input) => sendRequest('workflow.recordDecision', { _tag: 'workflow.recordDecision', ...input }),
      executeAction: (input) => sendRequest('workflow.executeAction', { _tag: 'workflow.executeAction', ...input }),
      useDefaultWorkflow: () => sendRequest('workflow.useDefaultWorkflow', { _tag: 'workflow.useDefaultWorkflow' }),
      useWorkflowPacks: (input) => sendRequest('workflow.useWorkflowPacks', { _tag: 'workflow.useWorkflowPacks', ...input }),
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
      reconnectAttemptRef.current = 0;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      socketRef.current?.close();
      setSocketGeneration((current) => current + 1);
    },
  }), [sendRequest]);
}
