import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import type {
  DesktopPreflightIssue,
  DesktopPreflightState,
  DesktopSettings,
} from '@glade/shared';

const PROBE_TIMEOUT_MS = 10_000;

function missingRIssue(rExecutablePath: string): DesktopPreflightIssue {
  return {
    code: 'r_missing',
    title: 'Install R before using Glade',
    description: `Glade could not find an R executable at "${rExecutablePath}". R is required and is not bundled with the app.`,
    href: 'https://cran.r-project.org/',
  };
}

function missingBayesgroveIssue(rExecutablePath: string): DesktopPreflightIssue {
  return {
    code: 'bayesgrove_missing',
    title: 'Install the bayesgrove R package',
    description: 'Glade found R, but the bayesgrove package is not installed yet.',
    command: `${JSON.stringify(rExecutablePath)} -e "install.packages('pak', repos = 'https://cloud.r-project.org'); pak::pkg_install('sims1253/bayesgrove')"`,
  };
}

function projectBootstrapIssue(message: string): DesktopPreflightIssue {
  return {
    code: 'project_bootstrap_failed',
    title: 'Could not prepare the local bayesgrove project',
    description: message,
  };
}

function runProbe(rExecutablePath: string, expression: string) {
  return spawnSync(rExecutablePath, ['-e', expression], {
    stdio: 'ignore',
    env: process.env,
    timeout: PROBE_TIMEOUT_MS,
  });
}

function bootstrapProjectExpression(projectPath: string) {
  return `project_path <- ${JSON.stringify(projectPath)}; if (!file.exists(file.path(project_path, ".glade-initialized"))) { bayesgrove::bg_init(path = project_path); file.create(file.path(project_path, ".glade-initialized")); }`;
}

export function runDesktopPreflight(settings: DesktopSettings, projectPath: string): DesktopPreflightState {
  const issues: DesktopPreflightIssue[] = [];

  const rProbe = spawnSync(settings.rExecutablePath, ['--version'], {
    stdio: 'ignore',
    env: process.env,
    timeout: PROBE_TIMEOUT_MS,
  });

  if (rProbe.error || rProbe.status !== 0 || rProbe.signal) {
    issues.push(missingRIssue(settings.rExecutablePath));
    return {
      checkedAt: new Date().toISOString(),
      projectPath,
      status: 'action_required',
      issues,
    };
  }

  const bayesgroveProbe = runProbe(
    settings.rExecutablePath,
    'quit(status = if (requireNamespace("bayesgrove", quietly = TRUE)) 0 else 2)',
  );

  if (bayesgroveProbe.status === 2) {
    issues.push(missingBayesgroveIssue(settings.rExecutablePath));
    return {
      checkedAt: new Date().toISOString(),
      projectPath,
      status: 'action_required',
      issues,
    };
  }

  if (bayesgroveProbe.error) {
    issues.push(projectBootstrapIssue(`Failed to inspect the R environment: ${bayesgroveProbe.error.message}`));
  } else if (bayesgroveProbe.status !== 0) {
    issues.push(projectBootstrapIssue(`R exited with status ${bayesgroveProbe.status} while checking bayesgrove.`));
  } else {
    mkdirSync(projectPath, { recursive: true });
    const bootstrap = runProbe(settings.rExecutablePath, bootstrapProjectExpression(projectPath));

    if (bootstrap.error) {
      issues.push(projectBootstrapIssue(`Failed to initialize the project directory: ${bootstrap.error.message}`));
    } else if (bootstrap.status !== 0) {
      issues.push(projectBootstrapIssue(`R exited with status ${bootstrap.status} while preparing the project directory.`));
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    projectPath,
    status: issues.length > 0 ? 'action_required' : 'ok',
    issues,
  };
}
