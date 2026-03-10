import type { DesktopEnvironmentState, DesktopPreflightIssue } from '@glade/contracts';

function sessionIssue(reason: string | null): DesktopPreflightIssue | null {
  if (!reason || reason === 'health_check_failed' || reason === 'websocket_closed' || reason === 'websocket_error') {
    return null;
  }

  const description = reason.startsWith('r_process_error:')
    ? `Glade could not start the embedded R session: ${reason.slice('r_process_error:'.length)}`
    : reason.startsWith('r_process_exit:')
      ? `The embedded R session exited unexpectedly: ${reason.slice('r_process_exit:'.length)}`
      : reason === 'project_path_not_configured'
        ? 'The desktop project directory is not configured.'
        : `The bayesgrove session reported: ${reason}`;

  return {
    code: 'session_connection_failed',
    title: 'Could not establish a bg_serve() session',
    description,
  };
}

export function setupDesktopIssues(environment: DesktopEnvironmentState | null, reason: string | null) {
  const issues = [...(environment?.preflight.issues ?? [])];
  const followUp = environment?.preflight.status === 'ok' ? sessionIssue(reason) : null;
  if (followUp) {
    issues.push(followUp);
  }
  return issues;
}

export function trimCommand(command: string | null | undefined) {
  return command?.trim() ? command : null;
}
