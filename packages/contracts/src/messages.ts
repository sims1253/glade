import { Schema } from 'effect';

import { JsonObject, JsonValue } from './json';

const StringRecord = Schema.Record({ key: Schema.String, value: JsonValue });
const StringArray = Schema.Array(Schema.String);
const OptionalString = Schema.optional(Schema.String);

const StatusMessages = Schema.Union(StringArray, Schema.String);

export const NodeRuntime = Schema.Literal('r_session', 'uvx', 'bunx', 'binary', 'shell');
export type NodeRuntime = Schema.Schema.Type<typeof NodeRuntime>;

export const NodeInputSerializer = Schema.Literal('json_file', 'json_stdin', 'argv', 'env');
export type NodeInputSerializer = Schema.Schema.Type<typeof NodeInputSerializer>;

export const NodeOutputParser = Schema.Literal('json_file', 'json_stdout', 'lines_stdout');
export type NodeOutputParser = Schema.Schema.Type<typeof NodeOutputParser>;

export const NodeTypeDescriptor = Schema.Struct({
  id: Schema.optional(Schema.String),
  kind: Schema.String,
  runtime: Schema.optional(NodeRuntime),
  command: Schema.optional(Schema.String),
  args_template: Schema.optional(StringArray),
  input_serializer: Schema.optional(NodeInputSerializer),
  output_parser: Schema.optional(NodeOutputParser),
  allowShell: Schema.optional(Schema.Boolean),
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  input_schema: Schema.optional(JsonValue),
  output_schema: Schema.optional(JsonValue),
  parameter_schema: Schema.optional(JsonValue),
  gui_bundle_path: Schema.optional(Schema.String),
  browser_bundle_path: Schema.optional(Schema.String),
  metadata: Schema.optional(JsonValue),
}).pipe(
  Schema.extend(Schema.Record({ key: Schema.String, value: JsonValue })),
);
export type NodeTypeDescriptor = Schema.Schema.Type<typeof NodeTypeDescriptor>;

export const DomainPackDescriptor = Schema.Struct({
  id: Schema.optional(Schema.String),
  kind: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  metadata: Schema.optional(JsonValue),
}).pipe(
  Schema.extend(Schema.Record({ key: Schema.String, value: JsonValue })),
);
export type DomainPackDescriptor = Schema.Schema.Type<typeof DomainPackDescriptor>;

export const ExtensionDescriptor = Schema.Struct({
  id: Schema.optional(Schema.String),
  package_name: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  library_path: Schema.optional(Schema.String),
  gui_bundle_path: Schema.optional(Schema.String),
  browser_bundle_path: Schema.optional(Schema.String),
  node_types: Schema.optional(Schema.Array(NodeTypeDescriptor)),
  domain_packs: Schema.optional(Schema.Array(DomainPackDescriptor)),
  metadata: Schema.optional(JsonValue),
}).pipe(
  Schema.extend(Schema.Record({ key: Schema.String, value: JsonValue })),
);
export type ExtensionDescriptor = Schema.Schema.Type<typeof ExtensionDescriptor>;

export const ExtensionRegistry = Schema.Array(ExtensionDescriptor);
export type ExtensionRegistry = Schema.Schema.Type<typeof ExtensionRegistry>;

export const HealthResponse = Schema.Struct({
  status: Schema.Literal('ok'),
  version: Schema.String,
});
export type HealthResponse = Schema.Schema.Type<typeof HealthResponse>;

export const BayesgroveStatus = Schema.Struct({
  workflow_state: Schema.String,
  runnable_nodes: Schema.Number,
  blocked_nodes: Schema.Number,
  pending_gates: Schema.Number,
  active_jobs: Schema.Number,
  health: Schema.String,
  messages: StatusMessages,
  last_run_id: Schema.optional(Schema.NullOr(Schema.String)),
});
export type BayesgroveStatus = Schema.Schema.Type<typeof BayesgroveStatus>;

export const ObligationItem = Schema.Struct({
  obligation_id: Schema.String,
  kind: Schema.String,
  scope: Schema.String,
  severity: Schema.String,
  title: Schema.String,
  basis: JsonValue,
  explanation: Schema.optional(JsonValue),
  metadata: Schema.optional(JsonValue),
});
export type ObligationItem = Schema.Schema.Type<typeof ObligationItem>;

export const ActionItem = Schema.Struct({
  action_id: Schema.String,
  kind: Schema.String,
  scope: Schema.String,
  title: Schema.String,
  basis: JsonValue,
  payload: Schema.optional(JsonValue),
  explanation: Schema.optional(JsonValue),
  metadata: Schema.optional(JsonValue),
});
export type ActionItem = Schema.Schema.Type<typeof ActionItem>;

export const ScopePartition = Schema.Struct({
  scope: Schema.String,
  scope_label: Schema.String,
  obligations: Schema.Record({ key: Schema.String, value: ObligationItem }),
  actions: Schema.Record({ key: Schema.String, value: ActionItem }),
});
export type ScopePartition = Schema.Schema.Type<typeof ScopePartition>;

export const PartitionedProtocol = Schema.Struct({
  summary: Schema.Struct({
    n_scopes: Schema.Number,
    n_obligations: Schema.Number,
    n_actions: Schema.Number,
    n_blocking: Schema.Number,
    scopes: StringArray,
  }),
}).pipe(
  Schema.extend(Schema.Record({ key: Schema.String, value: JsonValue })),
);
export type PartitionedProtocol = Schema.Schema.Type<typeof PartitionedProtocol>;

export const GraphSnapshot = Schema.Struct({
  protocol_version: Schema.String,
  message_type: Schema.Literal('GraphSnapshot'),
  emitted_at: Schema.String,
  project_id: Schema.String,
  project_name: Schema.String,
  graph: JsonObject,
  status: BayesgroveStatus,
  pending_gates: StringRecord,
  branches: StringRecord,
  branch_goals: StringRecord,
  protocol: PartitionedProtocol,
  extension_registry: Schema.optional(ExtensionRegistry),
});
export type GraphSnapshot = Schema.Schema.Type<typeof GraphSnapshot>;

export const ProtocolEvent = Schema.Struct({
  protocol_version: Schema.String,
  message_type: Schema.Literal('ProtocolEvent'),
  event_id: Schema.String,
  event_kind: Schema.String,
  command_id: OptionalString,
  source: Schema.String,
  emitted_at: Schema.String,
  status: BayesgroveStatus,
  graph_version: Schema.Number,
});
export type ProtocolEvent = Schema.Schema.Type<typeof ProtocolEvent>;

export const BayesgroveCommandError = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  expected_protocol_version: OptionalString,
}).pipe(Schema.extend(StringRecord));
export type BayesgroveCommandError = Schema.Schema.Type<typeof BayesgroveCommandError>;

export const BayesgroveCommandResult = Schema.Struct({
  protocol_version: Schema.String,
  message_type: Schema.Literal('CommandResult'),
  command_id: Schema.String,
  ok: Schema.Boolean,
  emitted_at: Schema.String,
  result: Schema.optional(JsonValue),
  error: Schema.optional(BayesgroveCommandError),
});
export type BayesgroveCommandResult = Schema.Schema.Type<typeof BayesgroveCommandResult>;

function rawCommandSchema<TName extends string, TArgs extends Schema.Schema.AnyNoContext>(
  command: TName,
  args: TArgs,
) {
  return Schema.Struct({
    protocol_version: Schema.String,
    message_type: Schema.Literal('Command'),
    command_id: Schema.String,
    command: Schema.Literal(command),
    args,
  });
}

export const BayesgroveCommand = Schema.Union(
  rawCommandSchema('bg_snapshot', Schema.Struct({})),
  rawCommandSchema('bg_status', Schema.Struct({})),
  rawCommandSchema(
    'bg_next_actions',
    Schema.Struct({
      scope: Schema.optional(Schema.String),
      branch_id: Schema.optional(Schema.String),
    }),
  ),
  rawCommandSchema('bg_list_branches', Schema.Struct({})),
  rawCommandSchema('bg_branch_lineage', Schema.Struct({ branch_id: Schema.String })),
  rawCommandSchema(
    'bg_add_node',
    Schema.Struct({
      kind: Schema.String,
      label: Schema.optional(Schema.String),
      params: Schema.optional(JsonObject),
      inputs: Schema.optional(StringArray),
      metadata: Schema.optional(JsonObject),
    }),
  ),
  rawCommandSchema(
    'bg_connect',
    Schema.Struct({
      from: Schema.String,
      to: Schema.String,
      edge_type: Schema.optional(Schema.String),
      metadata: Schema.optional(JsonObject),
    }),
  ),
  rawCommandSchema(
    'bg_update_node',
    Schema.Struct({
      node_id: Schema.String,
      label: Schema.optional(Schema.String),
      params: Schema.optional(JsonObject),
      metadata: Schema.optional(JsonObject),
    }),
  ),
  rawCommandSchema('bg_remove_node', Schema.Struct({ node_id: Schema.String })),
  rawCommandSchema(
    'bg_answer_gate',
    Schema.Struct({
      id: Schema.String,
      choice: Schema.String,
      rationale: Schema.String,
      refs: Schema.optional(Schema.Array(JsonValue)),
      evidence: Schema.optional(StringArray),
    }),
  ),
  rawCommandSchema(
    'bg_record_decision',
    Schema.Struct({
      scope: Schema.String,
      prompt: Schema.String,
      choice: Schema.String,
      alternatives: Schema.optional(StringArray),
      rationale: Schema.String,
      refs: Schema.optional(Schema.Array(JsonValue)),
      evidence: Schema.optional(StringArray),
      kind: Schema.optional(Schema.String),
      metadata: Schema.optional(JsonObject),
    }),
  ),
  rawCommandSchema(
    'bg_submit',
    Schema.Struct({
      targets: Schema.optional(StringArray),
    }),
  ),
  rawCommandSchema('bg_cancel', Schema.Struct({ run_id: Schema.String })),
);
export type BayesgroveCommand = Schema.Schema.Type<typeof BayesgroveCommand>;
