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

async function waitForMessages(messages: Message[], expected: (messages: Message[]) => boolean, attempts = 200) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (expected(messages)) {
      return messages;
    }
    await sleep(100);
  }
  throw new Error('Timed out waiting for websocket messages.');
}

describe('phase 7 repl terminal', () => {
  it('round-trips ReplInput through the real R session in desktop mode', async () => {
    ensureBayesgroveIntegrationPrerequisites();

    const projectPath = await mkdtemp(path.join(tmpdir(), 'glade-phase7-repl-'));
    const stateDir = await mkdtemp(path.join(tmpdir(), 'glade-state-phase7-repl-'));
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

    connection.socket.send(JSON.stringify({
      id: 'cmd.repl.desktop',
      command: {
        type: 'ReplInput',
        data: '1 + 1\n',
      },
    }));

    await waitForMessages(
      connection.messages,
      (messages) =>
        messages.some(
          (message) => message.type === 'CommandResult' &&
            message.id === 'cmd.repl.desktop' &&
            message.success === true,
        ) &&
        messages.some(
          (message) => message.type === 'ReplOutput' &&
            typeof message.line === 'string' &&
            message.line.includes('[1] 2'),
        ),
    );

    expect(connection.messages.some(
      (message) => message.type === 'CommandResult' &&
        message.id === 'cmd.repl.desktop' &&
        message.success === true,
    )).toBe(true);
    expect(connection.messages.some(
      (message) => message.type === 'ReplOutput' &&
        typeof message.line === 'string' &&
        message.line.includes('[1] 2'),
    )).toBe(true);

    connection.socket.close();
  }, 40_000);
});
