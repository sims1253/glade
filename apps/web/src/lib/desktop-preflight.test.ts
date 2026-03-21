import { describe, expect, it } from 'vitest';

import { setupDesktopIssues, trimCommand } from './desktop-preflight';
import type { DesktopEnvironmentState } from '@glade/contracts';

const okEnvironment: DesktopEnvironmentState = {
  preflight: { status: 'ok', issues: [] },
  projectPath: '/some/path',
  rBinaryPath: '/usr/bin/R',
  editorCommand: null,
  updateChannel: 'stable',
};

describe('trimCommand', () => {
  it('returns the command for non-empty strings', () => {
    expect(trimCommand('vim')).toBe('vim');
    expect(trimCommand(' vim ')).toBe(' vim ');
  });

  it('returns null for empty, whitespace-only, null, or undefined', () => {
    expect(trimCommand('')).toBeNull();
    expect(trimCommand('   ')).toBeNull();
    expect(trimCommand(null)).toBeNull();
    expect(trimCommand(undefined)).toBeNull();
  });
});

describe('setupDesktopIssues', () => {
  it('returns an empty array when environment is null and reason is null', () => {
    expect(setupDesktopIssues(null, null)).toEqual([]);
  });

  it('returns existing preflight issues', () => {
    const env: DesktopEnvironmentState = {
      ...okEnvironment,
      preflight: {
        status: 'issues',
        issues: [{ code: 'r_not_found', title: 'R not found', description: '' }],
      },
    };
    const issues = setupDesktopIssues(env, null);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('r_not_found');
  });

  it('appends a session issue when preflight is ok and reason is set', () => {
    const issues = setupDesktopIssues(okEnvironment, 'project_path_not_configured');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('session_connection_failed');
    expect(issues[0]?.description).toContain('not configured');
  });

  it('formats r_process_error reasons', () => {
    const issues = setupDesktopIssues(okEnvironment, 'r_process_error:cannot open library');
    expect(issues[0]?.description).toContain('cannot open library');
  });

  it('formats r_process_exit reasons', () => {
    const issues = setupDesktopIssues(okEnvironment, 'r_process_exit:status 1');
    expect(issues[0]?.description).toContain('status 1');
  });

  it('does not append a session issue for benign reasons', () => {
    expect(setupDesktopIssues(okEnvironment, null)).toHaveLength(0);
    expect(setupDesktopIssues(okEnvironment, 'health_check_failed')).toHaveLength(0);
    expect(setupDesktopIssues(okEnvironment, 'websocket_closed')).toHaveLength(0);
  });
});
