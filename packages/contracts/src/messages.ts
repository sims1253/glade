import { Schema } from 'effect';

const StringRecord = Schema.Record({ key: Schema.String, value: Schema.Unknown });
const StringArray = Schema.Array(Schema.String);
const OptionalString = Schema.optional(Schema.String);

const StatusMessages = Schema.Union(StringArray, Schema.String);

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
  basis: Schema.Unknown,
  explanation: Schema.optional(Schema.Unknown),
  metadata: Schema.optional(Schema.Unknown),
});
export type ObligationItem = Schema.Schema.Type<typeof ObligationItem>;

export const ActionItem = Schema.Struct({
  action_id: Schema.String,
  kind: Schema.String,
  scope: Schema.String,
  title: Schema.String,
  basis: Schema.Unknown,
  payload: Schema.optional(Schema.Unknown),
  explanation: Schema.optional(Schema.Unknown),
  metadata: Schema.optional(Schema.Unknown),
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
  Schema.extend(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
);
export type PartitionedProtocol = Schema.Schema.Type<typeof PartitionedProtocol>;

export const GraphSnapshot = Schema.Struct({
  protocol_version: Schema.String,
  message_type: Schema.Literal('GraphSnapshot'),
  emitted_at: Schema.String,
  project_id: Schema.String,
  project_name: Schema.String,
  graph: Schema.Unknown,
  status: BayesgroveStatus,
  pending_gates: StringRecord,
  branches: StringRecord,
  branch_goals: StringRecord,
  protocol: PartitionedProtocol,
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
  result: Schema.optional(Schema.Unknown),
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
      params: Schema.optional(Schema.Unknown),
      inputs: Schema.optional(StringArray),
      metadata: Schema.optional(Schema.Unknown),
    }),
  ),
  rawCommandSchema(
    'bg_connect',
    Schema.Struct({
      from: Schema.String,
      to: Schema.String,
      edge_type: Schema.optional(Schema.String),
      metadata: Schema.optional(Schema.Unknown),
    }),
  ),
  rawCommandSchema(
    'bg_update_node',
    Schema.Struct({
      node_id: Schema.String,
      label: Schema.optional(Schema.String),
      params: Schema.optional(Schema.Unknown),
      metadata: Schema.optional(Schema.Unknown),
    }),
  ),
  rawCommandSchema('bg_remove_node', Schema.Struct({ node_id: Schema.String })),
  rawCommandSchema(
    'bg_answer_gate',
    Schema.Struct({
      id: Schema.String,
      choice: Schema.String,
      rationale: Schema.String,
      refs: Schema.optional(Schema.Array(Schema.Unknown)),
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
      refs: Schema.optional(Schema.Array(Schema.Unknown)),
      evidence: Schema.optional(StringArray),
      kind: Schema.optional(Schema.String),
      metadata: Schema.optional(Schema.Unknown),
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

export const SessionStatus = Schema.Struct({
  type: Schema.Literal('SessionStatus'),
  state: Schema.Literal('connecting', 'ready', 'error'),
  reason: Schema.optional(Schema.String),
});
export type SessionStatus = Schema.Schema.Type<typeof SessionStatus>;

export const AddNodeCommand = Schema.Struct({
  type: Schema.Literal('AddNode'),
  kind: Schema.String,
  label: Schema.optional(Schema.String),
  params: Schema.optional(Schema.Unknown),
  inputs: Schema.optional(StringArray),
  metadata: Schema.optional(Schema.Unknown),
});
export const DeleteNodeCommand = Schema.Struct({
  type: Schema.Literal('DeleteNode'),
  nodeId: Schema.String,
});
export const ConnectNodesCommand = Schema.Struct({
  type: Schema.Literal('ConnectNodes'),
  from: Schema.String,
  to: Schema.String,
  edgeType: Schema.optional(Schema.String),
  metadata: Schema.optional(Schema.Unknown),
});
export const RenameNodeCommand = Schema.Struct({
  type: Schema.Literal('RenameNode'),
  nodeId: Schema.String,
  label: Schema.String,
});
export const RecordDecisionCommand = Schema.Struct({
  type: Schema.Literal('RecordDecision'),
  scope: Schema.String,
  prompt: Schema.String,
  choice: Schema.String,
  alternatives: Schema.optional(StringArray),
  rationale: Schema.String,
  refs: Schema.optional(Schema.Array(Schema.Unknown)),
  evidence: Schema.optional(StringArray),
  kind: Schema.optional(Schema.String),
  metadata: Schema.optional(Schema.Unknown),
});
export const ExecuteActionCommand = Schema.Struct({
  type: Schema.Literal('ExecuteAction'),
  actionId: Schema.String,
  payload: Schema.optional(Schema.Unknown),
});
export const UpdateNodeNotesCommand = Schema.Struct({
  type: Schema.Literal('UpdateNodeNotes'),
  nodeId: Schema.String,
  notes: Schema.String,
});
export const SetNodeFileCommand = Schema.Struct({
  type: Schema.Literal('SetNodeFile'),
  nodeId: Schema.String,
  path: Schema.NullOr(Schema.String),
});
export const RestartSessionCommand = Schema.Struct({
  type: Schema.Literal('RestartSession'),
});
export const ReplInputCommand = Schema.Struct({
  type: Schema.Literal('ReplInput'),
  data: Schema.String,
});
export const ClearReplCommand = Schema.Struct({
  type: Schema.Literal('ClearRepl'),
});

export const WorkflowCommand = Schema.Union(
  AddNodeCommand,
  DeleteNodeCommand,
  ConnectNodesCommand,
  RenameNodeCommand,
  RecordDecisionCommand,
  ExecuteActionCommand,
  UpdateNodeNotesCommand,
  SetNodeFileCommand,
  RestartSessionCommand,
  ReplInputCommand,
  ClearReplCommand,
);
export type WorkflowCommand = Schema.Schema.Type<typeof WorkflowCommand>;

export const OpenFileInEditorCommand = Schema.Struct({
  type: Schema.Literal('OpenFileInEditor'),
  path: Schema.String,
});
export const SelectDirectoryCommand = Schema.Struct({
  type: Schema.Literal('SelectDirectory'),
});
export const GetSystemInfoCommand = Schema.Struct({
  type: Schema.Literal('GetSystemInfo'),
});

export const HostCommand = Schema.Union(
  OpenFileInEditorCommand,
  SelectDirectoryCommand,
  GetSystemInfoCommand,
);
export type HostCommand = Schema.Schema.Type<typeof HostCommand>;

export const Command = Schema.Union(WorkflowCommand, HostCommand);
export type Command = Schema.Schema.Type<typeof Command>;

export const CommandEnvelope = Schema.Struct({
  id: Schema.String,
  command: Command,
});
export type CommandEnvelope = Schema.Schema.Type<typeof CommandEnvelope>;

export const CommandResult = Schema.Struct({
  type: Schema.Literal('CommandResult'),
  id: Schema.String,
  success: Schema.Boolean,
  payload: Schema.optional(Schema.Unknown),
  error: Schema.optional(
    Schema.Struct({
      code: Schema.String,
      message: Schema.String,
      data: Schema.optional(Schema.Unknown),
    }),
  ),
});
export type CommandResult = Schema.Schema.Type<typeof CommandResult>;

export const ReplOutput = Schema.Struct({
  type: Schema.Literal('ReplOutput'),
  line: Schema.String,
});
export type ReplOutput = Schema.Schema.Type<typeof ReplOutput>;

export const ServerMessage = Schema.Union(
  SessionStatus,
  CommandResult,
  ReplOutput,
  GraphSnapshot,
  ProtocolEvent,
);
export type ServerMessage = Schema.Schema.Type<typeof ServerMessage>;
