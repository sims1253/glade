import { Schema } from 'effect';

import {
  BayesgroveCommand,
  BayesgroveCommandResult,
  Command,
  CommandEnvelope,
  type DomainPackDescriptor,
  type ExtensionDescriptor,
  ExtensionDescriptor as ExtensionDescriptorSchema,
  ExtensionRegistry,
  GraphSnapshot,
  HealthResponse,
  HostCommand,
  type NodeTypeDescriptor,
  ProtocolEvent,
  ServerMessage,
  SessionStatus,
  WorkflowCommand,
} from './messages';

type JsonRecord = Record<string, unknown>;

const makeDecoder = <TSchema extends Schema.Schema.AnyNoContext>(schema: TSchema) =>
  Schema.decodeUnknown(schema);

function asObject(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asObjectArray(value: unknown): Array<JsonRecord> {
  return Array.isArray(value)
    ? value.map((entry) => asObject(entry)).filter((entry): entry is JsonRecord => entry !== null)
    : [];
}

function asObjectValues(value: unknown): Array<JsonRecord> {
  const record = asObject(value);
  return record
    ? Object.values(record).map((entry) => asObject(entry)).filter((entry): entry is JsonRecord => entry !== null)
    : [];
}

function firstString(...values: Array<unknown>): string | null {
  for (const value of values) {
    const candidate = asString(value);
    if (candidate !== null && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}

function libraryGuiBundlePath(libraryPath: string) {
  const separator = libraryPath.includes('\\') && !libraryPath.includes('/') ? '\\' : '/';
  return `${libraryPath.replace(/[\\/]+$/u, '')}${separator}inst${separator}gui${separator}index.js`;
}

function stableExtensionId(rawExtension: JsonRecord, index: number) {
  return firstString(
    rawExtension.id,
    rawExtension.extension_id,
    rawExtension.package_name,
    rawExtension.name,
  ) ?? `extension:${index}`;
}

function normalizeNodeTypeDescriptor(value: JsonRecord): NodeTypeDescriptor | null {
  const kind = firstString(value.kind, value.name);
  if (!kind) {
    return null;
  }

  const id = firstString(value.id);
  const runtime = firstString(value.runtime);
  const title = firstString(value.title);
  const description = firstString(value.description);
  const guiBundlePath = firstString(value.gui_bundle_path);
  const browserBundlePath = firstString(value.browser_bundle_path);

  return {
    ...value,
    kind,
    ...(id ? { id } : {}),
    ...(runtime ? { runtime } : {}),
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(guiBundlePath ? { gui_bundle_path: guiBundlePath } : {}),
    ...(browserBundlePath ? { browser_bundle_path: browserBundlePath } : {}),
  } satisfies NodeTypeDescriptor;
}

function normalizeDomainPackDescriptor(value: JsonRecord): DomainPackDescriptor {
  const id = firstString(value.id);
  const kind = firstString(value.kind);
  const title = firstString(value.title);
  const description = firstString(value.description);

  return {
    ...value,
    ...(id ? { id } : {}),
    ...(kind ? { kind } : {}),
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
  } satisfies DomainPackDescriptor;
}

function normalizeExtensionDescriptorInput(value: unknown, index: number): ExtensionDescriptor | null {
  const rawExtension = asObject(value);
  if (!rawExtension) {
    return null;
  }

  const id = stableExtensionId(rawExtension, index);
  const packageName = firstString(rawExtension.package_name, rawExtension.name, id) ?? id;
  const version = firstString(rawExtension.version);
  const libraryPath = firstString(rawExtension.library_path);
  const guiBundlePath = firstString(rawExtension.gui_bundle_path) ?? (libraryPath ? libraryGuiBundlePath(libraryPath) : null);
  const browserBundlePath = firstString(rawExtension.browser_bundle_path);

  return {
    ...rawExtension,
    id,
    package_name: packageName,
    ...(version ? { version } : {}),
    ...(libraryPath ? { library_path: libraryPath } : {}),
    ...(guiBundlePath ? { gui_bundle_path: guiBundlePath } : {}),
    ...(browserBundlePath ? { browser_bundle_path: browserBundlePath } : {}),
    node_types: normalizeExtensionDescriptorCollection(rawExtension.node_types)
      .map((entry) => normalizeNodeTypeDescriptor(entry))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    domain_packs: normalizeExtensionDescriptorCollection(rawExtension.domain_packs)
      .map((entry) => normalizeDomainPackDescriptor(entry)),
  } satisfies ExtensionDescriptor;
}

function normalizeExtensionDescriptorCollection(value: unknown) {
  return Array.isArray(value) ? asObjectArray(value) : asObjectValues(value);
}

function normalizeExtensionRegistryInput(value: unknown) {
  const entries = normalizeExtensionDescriptorCollection(value);
  return entries
    .map((entry, index) => normalizeExtensionDescriptorInput(entry, index))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

function normalizeGraphSnapshotInput(value: unknown) {
  const snapshot = asObject(value);
  if (!snapshot || !('extension_registry' in snapshot)) {
    return value;
  }

  return {
    ...snapshot,
    extension_registry: normalizeExtensionRegistryInput(snapshot.extension_registry),
  };
}

export function normalizeGraphSnapshotExtensions(snapshot: GraphSnapshot): GraphSnapshot {
  return Schema.decodeUnknownSync(GraphSnapshot)(normalizeGraphSnapshotInput(snapshot));
}

export function readExtensionRegistry(snapshot: Pick<GraphSnapshot, 'extension_registry'>) {
  return snapshot.extension_registry ?? [];
}

export const decodeHealthResponse = makeDecoder(HealthResponse);
export const decodeSessionStatus = makeDecoder(SessionStatus);
export const decodeExtensionDescriptor = (value: unknown, index = 0) =>
  makeDecoder(ExtensionDescriptorSchema)(normalizeExtensionDescriptorInput(value, index));
export const decodeExtensionRegistry = (value: unknown) =>
  makeDecoder(ExtensionRegistry)(normalizeExtensionRegistryInput(value));
export const decodeGraphSnapshot = (value: unknown) =>
  makeDecoder(GraphSnapshot)(normalizeGraphSnapshotInput(value));
export const decodeProtocolEvent = makeDecoder(ProtocolEvent);
export const decodeBayesgroveCommand = makeDecoder(BayesgroveCommand);
export const decodeBayesgroveCommandResult = makeDecoder(BayesgroveCommandResult);
export const decodeWorkflowCommand = makeDecoder(WorkflowCommand);
export const decodeHostCommand = makeDecoder(HostCommand);
export const decodeCommand = makeDecoder(Command);
export const decodeCommandEnvelope = makeDecoder(CommandEnvelope);
export const decodeServerMessage = makeDecoder(ServerMessage);
