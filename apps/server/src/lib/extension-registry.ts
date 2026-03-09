import { createHash } from 'node:crypto';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  normalizeGraphSnapshotExtensions,
  readExtensionRegistry,
  type GraphSnapshot,
} from '@glade/contracts';
import { EXTENSION_BUNDLES_PATH } from '@glade/shared';

type NormalizedExtensionDescriptor = NonNullable<GraphSnapshot['extension_registry']>[number];
const cachedRegistryByKey = new Map<string, ReadonlyArray<NormalizedExtensionDescriptor>>();

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function sanitizeFileSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function withRegistry(snapshot: GraphSnapshot, extensionRegistry: ReadonlyArray<NormalizedExtensionDescriptor>): GraphSnapshot {
  return {
    ...snapshot,
    extension_registry: [...extensionRegistry],
  };
}
export { normalizeGraphSnapshotExtensions };

function extensionRegistryCacheKey(stateDir: string, extensionRegistry: ReadonlyArray<NormalizedExtensionDescriptor>) {
  return `${stateDir}\u0000${JSON.stringify(extensionRegistry)}`;
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
  const registry = readExtensionRegistry(normalized);
  if (registry.length === 0) {
    return normalized;
  }

  const cacheKey = extensionRegistryCacheKey(stateDir, registry);
  const memoizedRegistry = cachedRegistryByKey.get(cacheKey);
  if (memoizedRegistry) {
    return withRegistry(normalized, memoizedRegistry);
  }

  const cacheDir = path.join(stateDir, 'extensions');
  await mkdir(cacheDir, { recursive: true });

  const cachedRegistry = await Promise.all(registry.map(async (extension, index) => {
    const sourcePath = asString(extension.gui_bundle_path) ?? asString(extension.browser_bundle_path);
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

  cachedRegistryByKey.set(cacheKey, cachedRegistry);
  return withRegistry(normalized, cachedRegistry);
}
