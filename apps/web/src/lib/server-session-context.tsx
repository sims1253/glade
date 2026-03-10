import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { RpcClient } from './rpc';
import { createNativeApi } from './runtime';
import { useRpcClient } from '../hooks/useRpcClient';
import { useConnectionStore } from '../store/connection';

interface ServerSessionContextValue {
  readonly rpc: RpcClient;
  readonly nativeApi: ReturnType<typeof createNativeApi>;
  readonly isConnected: boolean;
  readonly sessionState: ReturnType<typeof useConnectionStore.getState>['sessionState'];
  readonly sessionReady: boolean;
  readonly serverVersion: string | null;
}

const ServerSessionContext = createContext<ServerSessionContextValue | null>(null);

export function ServerSessionProvider({ children }: { readonly children: ReactNode }) {
  const rpc = useRpcClient();
  const nativeApi = useMemo(() => createNativeApi(rpc), [rpc]);
  const isConnected = useConnectionStore((state) => state.serverConnected);
  const sessionState = useConnectionStore((state) => state.sessionState);
  const serverVersion = useConnectionStore((state) => state.serverVersion);
  const sessionReady = isConnected && sessionState === 'ready';

  const value = useMemo(
    () => ({
      rpc,
      nativeApi,
      isConnected,
      sessionReady,
      sessionState,
      serverVersion,
    }),
    [isConnected, nativeApi, rpc, serverVersion, sessionReady, sessionState],
  );

  return (
    <ServerSessionContext.Provider value={value}>
      {children}
    </ServerSessionContext.Provider>
  );
}

export function useServerSession(): ServerSessionContextValue {
  const context = useContext(ServerSessionContext);
  if (!context) {
    throw new Error('useServerSession must be used within a ServerSessionProvider');
  }
  return context;
}

export function useRpc(): RpcClient {
  const { rpc } = useServerSession();
  return rpc;
}
