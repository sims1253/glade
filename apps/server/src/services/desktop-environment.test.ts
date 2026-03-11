import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { spawnSyncMock } = vi.hoisted(() => ({
  spawnSyncMock: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execFile: vi.fn(),
    spawnSync: spawnSyncMock,
  };
});

import type { DesktopSettings } from '@glade/contracts';

import { runDesktopPreflight } from './desktop-environment';

const settings: DesktopSettings = {
  rExecutablePath: 'Rscript',
  editorCommand: 'auto',
  updateChannel: 'stable',
};

function probe(status: number, options: { readonly stderr?: string; readonly stdout?: string; readonly error?: Error } = {}) {
  return {
    error: options.error,
    output: [null, options.stdout ?? '', options.stderr ?? ''],
    pid: 1,
    signal: null,
    status,
    stderr: options.stderr ?? '',
    stdout: options.stdout ?? '',
  } as ReturnType<typeof spawnSyncMock>;
}

describe('runDesktopPreflight', () => {
  let projectPath = '';

  beforeEach(async () => {
    projectPath = await mkdtemp(path.join(tmpdir(), 'glade-preflight-'));
    spawnSyncMock.mockReset();
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  it('treats existing valid projects as ready when bg_open succeeds', () => {
    spawnSyncMock
      .mockReturnValueOnce(probe(0))
      .mockReturnValueOnce(probe(0))
      .mockReturnValueOnce(probe(0));

    const result = runDesktopPreflight(settings, projectPath);

    expect(result.status).toBe('ok');
    expect(result.issues).toEqual([]);
    expect(String(spawnSyncMock.mock.calls[2]?.[1]?.[1])).toContain('bayesgrove::bg_open');
  });

  it('surfaces project preparation failures with the failing steps', () => {
    spawnSyncMock
      .mockReturnValueOnce(probe(0))
      .mockReturnValueOnce(probe(0))
      .mockReturnValueOnce(probe(11, {
        stderr: 'bg_open failed: existing path is not a bayesgrove project\nbg_init failed: directory is not empty',
      }));

    const result = runDesktopPreflight(settings, projectPath);

    expect(result.status).toBe('action_required');
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'project_bootstrap_failed',
        description: expect.stringContaining('bg_open failed: existing path is not a bayesgrove project'),
      }),
    ]);
    expect(result.issues[0]?.description).toContain('bg_init failed: directory is not empty');
  });
});
