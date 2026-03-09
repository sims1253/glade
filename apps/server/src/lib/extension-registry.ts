import { createHash } from 'node:crypto';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

import type { GraphSnapshot } from '@glade/contracts';
import { EXTENSION_BUNDLES_PATH } from '@glade/shared';

type JsonRecord = Record<string, unknown>;
type NormalizedExtensionDescriptor = NonNullable<GraphSnapshot['extension_registry']>[number];
type NormalizedNodeTypeDescriptor = {
  readonly kind: string;
  readonly id?: string;
  readonly runtime?: string;
  readonly title?: string;
  readonly description?: string;
  readonly gui_bundle_path?: string;
  readonly browser_bundle_path?: string;
} & JsonRecord;
type NormalizedDomainPackDescriptor = {
  readonly id?: string;
  readonly kind?: string;
  readonly title?: string;
  readonly description?: string;
} & JsonRecord;

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
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function stableExtensionId(rawExtension: JsonRecord, index: number) {
  return firstString(
    rawExtension.id,
    rawExtension.extension_id,
    rawExtension.package_name,
    rawExtension.packageName,
    rawExtension.name,
  ) ?? `extension:${index}`;
}

function extensionBundleSource(rawExtension: JsonRecord) {
  const explicit = firstString(
    rawExtension.gui_bundle_path,
    rawExtension.guiBundlePath,
  );
  if (explicit) {
    return explicit;
  }

  const libraryPath = firstString(rawExtension.library_path, rawExtension.libraryPath);
  return libraryPath ? path.join(libraryPath, 'inst', 'gui', 'index.js') : null;
}

function sanitizeFileSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function normalizeNodeTypeDescriptor(value: JsonRecord): NormalizedNodeTypeDescriptor | null {
  const kind = firstString(value.kind, value.name);
  if (!kind) {
    return null;
  }

  const id = firstString(value.id);
  const runtime = firstString(value.runtime);
  const title = firstString(value.title);
  const description = firstString(value.description);
  const guiBundlePath = firstString(value.gui_bundle_path, value.guiBundlePath);
  const browserBundlePath = firstString(value.browser_bundle_path, value.browserBundlePath);

  return {
    ...value,
    kind,
    ...(id ? { id } : {}),
    ...(runtime ? { runtime } : {}),
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(guiBundlePath ? { gui_bundle_path: guiBundlePath } : {}),
    ...(browserBundlePath ? { browser_bundle_path: browserBundlePath } : {}),
  } satisfies NormalizedNodeTypeDescriptor;
}

function normalizeDomainPackDescriptor(value: JsonRecord): NormalizedDomainPackDescriptor {
  return {
    ...value,
    ...(firstString(value.id) ? { id: firstString(value.id)! } : {}),
    ...(firstString(value.kind) ? { kind: firstString(value.kind)! } : {}),
    ...(firstString(value.title) ? { title: firstString(value.title)! } : {}),
    ...(firstString(value.description) ? { description: firstString(value.description)! } : {}),
  } satisfies NormalizedDomainPackDescriptor;
}

function normalizeExtensionRegistryValue(value: unknown): Array<NormalizedExtensionDescriptor> {
  const entries = Array.isArray(value) ? asObjectArray(value) : asObjectValues(value);

  return entries.map((rawExtension, index) => {
    const id = stableExtensionId(rawExtension, index);
    const packageName = firstString(rawExtension.package_name, rawExtension.packageName, rawExtension.name, id) ?? id;
    const version = firstString(rawExtension.version);
    const libraryPath = firstString(rawExtension.library_path, rawExtension.libraryPath);
    const guiBundlePath = extensionBundleSource(rawExtension);
    const browserBundlePath = firstString(rawExtension.browser_bundle_path, rawExtension.browserBundlePath);
    return {
      ...rawExtension,
      id,
      package_name: packageName,
      ...(version ? { version } : {}),
      ...(libraryPath ? { library_path: libraryPath } : {}),
      ...(guiBundlePath ? { gui_bundle_path: guiBundlePath } : {}),
      ...(browserBundlePath ? { browser_bundle_path: browserBundlePath } : {}),
      node_types: asObjectArray(rawExtension.node_types ?? rawExtension.nodeTypes)
        .map((entry) => normalizeNodeTypeDescriptor(entry))
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
      domain_packs: asObjectArray(rawExtension.domain_packs ?? rawExtension.domainPacks)
        .map((entry) => normalizeDomainPackDescriptor(entry)),
    } satisfies NormalizedExtensionDescriptor;
  });
}

function extensionRegistrySource(snapshotObject: JsonRecord) {
  const preferred = snapshotObject.extension_registry;
  const preferredObject = asObject(preferred);
  if (Array.isArray(preferred) && preferred.length > 0) {
    return preferred;
  }
  if (preferredObject && Object.keys(preferredObject).length > 0) {
    return preferredObject;
  }

  const fallback = snapshotObject.extensionRegistry;
  const fallbackObject = asObject(fallback);
  if (Array.isArray(fallback) && fallback.length > 0) {
    return fallback;
  }
  if (fallbackObject && Object.keys(fallbackObject).length > 0) {
    return fallbackObject;
  }

  return preferred ?? fallback ?? [];
}

function withRegistry(snapshot: GraphSnapshot, extensionRegistry: ReadonlyArray<NormalizedExtensionDescriptor>): GraphSnapshot {
  return {
    ...snapshot,
    extension_registry: [...extensionRegistry],
    extensionRegistry: [...extensionRegistry],
  };
}

export function normalizeGraphSnapshotExtensions(snapshot: GraphSnapshot): GraphSnapshot {
  const snapshotObject = asObject(snapshot) ?? {};
  const extensionRegistry = normalizeExtensionRegistryValue(extensionRegistrySource(snapshotObject));
  return withRegistry(snapshot, extensionRegistry);
}

async function readPathStats(targetPath: string) {
  try {
    return await stat(targetPath);
  } catch {
    return null;
  }
}

export async function cacheSnapshotExtensionBundles(
  snapshot: GraphSnapshot,
  stateDir: string,
): Promise<GraphSnapshot> {
  const normalized = normalizeGraphSnapshotExtensions(snapshot);
  const registry = normalized.extension_registry ?? [];
  if (registry.length === 0) {
    return normalized;
  }

  const cacheDir = path.join(stateDir, 'extensions');
  await mkdir(cacheDir, { recursive: true });

  const cachedRegistry = await Promise.all(registry.map(async (extension, index) => {
    const sourcePath = firstString(extension.gui_bundle_path, extension.browser_bundle_path);
    if (!sourcePath || sourcePath.startsWith(EXTENSION_BUNDLES_PATH)) {
      return extension;
    }

    const sourceStats = await readPathStats(sourcePath);
    if (!sourceStats?.isFile()) {
      return extension;
    }

    const version = extension.version ? `-${sanitizeFileSegment(extension.version)}` : '';
    const sourceHash = createHash('sha256').update(sourcePath).digest('hex').slice(0, 8);
    const fileName = `${sanitizeFileSegment(extension.id ?? extension.package_name ?? 'extension')}${version}-${index}-${sourceHash}.js`;
    const targetPath = path.join(cacheDir, fileName);
    const targetStats = await readPathStats(targetPath);

    if (
      targetStats?.isFile()
      && targetStats.size === sourceStats.size
      && targetStats.mtimeMs >= sourceStats.mtimeMs
    ) {
      return {
        ...extension,
        browser_bundle_path: `${EXTENSION_BUNDLES_PATH}/${fileName}`,
      } satisfies NormalizedExtensionDescriptor;
    }

    try {
      await copyFile(sourcePath, targetPath);
    } catch (error) {
      console.error(`Failed to cache extension bundle ${sourcePath} -> ${targetPath}`, error);
      return extension;
    }

    return {
      ...extension,
      browser_bundle_path: `${EXTENSION_BUNDLES_PATH}/${fileName}`,
    } satisfies NormalizedExtensionDescriptor;
  }));

  return withRegistry(normalized, cachedRegistry);
}
