import { describe, expect, it, vi } from 'vitest';

import { assertUnreachable, randomUUID } from './utils';
import { makeRequest } from './rpc';
import type { RpcMethod, RpcRequestBody } from './rpc';

describe('assertUnreachable', () => {
  it('throws with a descriptive message', () => {
    expect(() => assertUnreachable('unexpected' as never)).toThrow('Unhandled case: unexpected');
  });

  it('throws for numbers', () => {
    expect(() => assertUnreachable(42 as never)).toThrow('Unhandled case: 42');
  });
});

describe('makeRequest', () => {
  it('creates a WebSocketRequest with default UUID', () => {
    const request = makeRequest('workflow.addNode', { _tag: 'workflow.addNode', kind: 'test', label: 'Test' });
    expect(request).toMatchObject({
      _tag: 'WebSocketRequest',
      method: 'workflow.addNode',
      body: { _tag: 'workflow.addNode' },
    });
    expect(request.id).toMatch(/^[0-9a-f-]+$/);
  });

  it('creates a WebSocketRequest with a provided ID', () => {
    const request = makeRequest('repl.write', { _tag: 'repl.write', data: 'x <- 1\n' }, 'test-id');
    expect(request).toEqual({
      _tag: 'WebSocketRequest',
      id: 'test-id',
      method: 'repl.write',
      body: { _tag: 'repl.write', data: 'x <- 1\n' },
    });
  });

  it('creates requests for various methods', () => {
    const methods: Array<[RpcMethod, RpcRequestBody<RpcMethod>]> = [
      ['session.restart', { _tag: 'session.restart' }],
      ['desktop.getEnvironment', { _tag: 'desktop.getEnvironment' }],
      ['workflow.useDefaultWorkflow', { _tag: 'workflow.useDefaultWorkflow' }],
      ['repl.clear', { _tag: 'repl.clear' }],
    ];

    for (const [method, body] of methods) {
      const request = makeRequest(method, body, 'fixed-id');
      expect(request._tag).toBe('WebSocketRequest');
      expect(request.method).toBe(method);
      expect(request.id).toBe('fixed-id');
    }
  });
});
