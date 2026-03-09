import { describe, expect, it } from 'vitest';

import type { GraphSnapshot, JsonObject, WorkflowExecuteActionInput } from '@glade/contracts';

import { CommandDispatchError } from '../errors';
import { toExecuteActionCommand } from './execute-action';

const snapshot: GraphSnapshot = {
  protocol_version: '0.1.0',
  message_type: 'GraphSnapshot',
  emitted_at: '2026-03-08T10:00:00.000Z',
  project_id: 'proj_execute_action',
  project_name: 'execute-action',
  graph: {
    version: 1,
    nodes: {
      fit_1: { id: 'fit_1', kind: 'fit', label: 'Baseline fit' },
    },
    edges: {},
  },
  status: {
    workflow_state: 'blocked',
    runnable_nodes: 0,
    blocked_nodes: 1,
    pending_gates: 0,
    active_jobs: 0,
    health: 'ok',
    messages: ['review required'],
  },
  pending_gates: {},
  branches: {},
  branch_goals: {},
  protocol: {
    summary: {
      n_scopes: 1,
      n_obligations: 0,
      n_actions: 2,
      n_blocking: 0,
      scopes: ['project'],
    },
    project: {
      scope: 'project',
      scope_label: 'Project',
      obligations: {},
      actions: {
        act_decision: {
          action_id: 'act_decision',
          kind: 'record_decision',
          scope: 'project',
          title: 'Record review decision',
          basis: { node_ids: ['fit_1'] },
          payload: {
            template_ref: 'review_decision',
            prompt: 'Record the review outcome',
            choice: 'accept',
            rationale: 'The fit is acceptable.',
            decision_type: 'fit_criticism',
          },
        },
        act_compare: {
          action_id: 'act_compare',
          kind: 'create_node_from_template',
          scope: 'project',
          title: 'Compare branches',
          basis: { node_ids: ['fit_1'] },
          payload: {
            template_ref: 'branch_comparison',
            inputs: ['fit_1'],
            node_kind: 'compare',
            default_label: 'Compare revised fits',
          },
        },
      },
    },
  },
};

function executeAction(actionId: string, payload?: JsonObject) {
  return toExecuteActionCommand(
    'cmd_1',
    { _tag: 'workflow.executeAction', actionId, payload } satisfies WorkflowExecuteActionInput,
    snapshot,
  );
}

describe('toExecuteActionCommand', () => {
  it('maps template-backed node creation actions to bg_add_node', () => {
    const command = executeAction('act_compare');

    expect(command).toMatchObject({
      command_id: 'cmd_1',
      command: 'bg_add_node',
      args: {
        kind: 'compare',
        label: 'Compare revised fits',
        inputs: ['fit_1'],
      },
    });
  });

  it('maps executable record_decision actions to bg_record_decision', () => {
    const command = executeAction('act_decision');

    expect(command).toMatchObject({
      command: 'bg_record_decision',
      args: {
        scope: 'project',
        prompt: 'Record the review outcome',
        choice: 'accept',
        rationale: 'The fit is acceptable.',
        kind: 'fit_criticism',
      },
    });
  });

  it('rejects actions with empty required execution inputs', () => {
    expect(() =>
      executeAction('act_decision', { prompt: '', choice: 'accept', rationale: '' }),
    ).toThrowError(CommandDispatchError);
  });

  it('rejects unknown action ids', () => {
    expect(() => executeAction('nonexistent_action')).toThrowError(CommandDispatchError);
  });
});
