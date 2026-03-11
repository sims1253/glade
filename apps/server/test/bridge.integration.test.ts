import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import {
  ensureBayesgroveIntegrationPrerequisites,
  getAvailablePort,
  openTrackedConnection,
  terminateChildren,
  waitFor,
  type Message,
} from './integration-support';

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
      '; bayesgrove::bg_register_node_kind(project, "source")',
      '; bayesgrove::bg_register_node_kind(project, "fit")',
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

async function collectRawMessagesUntil(
  url: string,
  expected: (messages: Message[]) => boolean,
) {
  const messages: Message[] = [];
  const socket = new WebSocket(url);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out waiting for websocket messages from ${url}`));
    }, 20_000);

    socket.on('message', (payload) => {
      const parsed = JSON.parse(String(payload)) as Message;
      messages.push(parsed);
      if (expected(messages)) {
        clearTimeout(timeout);
        resolve();
      }
    });

    socket.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  return { socket, messages };
}

describe('phase 2 bridge', () => {
  it('bridges a real bayesgrove session and dispatches AddNode', async () => {
    ensureBayesgroveIntegrationPrerequisites();

    const projectPath = await mkdtemp(path.join(tmpdir(), 'glade-phase2-'));
    const stateDir = await mkdtemp(path.join(tmpdir(), 'glade-state-phase2-'));
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

    const firstConnection = await openTrackedConnection(
      `ws://127.0.0.1:${port}/ws`,
      (messages) => messages.some((message) => message.message_type === 'GraphSnapshot'),
    );
    const snapshot = firstConnection.messages.find((message) => message.message_type === 'GraphSnapshot');
    expect(snapshot).toBeTruthy();

    firstConnection.socket.send(
      JSON.stringify({
        _tag: 'WebSocketRequest',
        id: 'frontend.add.1',
        method: 'workflow.addNode',
        body: {
          _tag: 'workflow.addNode',
          kind: 'source',
          label: 'From integration test',
        },
      }),
    );

    const afterCommand = await new Promise<Message[]>((resolve, reject) => {
      const messages = [...firstConnection.messages];
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for command results.')), 20_000);
      firstConnection.socket.on('message', (payload) => {
        const message = JSON.parse(String(payload)) as Message;
        if (message._tag === 'WsPush' && message.channel === 'workflow.snapshot' && message.payload && typeof message.payload === 'object') {
          messages.push(message, message.payload as Message);
        } else if (message._tag === 'WsPush' && message.channel === 'workflow.event' && message.payload && typeof message.payload === 'object') {
          messages.push(message, message.payload as Message);
        } else {
          messages.push(message);
        }
        const hasResult = messages.some(
          (message) => message._tag === 'WebSocketSuccess' && message.id === 'frontend.add.1',
        );
        const hasEvent = messages.some((message) => message.message_type === 'ProtocolEvent');
        if (hasResult && hasEvent) {
          clearTimeout(timeout);
          resolve(messages);
        }
      });
    });

    const result = afterCommand.find(
      (message) => message._tag === 'WebSocketSuccess' && message.id === 'frontend.add.1',
    );
    expect(result).toMatchObject({ _tag: 'WebSocketSuccess', id: 'frontend.add.1', method: 'workflow.addNode' });

    firstConnection.socket.close();

    const secondConnection = await openTrackedConnection(
      `ws://127.0.0.1:${port}/ws`,
      (messages) => messages.some((message) => message.message_type === 'GraphSnapshot'),
    );
    expect(secondConnection.messages.some((message) => message.message_type === 'GraphSnapshot')).toBe(true);
    secondConnection.socket.close();
  }, 30_000);

  it('delivers bootstrap before replayed workflow snapshot to reconnecting clients', async () => {
    ensureBayesgroveIntegrationPrerequisites();

    const projectPath = await mkdtemp(path.join(tmpdir(), 'glade-phase2-order-'));
    const stateDir = await mkdtemp(path.join(tmpdir(), 'glade-state-phase2-order-'));
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

    const firstConnection = await openTrackedConnection(
      `ws://127.0.0.1:${port}/ws`,
      (messages) => messages.some((message) => message.message_type === 'GraphSnapshot'),
    );

    firstConnection.socket.send(
      JSON.stringify({
        _tag: 'WebSocketRequest',
        id: 'frontend.add.order',
        method: 'workflow.addNode',
        body: {
          _tag: 'workflow.addNode',
          kind: 'source',
          label: 'Ordering check node',
        },
      }),
    );

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for updated workflow snapshot.')), 20_000);
      firstConnection.socket.on('message', (payload) => {
        const message = JSON.parse(String(payload)) as Message;
        if (message._tag === 'WebSocketSuccess' && message.id === 'frontend.add.order') {
          return;
        }
        if (message._tag === 'WsPush' && message.channel === 'workflow.snapshot') {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    firstConnection.socket.close();

    const secondConnection = await collectRawMessagesUntil(
      `ws://127.0.0.1:${port}/ws`,
      (messages) => messages.some((message) => message._tag === 'WsPush' && message.channel === 'workflow.snapshot'),
    );

    const workflowSnapshotIndex = secondConnection.messages.findIndex(
      (message) => message._tag === 'WsPush' && message.channel === 'workflow.snapshot',
    );

    expect(secondConnection.messages[0]).toMatchObject({
      _tag: 'WsPush',
      channel: 'server.bootstrap',
    });
    expect(workflowSnapshotIndex).toBeGreaterThan(0);
    expect(
      secondConnection.messages.slice(0, workflowSnapshotIndex).every(
        (message) => !(message._tag === 'WsPush' && message.channel === 'workflow.snapshot'),
      ),
    ).toBe(true);

    secondConnection.socket.close();
  }, 30_000);
});
