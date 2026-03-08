import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Effect from 'effect/Effect';

import { decodeHealthResponse, decodeServerMessage } from '@glade/contracts';

import { websocketUrl } from '../lib/runtime';
import { useAppStore } from '../store/app';

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
    }

    if (healthQuery.isError) {
      setServerConnected(false);
      setSessionState('error');
    }
  }, [healthQuery.data, healthQuery.isError, setServerConnected, setServerVersion, setSessionState]);

  useEffect(() => {
    const socket = new WebSocket(websocketUrl());

    socket.onopen = () => {
      setServerConnected(true);
      setSessionState('ready');
    };

    socket.onmessage = (event) => {
      void Effect.runPromise(
        Effect.gen(function* () {
          const message = yield* decodeServerMessage(JSON.parse(String(event.data)));
          if (message.type === 'SessionStatus') {
            setSessionState(message.state);
            setServerConnected(message.state !== 'error');
          }
        }),
      );
    };

    socket.onclose = () => {
      setServerConnected(false);
    };

    socket.onerror = () => {
      setSessionState('error');
    };

    return () => socket.close();
  }, [setServerConnected, setSessionState]);

  return {
    healthQuery,
    reconnect: () => queryClient.invalidateQueries({ queryKey: healthQueryKey }),
  };
}
