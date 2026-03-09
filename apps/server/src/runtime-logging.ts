import path from 'node:path';

import { writeRotatingLogLine } from '@glade/shared/logging';

function logsDirectory(stateDir: string) {
  return path.join(stateDir, 'logs');
}

function formatLogLine(scope: string, message: string) {
  return `${new Date().toISOString()} ${scope} ${message}`;
}

function stringifyUnknown(value: unknown): string {
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

async function writeStateLogLine(stateDir: string, fileName: string, scope: string, message: string) {
  await writeRotatingLogLine({
    directory: logsDirectory(stateDir),
    fileName,
    line: formatLogLine(scope, message),
  });
}

export function describeUnknown(value: unknown) {
  return stringifyUnknown(value);
}

export async function writeServerLogLine(stateDir: string, message: string) {
  await writeStateLogLine(stateDir, 'server.log', '[server]', message);
}

export async function writeRDiagnosticsLine(stateDir: string, message: string) {
  await writeStateLogLine(stateDir, 'r-diagnostics.log', '[r-process]', message);
}

export async function writeToolRuntimeLine(stateDir: string, message: string) {
  await writeStateLogLine(stateDir, 'tool-runtime.log', '[tool-runtime]', message);
}
