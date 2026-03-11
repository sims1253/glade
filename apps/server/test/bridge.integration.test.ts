import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

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
});
