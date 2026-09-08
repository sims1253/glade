import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@glade/shared/process', () => {
  return {
    spawnChildProcess: vi.fn(),
    runBufferedProcess: vi.fn(),
    terminateProcessTree: vi.fn(),
    waitForBufferedProcess: vi.fn(),
    waitForProcessExit: vi.fn(),
    forwardProcessOutput: vi.fn(),
    stripAnsiControlSequences: vi.fn(),
    isProcessRunning: vi.fn(),
    ProcessTimeoutError: class extends Error {
      override readonly name = 'ProcessTimeoutError';
    },
  };
});

import { runDesktopPreflight } from './desktop-environment';

import type { DesktopSettings } from '@glade/contracts';
import { runBufferedProcess } from '@glade/shared/process';

const settings: DesktopSettings = {
  rExecutablePath: 'Rscript',
  editorCommand: 'auto',
  updateChannel: 'stable',
};

function probe(status: number, options: { readonly stderr?: string; readonly stdout?: string } = {}) {
  return {
    stdout: options.stdout ?? '',
    stderr: options.stderr ?? '',
    exitCode: status,
    signal: null,
  };
}

describe('runDesktopPreflight', () => {
  let projectPath = '';

  beforeEach(async () => {
    projectPath = await mkdtemp(path.join(tmpdir(), 'glade-preflight-'));
    vi.mocked(runBufferedProcess).mockReset();
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  it('treats existing valid projects as ready when bg_open succeeds', async () => {
    vi.mocked(runBufferedProcess)
      .mockResolvedValueOnce(probe(0))
      .mockResolvedValueOnce(probe(0))
      .mockResolvedValueOnce(probe(0));

    const result = await runDesktopPreflight(settings, projectPath);

    expect(result.status).toBe('ok');
    expect(result.issues).toEqual([]);
  });

  it('stops before opening a project when Bayesgrove has no IPC server', async () => {
    vi.mocked(runBufferedProcess)
      .mockResolvedValueOnce(probe(0))
      .mockResolvedValueOnce(probe(3));

    const result = await runDesktopPreflight(settings, projectPath);

    expect(result.status).toBe('action_required');
    expect(result.issues[0]?.description).toContain('Bayesgrove removed in 0.6.0');
    expect(runBufferedProcess).toHaveBeenCalledTimes(2);
    expect(vi.mocked(runBufferedProcess).mock.calls[1]?.[0].args?.[1]).toContain('getNamespaceExports');
  });

  it('surfaces project preparation failures with the failing steps', async () => {
    vi.mocked(runBufferedProcess)
      .mockResolvedValueOnce(probe(0))
      .mockResolvedValueOnce(probe(0))
      .mockResolvedValueOnce(probe(11, {
        stderr: 'bg_open failed: existing path is not a bayesgrove project\nbg_init failed: directory is not empty',
      }));

    const result = await runDesktopPreflight(settings, projectPath);

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
