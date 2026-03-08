import type {
  BayesgroveCommand,
  GraphSnapshot,
  WorkflowCommand,
} from '@glade/contracts';

import { CommandDispatchError } from '../errors';

type JsonObject = Record<string, unknown>;
type ExecuteActionCommand = Extract<WorkflowCommand, { type: 'ExecuteAction' }>;

function asObject(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asStringArray(value: unknown): Array<string> {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asUnknownArray(value: unknown): Array<unknown> | undefined {
  return Array.isArray(value) ? value : undefined;
}

function requireString(value: unknown, code: string, message: string) {
  const next = asString(value);
  if (!next) {
    throw new CommandDispatchError({ code, message });
  }
  return next;
}

function actionById(snapshot: GraphSnapshot, actionId: string) {
  const protocol = asObject(snapshot.protocol);
  if (!protocol) {
    return null;
  }

  for (const [scopeKey, partitionValue] of Object.entries(protocol)) {
    if (scopeKey === 'summary') {
      continue;
    }

    const partition = asObject(partitionValue);
    const actions = asObject(partition?.actions);
    const action = asObject(actions?.[actionId]);
    if (action) {
      return action;
    }
  }

  return null;
}

function mergePayload(basePayload: unknown, overridePayload: unknown) {
  const base = asObject(basePayload);
  if (overridePayload === undefined) {
    return base;
  }

  const override = asObject(overridePayload);
  if (!override) {
    throw new CommandDispatchError({
      code: 'invalid_action_payload',
      message: 'ExecuteAction payload overrides must be JSON objects.',
    });
  }

  if (!base) {
    return {
      ...override,
    } satisfies JsonObject;
  }

  return {
    ...base,
    ...override,
  } satisfies JsonObject;
}

function buildActionMetadata(actionId: string, templateRef: string | null, payload: JsonObject, metadata: JsonObject | null) {
  const baseMetadata = metadata
    ? {
        ...metadata,
      }
    : {};

  return {
    ...baseMetadata,
    action_id: actionId,
    ...(templateRef ? { template_ref: templateRef } : {}),
    ...(payload.summary_ids ? { summary_ids: payload.summary_ids } : {}),
    ...(payload.node_ids ? { node_ids: payload.node_ids } : {}),
    ...(payload.fit_node_ids ? { fit_node_ids: payload.fit_node_ids } : {}),
    ...(payload.branch_ids ? { branch_ids: payload.branch_ids } : {}),
    ...(payload.candidate_signature ? { candidate_signature: payload.candidate_signature } : {}),
    ...(payload.comparison_signature ? { comparison_signature: payload.comparison_signature } : {}),
    ...(payload.comparison_context ? { comparison_context: payload.comparison_context } : {}),
  } satisfies JsonObject;
}

function toRecordDecisionCommand(id: string, actionId: string, scope: string, payload: JsonObject, metadata: JsonObject | null): BayesgroveCommand {
  const templateRef = asString(payload.template_ref);
  const prompt = asString(payload.prompt) ?? asString(payload.default_prompt);
  const choice = asString(payload.choice) ?? asString(payload.default_choice);
  const rationale = asString(payload.rationale) ?? asString(payload.default_rationale);

  if (!prompt || !choice || !rationale) {
    throw new CommandDispatchError({
      code: 'action_requires_user_input',
      message: 'This record_decision action still needs prompt, choice, or rationale data before it can execute.',
    });
  }

  return {
    protocol_version: '0.1.0',
    message_type: 'Command',
    command_id: id,
    command: 'bg_record_decision',
    args: {
      scope,
      prompt,
      choice,
      alternatives: asStringArray(payload.alternatives),
      rationale,
      refs: asUnknownArray(payload.refs),
      evidence: asStringArray(payload.evidence),
      kind: asString(payload.decision_type) ?? asString(payload.kind) ?? undefined,
      metadata: buildActionMetadata(actionId, templateRef, payload, metadata),
    },
  };
}

function toCreateNodeCommand(id: string, actionId: string, payload: JsonObject, basis: JsonObject, metadata: JsonObject | null): BayesgroveCommand {
  const templateRef = asString(payload.template_ref);
  const kind = (
    asString(payload.node_kind) ??
    (templateRef === 'branch_comparison' ? 'compare' : null) ??
    (templateRef === 'diagnostic_check' ? 'check' : null)
  );
  const inputs = asStringArray(payload.inputs);
  const nodeIds = inputs.length > 0 ? inputs : asStringArray(basis.node_ids);

  return {
    protocol_version: '0.1.0',
    message_type: 'Command',
    command_id: id,
    command: 'bg_add_node',
    args: {
      kind: requireString(kind, 'action_missing_node_kind', 'This action does not specify which node kind to create.'),
      label: asString(payload.default_label) ?? undefined,
      inputs: nodeIds.length > 0 ? nodeIds : undefined,
      metadata: buildActionMetadata(actionId, templateRef, payload, metadata),
    },
  };
}

export function toExecuteActionCommand(
  id: string,
  command: ExecuteActionCommand,
  snapshot: GraphSnapshot | null,
): BayesgroveCommand {
  if (!snapshot) {
    throw new CommandDispatchError({
      code: 'missing_graph_snapshot',
      message: 'ExecuteAction requires a current GraphSnapshot.',
    });
  }

  const action = actionById(snapshot, command.actionId);
  if (!action) {
    throw new CommandDispatchError({
      code: 'unknown_action',
      message: `Action ${command.actionId} was not present in the current GraphSnapshot.`,
    });
  }

  const scope = asString(action.scope) ?? 'project';
  const kind = asString(action.kind) ?? 'action';
  const basis = asObject(action.basis) ?? {};
  const metadata = asObject(action.metadata);
  const payload = mergePayload(action.payload, command.payload) ?? {};

  switch (kind) {
    case 'record_decision':
      return toRecordDecisionCommand(id, command.actionId, scope, payload, metadata);
    case 'create_node_from_template':
      return toCreateNodeCommand(id, command.actionId, payload, basis, metadata);
    case 'submit':
      return {
        protocol_version: '0.1.0',
        message_type: 'Command',
        command_id: id,
        command: 'bg_submit',
        args: {
          targets: asStringArray(payload.targets).length > 0
            ? asStringArray(payload.targets)
            : (asStringArray(basis.node_ids).length > 0 ? asStringArray(basis.node_ids) : undefined),
        },
      };
    case 'cancel':
      return {
        protocol_version: '0.1.0',
        message_type: 'Command',
        command_id: id,
        command: 'bg_cancel',
        args: {
          run_id: requireString(payload.run_id, 'action_missing_run_id', 'This cancel action does not include a run_id.'),
        },
      };
    default:
      throw new CommandDispatchError({
        code: 'unsupported_action_kind',
        message: `Action kind ${kind} is not executable through the current workflow bridge.`,
      });
  }
}
