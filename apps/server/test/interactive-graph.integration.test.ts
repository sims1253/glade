import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import {
  ensureBayesgroveIntegrationPrerequisites,
  getAvailablePort,
  terminateChildren,
  waitFor,
} from './integration-support';

type Message = Record<string, unknown>;

const cwd = path.resolve(import.meta.dirname, '../../..');
const children = new Set<ChildProcess>();

afterEach(async () => {
  await terminateChildren(children);
  children.clear();
});

async function prepareBayesgroveProject(projectPath: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('Rscript', ['-e', [
      'project <- bayesgrove::bg_init(path = ', JSON.stringify(projectPath), ')',
      '; bayesgrove::bg_register_node_kind(project, "source", output_type = "data.frame")',
      '; bayesgrove::bg_register_node_kind(project, "fit", input_contract = "data.frame", output_type = "fit")',
      '; bayesgrove::bg_register_node_kind(project, "ppc", input_contract = "fit")',
    ].join('')], {
      cwd,
      env: process.env,
      stdio: 'inherit',
    });
    child.once('exit', (code) => {
      if (code && code !== 0) {
        reject(new Error(`R project prep failed with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

async function openTrackedConnection(url: string, expected: (messages: Message[]) => boolean) {
  const messages: Message[] = [];
  const socket = new WebSocket(url);
  return await new Promise<{ socket: WebSocket; messages: Message[] }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out waiting for websocket messages from ${url}`));
    }, 20_000);
    socket.on('message', (payload) => {
      messages.push(JSON.parse(String(payload)) as Message);
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

function graphSnapshot(messages: Message[]) {
  return [...messages].reverse().find((message) => message.message_type === 'GraphSnapshot') as Message | undefined;
}

function snapshotNodeIds(snapshot: Message | undefined) {
  const graph = (snapshot?.graph ?? {}) as Record<string, unknown>;
  const nodes = (graph.nodes ?? {}) as Record<string, unknown>;
  return Object.keys(nodes);
}

function snapshotEdges(snapshot: Message | undefined) {
  const graph = (snapshot?.graph ?? {}) as Record<string, unknown>;
  return (graph.edges ?? {}) as Record<string, unknown>;
}

function snapshotEdgeList(snapshot: Message | undefined) {
  return Object.values(snapshotEdges(snapshot)) as Array<Record<string, unknown>>;
}

function snapshotCount(messages: Message[]) {
  return messages.filter((message) => message.message_type === 'GraphSnapshot').length;
}

async function waitForMessages(messages: Message[], expected: (messages: Message[]) => boolean, attempts = 200) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (expected(messages)) {
      return messages;
    }
    await sleep(100);
  }
  throw new Error('Timed out waiting for websocket messages.');
}

async function sendCommandAndWait(socket: WebSocket, messages: Message[], envelope: Record<string, unknown>) {
  const id = String(envelope.id);
  const priorSnapshotCount = snapshotCount(messages);
  socket.send(JSON.stringify(envelope));
  return await waitForMessages(
    messages,
    (nextMessages) => nextMessages.some(
      (item) => item.type === 'CommandResult' && item.id === id && item.success === true,
    ) && snapshotCount(nextMessages) > priorSnapshotCount,
  );
}

describe('phase 4 interactive graph', () => {
  it('supports add, connect, rename, and delete against a real bayesgrove session', async () => {
    ensureBayesgroveIntegrationPrerequisites();

    const projectPath = await mkdtemp(path.join(tmpdir(), 'glade-phase4-'));
    const stateDir = await mkdtemp(path.join(tmpdir(), 'glade-state-phase4-'));
    await prepareBayesgroveProject(projectPath);

    const port = await getAvailablePort();
    const rPort = await getAvailablePort();
    const child = spawn('bun', ['run', 'apps/server/src/index.ts'], {
      cwd,
      env: {
        ...process.env,
        BAYESGROVE_APP_ROOT: cwd,
        BAYESGROVE_PROJECT_PATH: projectPath,
        BAYESGROVE_STATE_DIR: stateDir,
        BAYESGROVE_SERVER_PORT: String(port),
        BAYESGROVE_R_PORT: String(rPort),
        NODE_ENV: 'production',
      },
      stdio: 'inherit',
    });
    children.add(child);

    await waitFor(`http://127.0.0.1:${port}/health`);

    const connection = await openTrackedConnection(
      `ws://127.0.0.1:${port}/ws`,
      (messages) => messages.some((message) => message.message_type === 'GraphSnapshot'),
    );

    await sendCommandAndWait(connection.socket, connection.messages, {
      id: 'cmd.add.source',
      command: { type: 'AddNode', kind: 'source', label: 'Source data' },
    });
    const sourceSnapshot = graphSnapshot(connection.messages);
    const sourceId = snapshotNodeIds(sourceSnapshot)[0];
    expect(sourceId).toBeTruthy();

    await sendCommandAndWait(connection.socket, connection.messages, {
      id: 'cmd.add.fit',
      command: { type: 'AddNode', kind: 'fit', label: 'Initial fit' },
    });
    const fitSnapshot = graphSnapshot(connection.messages);
    const fitId = snapshotNodeIds(fitSnapshot).find((nodeId) => nodeId !== sourceId);
    expect(fitId).toBeTruthy();

    await sendCommandAndWait(connection.socket, connection.messages, {
      id: 'cmd.connect',
      command: { type: 'ConnectNodes', from: sourceId, to: fitId },
    });
    expect(
      snapshotEdgeList(graphSnapshot(connection.messages)).some(
        (edge) => edge.from === sourceId && edge.to === fitId,
      ),
    ).toBe(true);

    await sendCommandAndWait(connection.socket, connection.messages, {
      id: 'cmd.rename',
      command: { type: 'RenameNode', nodeId: fitId, label: 'Renamed fit' },
    });
    const renamedSnapshot = graphSnapshot(connection.messages);
    const renamedNodes = ((renamedSnapshot?.graph ?? {}) as Record<string, unknown>).nodes as Record<string, { label?: string }>;
    expect(renamedNodes[fitId ?? '']?.label).toBe('Renamed fit');

    await sendCommandAndWait(connection.socket, connection.messages, {
      id: 'cmd.delete',
      command: { type: 'DeleteNode', nodeId: sourceId },
    });
    const deletedSnapshot = graphSnapshot(connection.messages);
    expect(snapshotNodeIds(deletedSnapshot)).not.toContain(sourceId);
    expect(snapshotNodeIds(deletedSnapshot)).toContain(fitId);
    connection.socket.close();
  }, 40_000);
});
