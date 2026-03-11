import { Schema } from 'effect';

import {
  BayesgroveCommand,
  BayesgroveCommandResult,
  DesktopEnvironmentState,
  type DomainPackDescriptor,
  type ExtensionDescriptor,
  ExtensionDescriptor as ExtensionDescriptorSchema,
  ExtensionRegistry,
  GraphSnapshot,
  HealthResponse,
  type NodeTypeDescriptor,
  ProtocolEvent,
} from './messages';
import {
  RpcError,
  ServerBootstrap,
  SessionStatus,
  WebSocketRequest,
  WebSocketResponse,
  WsMessage,
  WsPush,
} from './ws';

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

function asObjectEntries(value: unknown): Array<[string, JsonRecord]> {
  const record = asObject(value);
  return record
    ? Object.entries(record)
      .map(([key, entry]) => {
        const object = asObject(entry);
        return object ? [key, object] as const : null;
      })
      .filter((entry): entry is [string, JsonRecord] => entry !== null)
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

function stableExtensionId(rawExtension: JsonRecord, index: number, fallbackKey?: string) {
  return firstString(
    rawExtension.id,
    rawExtension.extension_id,
    rawExtension.package_name,
    rawExtension.name,
    fallbackKey,
  ) ?? `extension:${index}`;
}

function normalizeNodeTypeDescriptor(value: JsonRecord, fallbackKind?: string): NodeTypeDescriptor | null {
  const kind = firstString(value.kind, value.name, fallbackKind);
  if (!kind) {
    return null;
  }

  const id = firstString(value.id);
  const title = firstString(value.title);
  const description = firstString(value.description);

  return {
    ...value,
    kind,
    ...(id ? { id } : {}),
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
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

function normalizeNodeTypeDescriptorCollectionInput(value: unknown) {
  if (Array.isArray(value)) {
    return asObjectArray(value)
      .map((entry) => normalizeNodeTypeDescriptor(entry))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }

  const entries = asObjectEntries(value);
  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    entries
      .map(([key, entry]) => {
        const normalized = normalizeNodeTypeDescriptor(entry, key);
        return normalized ? [key, normalized] as const : null;
      })
      .filter((entry): entry is readonly [string, NodeTypeDescriptor] => entry !== null),
  );
}

function normalizeDomainPackDescriptorCollectionInput(value: unknown) {
  if (Array.isArray(value)) {
    return asObjectArray(value).map((entry) => normalizeDomainPackDescriptor(entry));
  }

  const entries = asObjectEntries(value);
  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries.map(([key, entry]) => [key, normalizeDomainPackDescriptor(entry)]));
}

function normalizeExtensionDescriptorInput(value: unknown, index: number, fallbackKey?: string): ExtensionDescriptor | null {
  const rawExtension = asObject(value);
  if (!rawExtension) {
    return null;
  }

  const id = stableExtensionId(rawExtension, index, fallbackKey);
  const packageName = firstString(rawExtension.package_name, rawExtension.name, id) ?? id;
  const version = firstString(rawExtension.version);
  const nodeTypes = normalizeNodeTypeDescriptorCollectionInput(rawExtension.node_types);
  const domainPacks = normalizeDomainPackDescriptorCollectionInput(rawExtension.domain_packs);

  return {
    ...rawExtension,
    id,
    package_name: packageName,
    ...(version ? { version } : {}),
    ...(nodeTypes ? { node_types: nodeTypes } : {}),
    ...(domainPacks ? { domain_packs: domainPacks } : {}),
  } satisfies ExtensionDescriptor;
}

function normalizeExtensionRegistryInput(value: unknown) {
  if (Array.isArray(value)) {
    return asObjectArray(value)
      .map((entry, index) => normalizeExtensionDescriptorInput(entry, index))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }

  const entries = asObjectEntries(value);
  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    entries
      .map(([key, entry], index) => {
        const normalized = normalizeExtensionDescriptorInput(entry, index, key);
        return normalized ? [key, normalized] as const : null;
      })
      .filter((entry): entry is readonly [string, ExtensionDescriptor] => entry !== null),
  );
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
  const registry = snapshot.extension_registry;
  if (!registry) {
    return [];
  }

  return Array.isArray(registry) ? registry : Object.values(registry);
}

export function readNodeTypes(extension: Pick<ExtensionDescriptor, 'node_types'>) {
  const nodeTypes = extension.node_types;
  if (!nodeTypes) {
    return [];
  }

  return Array.isArray(nodeTypes) ? nodeTypes : Object.values(nodeTypes);
}

export function readDomainPacks(extension: Pick<ExtensionDescriptor, 'domain_packs'>) {
  const domainPacks = extension.domain_packs;
  if (!domainPacks) {
    return [];
  }

  return Array.isArray(domainPacks) ? domainPacks : Object.values(domainPacks);
}

export const decodeHealthResponse = makeDecoder(HealthResponse);
export const decodeDesktopEnvironmentState = makeDecoder(DesktopEnvironmentState);
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
export const decodeRpcError = makeDecoder(RpcError);
export const decodeServerBootstrap = makeDecoder(ServerBootstrap);
export const decodeWebSocketRequest = makeDecoder(WebSocketRequest);
export const decodeWebSocketResponse = makeDecoder(WebSocketResponse);
export const decodeWsPush = makeDecoder(WsPush);
export const decodeWsMessage = makeDecoder(WsMessage);
