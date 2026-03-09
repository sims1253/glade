import type {
  BayesgroveCommand,
  GraphSnapshot,
  NodeInputSerializer,
  NodeOutputParser,
  NodeRuntime,
  NodeTypeDescriptor,
} from '@glade/contracts';
import { readExtensionRegistry } from '@glade/contracts';

import { CommandDispatchError } from '../errors';

type JsonObject = Record<string, unknown>;

interface ExtensionNodeDescriptorMatch {
  readonly extensionId: string | null;
  readonly extensionPackageName: string | null;
  readonly extensionLibraryPath: string | null;
  readonly nodeType: NodeTypeDescriptor | null;
}

export interface ResolvedNodeExecution {
  readonly nodeId: string;
  readonly kind: string;
  readonly label: string;
  readonly runtime: NodeRuntime;
  readonly command: string | null;
  readonly argsTemplate: ReadonlyArray<string>;
  readonly inputSerializer: NodeInputSerializer;
  readonly outputParser: NodeOutputParser;
  readonly allowShell: boolean;
  readonly extensionId: string | null;
  readonly extensionPackageName: string | null;
  readonly extensionLibraryPath: string | null;
  readonly isLocalExtension: boolean;
  readonly inputs: JsonObject;
  readonly metadata: JsonObject | null;
}

export interface ToolExecutionSummary {
  readonly runtime: NodeRuntime;
  readonly status: 'ok' | 'error';
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly stdout: string;
  readonly stderr: string;
  readonly output: unknown;
  readonly artifactPath: string | null;
  readonly artifactHash: string | null;
  readonly metrics: JsonObject;
  readonly executedAt: string;
}

function asObject(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asStringArray(value: unknown): Array<string> {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function firstObject(...values: Array<unknown>): JsonObject | null {
  for (const value of values) {
    const record = asObject(value);
    if (record) {
      return record;
    }
  }

  return null;
}

function firstString(...values: Array<unknown>): string | null {
  for (const value of values) {
    const candidate = asString(value);
    if (candidate && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}

function firstBoolean(...values: Array<unknown>) {
  for (const value of values) {
    const candidate = asBoolean(value);
    if (candidate !== null) {
      return candidate;
    }
  }

  return null;
}

function firstStringArray(...values: Array<unknown>) {
  for (const value of values) {
    const candidate = asStringArray(value);
    if (candidate.length > 0) {
      return candidate;
    }
  }

  return [];
}

function normalizeNodeRuntime(value: unknown): NodeRuntime {
  switch (value) {
    case 'r':
    case 'r_session':
    case null:
    case undefined:
      return 'r_session';
    case 'uvx':
    case 'bunx':
    case 'binary':
    case 'shell':
      return value;
    default:
      throw new CommandDispatchError({
        code: 'unsupported_node_runtime',
        message: `Unsupported node runtime ${String(value)}.`,
      });
  }
}

function normalizeInputSerializer(value: unknown, runtime: NodeRuntime): NodeInputSerializer {
  switch (value) {
    case undefined:
    case null:
      return runtime === 'r_session' ? 'json_file' : 'json_file';
    case 'json_file':
    case 'json_stdin':
    case 'argv':
    case 'env':
      return value;
    default:
      throw new CommandDispatchError({
        code: 'unsupported_input_serializer',
        message: `Unsupported input serializer ${String(value)}.`,
      });
  }
}

function normalizeOutputParser(value: unknown, runtime: NodeRuntime): NodeOutputParser {
  switch (value) {
    case undefined:
    case null:
      return runtime === 'r_session' ? 'json_stdout' : 'json_stdout';
    case 'json_file':
    case 'json_stdout':
    case 'lines_stdout':
      return value;
    default:
      throw new CommandDispatchError({
        code: 'unsupported_output_parser',
        message: `Unsupported output parser ${String(value)}.`,
      });
  }
}

function findNode(snapshot: GraphSnapshot, nodeId: string) {
  const graph = asObject(snapshot.graph);
  const nodes = asObject(graph?.nodes);
  return asObject(nodes?.[nodeId]);
}

function findGraphKind(snapshot: GraphSnapshot, kind: string) {
  const graph = asObject(snapshot.graph);
  const registry = asObject(graph?.registry);
  const kinds = asObject(registry?.kinds);
  return asObject(kinds?.[kind]);
}

function extensionNodeDescriptor(snapshot: GraphSnapshot, kind: string): ExtensionNodeDescriptorMatch {
  for (const extension of readExtensionRegistry(snapshot)) {
    for (const nodeType of extension.node_types ?? []) {
      if (nodeType.kind !== kind) {
        continue;
      }

      return {
        extensionId: firstString(extension.id, extension.package_name),
        extensionPackageName: firstString(extension.package_name, extension.id),
        extensionLibraryPath: firstString(extension.library_path),
        nodeType,
      };
    }
  }

  return {
    extensionId: null,
    extensionPackageName: null,
    extensionLibraryPath: null,
    nodeType: null,
  };
}

function isPathWithin(rootPath: string | null, candidatePath: string | null) {
  if (!rootPath || !candidatePath) {
    return false;
  }

  return candidatePath === rootPath || candidatePath.startsWith(`${rootPath}/`) || candidatePath.startsWith(`${rootPath}\\`);
}

export function isLocalExtensionLibrary(
  extensionLibraryPath: string | null,
  rootDir: string,
  projectPath: string | null,
) {
  if (!extensionLibraryPath) {
    return true;
  }

  return isPathWithin(rootDir, extensionLibraryPath) || isPathWithin(projectPath, extensionLibraryPath);
}

export function resolveNodeExecution(
  snapshot: GraphSnapshot,
  nodeId: string,
  options: {
    readonly rootDir: string;
    readonly projectPath: string | null;
  },
): ResolvedNodeExecution {
  const rawNode = findNode(snapshot, nodeId);
  if (!rawNode) {
    throw new CommandDispatchError({
      code: 'unknown_node',
      message: `Node ${nodeId} was not present in the current GraphSnapshot.`,
    });
  }

  const kind = firstString(rawNode.kind, rawNode.name) ?? 'generic';
  const rawKind = findGraphKind(snapshot, kind);
  const extensionMatch = extensionNodeDescriptor(snapshot, kind);
  const nodeType = extensionMatch.nodeType;
  const runtime = normalizeNodeRuntime(firstString(nodeType?.runtime, rawKind?.runtime));

  return {
    nodeId,
    kind,
    label: firstString(rawNode.label, rawNode.name, kind) ?? kind,
    runtime,
    command: firstString(nodeType?.command, rawKind?.command),
    argsTemplate: firstStringArray(nodeType?.args_template, rawKind?.args_template),
    inputSerializer: normalizeInputSerializer(nodeType?.input_serializer ?? rawKind?.input_serializer, runtime),
    outputParser: normalizeOutputParser(nodeType?.output_parser ?? rawKind?.output_parser, runtime),
    allowShell: firstBoolean(nodeType?.allowShell, nodeType?.allow_shell, rawKind?.allowShell, rawKind?.allow_shell) ?? false,
    extensionId: extensionMatch.extensionId,
    extensionPackageName: extensionMatch.extensionPackageName,
    extensionLibraryPath: extensionMatch.extensionLibraryPath,
    isLocalExtension: isLocalExtensionLibrary(extensionMatch.extensionLibraryPath, options.rootDir, options.projectPath),
    inputs: firstObject(rawNode.params, rawNode.parameters) ?? {},
    metadata: firstObject(rawNode.metadata, rawNode.meta),
  };
}

function cloneSummaryEntries(metadata: JsonObject | null) {
  const existing = metadata?.summaries ?? metadata?.summary_log ?? metadata?.summaryLog;
  return Array.isArray(existing) ? [...existing] : [];
}

export function mergeToolExecutionMetadata(
  metadata: JsonObject | null,
  summary: ToolExecutionSummary,
) {
  const executedSummary = {
    id: `tool_output:${summary.executedAt}`,
    kind: 'tool_output',
    severity: summary.status === 'ok' ? 'info' : 'error',
    recorded_at: summary.executedAt,
    passed: summary.status === 'ok',
    metrics: summary.metrics,
    metadata: {
      runtime: summary.runtime,
      command: summary.command,
      args: [...summary.args],
      stdout: summary.stdout,
      stderr: summary.stderr,
      output: summary.output,
      artifact_path: summary.artifactPath,
      artifact_hash: summary.artifactHash,
      status: summary.status,
    },
  } satisfies JsonObject;

  return {
    ...metadata,
    summaries: [executedSummary, ...cloneSummaryEntries(metadata)],
    tool_execution: {
      runtime: summary.runtime,
      status: summary.status,
      command: summary.command,
      args: [...summary.args],
      stdout: summary.stdout,
      stderr: summary.stderr,
      output: summary.output,
      artifact_path: summary.artifactPath,
      artifact_hash: summary.artifactHash,
      metrics: summary.metrics,
      executed_at: summary.executedAt,
    },
    ...(summary.artifactPath ? { artifact_path: summary.artifactPath } : {}),
    ...(summary.artifactHash ? { artifact_hash: summary.artifactHash } : {}),
  } satisfies JsonObject;
}

export function toSubmitNodeCommand(id: string, nodeId: string): BayesgroveCommand {
  return {
    protocol_version: '0.1.0',
    message_type: 'Command',
    command_id: id,
    command: 'bg_submit',
    args: {
      targets: [nodeId],
    },
  };
}

export function toUpdateNodeMetadataCommand(id: string, nodeId: string, metadata: JsonObject): BayesgroveCommand {
  return {
    protocol_version: '0.1.0',
    message_type: 'Command',
    command_id: id,
    command: 'bg_update_node',
    args: {
      node_id: nodeId,
      metadata,
    },
  };
}
