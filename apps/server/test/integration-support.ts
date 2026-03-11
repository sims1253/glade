import { spawnSync, type ChildProcess } from 'node:child_process';

import { getAvailablePort as getSharedAvailablePort } from '@glade/shared/Net';
import { terminateProcessTree, waitForHttpReady, type ManagedProcessLike } from '@glade/shared/process';
import WebSocket from 'ws';

export type Message = Record<string, unknown>;

function unpackMessage(message: Message): Message[] {
  if (message._tag !== 'WsPush') {
    return [message];
  }

  const payload = message.payload;
  if (!payload || typeof payload !== 'object') {
    return [message];
  }

  const normalized = [message];
  if (message.channel === 'server.bootstrap') {
    const snapshot = (payload as { snapshot?: unknown }).snapshot;
    if (snapshot && typeof snapshot === 'object') {
      normalized.push(snapshot as Message);
    }
    return normalized;
  }

  if (
    message.channel === 'workflow.snapshot' ||
    message.channel === 'workflow.event' ||
    message.channel === 'repl.output'
  ) {
    normalized.push(payload as Message);
  }

  return normalized;
}

export function ensureBayesgroveIntegrationPrerequisites() {
  const probe = spawnSync(
    'Rscript',
    ['-e', 'quit(status = if (requireNamespace("bayesgrove", quietly = TRUE)) 0 else 2)'],
    { stdio: 'ignore' },
  );

  if (probe.error) {
    if ('code' in probe.error && probe.error.code === 'ENOENT') {
      throw new Error(
        'R-backed integration tests require `Rscript` on PATH. Run `bun run test:integration` only in an environment with R and bayesgrove installed.',
      );
    }

    throw new Error(`Failed to start Rscript for integration preflight: ${probe.error.message}`);
  }

  if (probe.status === 2) {
    throw new Error(
      'R-backed integration tests require the `bayesgrove` R package. Install it before running `bun run test:integration`.',
    );
  }

  if (probe.status !== 0) {
    throw new Error(`R-backed integration preflight failed with exit code ${probe.status}.`);
  }
}

export async function waitFor(url: string, attempts = 160) {
  return await waitForHttpReady(url, { attempts, delayMs: 250 });
}

export async function openTrackedConnection(url: string, expected: (messages: Message[]) => boolean) {
  const messages: Message[] = [];
  const socket = new WebSocket(url);
  return await new Promise<{ socket: WebSocket; messages: Message[] }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out waiting for websocket messages from ${url}`));
    }, 20_000);

    socket.on('message', (payload) => {
      const parsed = JSON.parse(String(payload)) as Message;
      messages.push(...unpackMessage(parsed));
      if (expected(messages)) {
        clearTimeout(timeout);
        resolve({ socket, messages });
      }
    });

    socket.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

export async function waitForMessages(messages: Message[], expected: (messages: Message[]) => boolean, attempts = 200) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (expected(messages)) {
      return messages;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('Timed out waiting for websocket messages.');
}

export async function getAvailablePort() {
  return await getSharedAvailablePort();
}

export async function terminateChildren(children: ReadonlySet<ChildProcess>) {
  await Promise.all(Array.from(children, async (child) => {
    await terminateProcessTree(child as ManagedProcessLike, { gracePeriodMs: 5_000 }).catch(() => undefined);
  }));
}
