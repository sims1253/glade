import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, describe, expect, it } from 'vitest';

import type { GraphSnapshot } from '@glade/contracts';

import { cacheSnapshotExtensionBundles, normalizeGraphSnapshotExtensions } from './extension-registry';

const snapshot: GraphSnapshot = {
  protocol_version: '0.1.0',
  message_type: 'GraphSnapshot',
  emitted_at: '2026-03-08T10:00:00.000Z',
  project_id: 'proj_extensions',
  project_name: 'extension-test',
  graph: {
    version: 1,
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
    messages: ['ready'],
  },
  pending_gates: {},
  branches: {},
  branch_goals: {},
  protocol: {
    summary: {
      n_scopes: 1,
      n_obligations: 0,
      n_actions: 0,
      n_blocking: 0,
      scopes: ['project'],
    },
    project: {
      scope: 'project',
      scope_label: 'Project',
      obligations: {},
      actions: {},
    },
  },
  extension_registry: [],
};

const tempDirs: Array<string> = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(async (dir) => {
    await rm(dir, { recursive: true, force: true });
  }));
});

describe('extension registry snapshot helpers', () => {
  it('normalizes registry aliases onto the snapshot payload', () => {
    const normalized = normalizeGraphSnapshotExtensions({
      ...snapshot,
      extensionRegistry: [
        {
          packageName: 'test.extension',
          version: '0.1.0',
          nodeTypes: [{ kind: 'posterior_summary' }],
        },
      ],
    });

    expect(normalized.extension_registry).toEqual([
      expect.objectContaining({
        id: 'test.extension',
        package_name: 'test.extension',
        version: '0.1.0',
      }),
    ]);
    expect(normalized.extensionRegistry).toEqual(normalized.extension_registry);
  });

  it('copies gui bundles into the state cache and exposes a browser path', async () => {
    const sourceDir = await mkdtemp(path.join(tmpdir(), 'glade-extension-src-'));
    const stateDir = await mkdtemp(path.join(tmpdir(), 'glade-extension-state-'));
    tempDirs.push(sourceDir, stateDir);
    const bundlePath = path.join(sourceDir, 'index.js');
    await writeFile(bundlePath, 'export function register() {}', 'utf8');

    const cached = await cacheSnapshotExtensionBundles({
      ...snapshot,
      extension_registry: [
        {
          id: 'pkg:test.extension',
          package_name: 'test.extension',
          version: '0.1.0',
          gui_bundle_path: bundlePath,
          node_types: [{ kind: 'posterior_summary' }],
          domain_packs: [],
        },
      ],
    }, stateDir);

    const browserBundlePath = cached.extension_registry?.[0]?.browser_bundle_path;
    expect(browserBundlePath).toBeDefined();
    expect(browserBundlePath).toMatch(/^\/extension-bundles\/pkg_test\.extension-0\.1\.0-0-[a-f0-9]{8}\.js$/);

    const copiedPath = path.join(stateDir, 'extensions', path.basename(browserBundlePath!));
    expect(await readFile(copiedPath, 'utf8')).toBe('export function register() {}');
  });

  it('uses unique cached bundle paths when sanitized names collide', async () => {
    const sourceDir = await mkdtemp(path.join(tmpdir(), 'glade-extension-collision-src-'));
    const stateDir = await mkdtemp(path.join(tmpdir(), 'glade-extension-collision-state-'));
    tempDirs.push(sourceDir, stateDir);

    const firstBundlePath = path.join(sourceDir, 'first.js');
    const secondBundlePath = path.join(sourceDir, 'second.js');
    await writeFile(firstBundlePath, 'export const name = "first";', 'utf8');
    await writeFile(secondBundlePath, 'export const name = "second";', 'utf8');

    const cached = await cacheSnapshotExtensionBundles({
      ...snapshot,
      extension_registry: [
        {
          id: 'pkg:test/extension',
          package_name: 'test.extension',
          version: '0.1.0',
          gui_bundle_path: firstBundlePath,
          node_types: [{ kind: 'posterior_summary' }],
          domain_packs: [],
        },
        {
          id: 'pkg:test_extension',
          package_name: 'test_extension',
          version: '0.1.0',
          gui_bundle_path: secondBundlePath,
          node_types: [{ kind: 'posterior_summary_2' }],
          domain_packs: [],
        },
      ],
    }, stateDir);

    const bundlePaths = cached.extension_registry?.map((entry) => entry.browser_bundle_path) ?? [];
    expect(bundlePaths).toHaveLength(2);
    expect(new Set(bundlePaths).size).toBe(2);
  });

  it('reuses an up-to-date cached bundle instead of copying it again', async () => {
    const sourceDir = await mkdtemp(path.join(tmpdir(), 'glade-extension-reuse-src-'));
    const stateDir = await mkdtemp(path.join(tmpdir(), 'glade-extension-reuse-state-'));
    tempDirs.push(sourceDir, stateDir);

    const bundlePath = path.join(sourceDir, 'index.js');
    await writeFile(bundlePath, 'export const reused = true;', 'utf8');

    const inputSnapshot: GraphSnapshot = {
      ...snapshot,
      extension_registry: [
        {
          id: 'pkg:test.extension',
          package_name: 'test.extension',
          version: '0.1.0',
          gui_bundle_path: bundlePath,
          node_types: [{ kind: 'posterior_summary' }],
          domain_packs: [],
        },
      ],
    };

    const firstCached = await cacheSnapshotExtensionBundles(inputSnapshot, stateDir);
    const browserBundlePath = firstCached.extension_registry?.[0]?.browser_bundle_path;
    expect(browserBundlePath).toBeDefined();
    const copiedPath = path.join(stateDir, 'extensions', path.basename(browserBundlePath!));
    const beforeStats = await stat(copiedPath);

    await sleep(20);
    await cacheSnapshotExtensionBundles(inputSnapshot, stateDir);
    const afterStats = await stat(copiedPath);

    expect(afterStats.mtimeMs).toBe(beforeStats.mtimeMs);
  });
});
