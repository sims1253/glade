import { describe, expect, it } from 'vitest';

import type { GraphSnapshot, WorkflowExecuteActionInput } from '@glade/contracts';

import { toExecuteActionCommand } from './execute-action';

function makeSnapshot(actionId: string, actionKind: string, overrides: Record<string, unknown> = {}): GraphSnapshot {
  return {
    protocol_version: '0.1.0',
    message_type: 'GraphSnapshot',
    emitted_at: new Date().toISOString(),
    project_id: 'test-project',
    project_name: 'Test Project',
    graph: {
      nodes: {},
      edges: {},
    },
    status: {
      workflow_state: 'open',
      runnable_nodes: 0,
      blocked_nodes: 0,
      pending_gates: 0,
      active_jobs: 0,
      health: 'ok',
      messages: [],
    },
    pending_gates: {},
    branches: {},
    branch_goals: {},
    protocol: {
      summary: {
        n_scopes: 1,
        n_obligations: 0,
        n_actions: 1,
        n_blocking: 0,
        scopes: ['project'],
      },
      project: {
        scope: 'project',
        scope_label: 'Project',
        obligations: {},
        actions: {
          [actionId]: {
            action_id: actionId,
            kind: actionKind,
            scope: 'project',
            title: 'Test Action',
            basis: { node_ids: ['node1'] },
            payload: {},
            ...overrides,
          },
        },
      },
    },
  } as GraphSnapshot;
}

describe('toExecuteActionCommand', () => {
  it('throws when snapshot is null', () => {
    const command: WorkflowExecuteActionInput = {
      _tag: 'workflow.executeAction',
      actionId: 'action1',
    };

    expect(() => toExecuteActionCommand('cmd1', command, null)).toThrow('ExecuteAction requires a current GraphSnapshot');
  });

  it('throws when action is not found', () => {
    const snapshot = makeSnapshot('action1', 'submit');
    const command: WorkflowExecuteActionInput = {
      _tag: 'workflow.executeAction',
      actionId: 'nonexistent',
    };

    expect(() => toExecuteActionCommand('cmd1', command, snapshot)).toThrow('Action nonexistent was not present');
  });

  it('creates submit command with targets from payload', () => {
    const snapshot = makeSnapshot('action1', 'submit');
    const command: WorkflowExecuteActionInput = {
      _tag: 'workflow.executeAction',
      actionId: 'action1',
      payload: { targets: ['node1', 'node2'] },
    };

    const result = toExecuteActionCommand('cmd1', command, snapshot);

    expect(result.command).toBe('bg_submit');
    expect(result.args.targets).toEqual(['node1', 'node2']);
  });

  it('creates submit command with targets from basis when payload is empty', () => {
    const snapshot = makeSnapshot('action1', 'submit');
    const command: WorkflowExecuteActionInput = {
      _tag: 'workflow.executeAction',
      actionId: 'action1',
    };

    const result = toExecuteActionCommand('cmd1', command, snapshot);

    expect(result.command).toBe('bg_submit');
    expect(result.args.targets).toEqual(['node1']);
  });

  it('creates cancel command with run_id', () => {
    const snapshot = makeSnapshot('action1', 'cancel');
    const command: WorkflowExecuteActionInput = {
      _tag: 'workflow.executeAction',
      actionId: 'action1',
      payload: { run_id: 'run-123' },
    };

    const result = toExecuteActionCommand('cmd1', command, snapshot);

    expect(result.command).toBe('bg_cancel');
    expect(result.args.run_id).toBe('run-123');
  });

  it('throws for cancel without run_id', () => {
    const snapshot = makeSnapshot('action1', 'cancel');
    const command: WorkflowExecuteActionInput = {
      _tag: 'workflow.executeAction',
      actionId: 'action1',
    };

    expect(() => toExecuteActionCommand('cmd1', command, snapshot)).toThrow('cancel action does not include a run_id');
  });

  it('throws for unsupported action kind', () => {
    const snapshot = makeSnapshot('action1', 'unknown_kind');
    const command: WorkflowExecuteActionInput = {
      _tag: 'workflow.executeAction',
      actionId: 'action1',
    };

    expect(() => toExecuteActionCommand('cmd1', command, snapshot)).toThrow('not executable through the current workflow bridge');
  });

  it('creates record_decision command with required fields', () => {
    const snapshot = makeSnapshot('action1', 'record_decision', {
      payload: {
        prompt: 'Choose an option',
        choice: 'option-a',
        rationale: 'Because it is better',
      },
    });
    const command: WorkflowExecuteActionInput = {
      _tag: 'workflow.executeAction',
      actionId: 'action1',
    };

    const result = toExecuteActionCommand('cmd1', command, snapshot);

    expect(result.command).toBe('bg_record_decision');
    expect(result.args.prompt).toBe('Choose an option');
    expect(result.args.choice).toBe('option-a');
    expect(result.args.rationale).toBe('Because it is better');
  });

  it('throws for record_decision without required fields', () => {
    const snapshot = makeSnapshot('action1', 'record_decision');
    const command: WorkflowExecuteActionInput = {
      _tag: 'workflow.executeAction',
      actionId: 'action1',
    };

    expect(() => toExecuteActionCommand('cmd1', command, snapshot)).toThrow('prompt, choice, or rationale');
  });
});
