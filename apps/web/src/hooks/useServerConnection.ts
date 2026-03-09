import { useMemo } from 'react';

import { legacyHostDispatchFromRpc, legacyWorkflowDispatchFromRpc } from '../lib/legacy-commands';
import { useRpcClient } from './useRpcClient';

export function useServerConnection() {
  const rpc = useRpcClient();

  return useMemo(() => ({
    dispatchCommand: legacyWorkflowDispatchFromRpc(rpc.workflow, rpc.repl, rpc.session),
    dispatchHostCommand: legacyHostDispatchFromRpc(rpc.host, rpc.system),
    reconnect: rpc.reconnect,
  }), [rpc.host, rpc.repl, rpc.session, rpc.system, rpc.workflow, rpc.reconnect]);
}
