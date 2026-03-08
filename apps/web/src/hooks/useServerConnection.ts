import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Effect from 'effect/Effect';

import { decodeHealthResponse, decodeServerMessage } from '@glade/contracts';

import { websocketUrl } from '../lib/runtime';
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
  const setServerConnected = useAppStore((state) => state.setServerConnected);
  const setServerVersion = useAppStore((state) => state.setServerVersion);
  const setSessionState = useAppStore((state) => state.setSessionState);
  const setSessionReason = useAppStore((state) => state.setSessionReason);
  const applySnapshot = useGraphStore((state) => state.applySnapshot);
  const applyProtocolEvent = useGraphStore((state) => state.applyProtocolEvent);

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

    socket.onopen = () => {
      setServerConnected(true);
      setSessionReason(null);
    };

    socket.onmessage = (event) => {
      void Effect.runPromise(
        Effect.gen(function* () {
          const message = yield* decodeServerMessage(JSON.parse(String(event.data)));
          if (message.type === 'SessionStatus') {
            setSessionState(message.state);
            setSessionReason(message.reason ?? null);
            setServerConnected(message.state !== 'error');
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
      );
    };

    socket.onclose = () => {
      setServerConnected(false);
      setSessionState('error');
      setSessionReason('websocket_closed');
    };

    socket.onerror = () => {
      setSessionState('error');
      setSessionReason('websocket_error');
    };

    return () => socket.close();
  }, [applyProtocolEvent, applySnapshot, setServerConnected, setSessionReason, setSessionState]);

  return {
    healthQuery,
    reconnect: () => queryClient.invalidateQueries({ queryKey: healthQueryKey }),
  };
}
