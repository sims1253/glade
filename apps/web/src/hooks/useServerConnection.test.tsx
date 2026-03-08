// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GraphSnapshot } from '@glade/contracts';

import { useAppStore } from '../store/app';
import { useGraphStore } from '../store/graph';
import { useServerConnection } from './useServerConnection';

const snapshot: GraphSnapshot = {
  protocol_version: '0.1.0',
  message_type: 'GraphSnapshot',
  emitted_at: new Date().toISOString(),
  project_id: 'proj_graph',
  project_name: 'graph-test',
  graph: {
    version: 1,
    registry: {
      kinds: {
        source: { name: 'source', input_contract: [], output_type: 'data.frame' },
      },
    },
    nodes: {
      source: { id: 'source', kind: 'source', label: 'Source', status: 'ok', block_reason: 'none' },
    },
    edges: {},
  },
  status: {
    workflow_state: 'open',
    runnable_nodes: 1,
    blocked_nodes: 0,
    pending_gates: 0,
    active_jobs: 0,
    health: 'ok',
    messages: ['ready'],
  },
  pending_gates: {},
  branches: {},
  branch_goals: {},
  protocol: {
    summary: {
      n_scopes: 1,
      n_obligations: 0,
      n_actions: 0,
      n_blocking: 0,
      scopes: ['project'],
    },
  },
};

class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: Array<MockWebSocket> = [];

  readonly sent: Array<string> = [];
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  emitOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  emitMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent<string>);
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  useAppStore.setState({ notifications: [] });
  useGraphStore.getState().clear();
  vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ status: 'ok', version: '0.4.0' }),
  })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useServerConnection', () => {
  it('surfaces command failures as toasts and leaves the graph unchanged', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchInterval: false,
        },
      },
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useServerConnection(), { wrapper });
    const socket = MockWebSocket.instances[0];
    expect(socket).toBeTruthy();

    act(() => {
      socket!.emitOpen();
      socket!.emitMessage(snapshot);
    });

    await waitFor(() => expect(useGraphStore.getState().graph?.nodes[0]?.label).toBe('Source'));
    const beforeLabel = useGraphStore.getState().graph?.nodes[0]?.label;

    const commandPromise = result.current.dispatchCommand({
      type: 'RenameNode',
      nodeId: 'source',
      label: 'Rejected rename',
    });

    const envelope = JSON.parse(socket!.sent.at(-1) ?? '{}') as { id: string };
    act(() => {
      socket!.emitMessage({
        type: 'CommandResult',
        id: envelope.id,
        success: false,
        error: {
          code: 'validation_failed',
          message: 'Rename rejected by bayesgrove.',
        },
      });
    });

    const resultMessage = await commandPromise;
    expect(resultMessage.success).toBe(false);
    expect(useGraphStore.getState().graph?.nodes[0]?.label).toBe(beforeLabel);
    expect(useAppStore.getState().notifications.at(-1)).toMatchObject({
      tone: 'error',
      description: 'Rename rejected by bayesgrove.',
    });
  });
});
