import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

import electronPath from 'electron';

const cwd = path.resolve(import.meta.dirname, '../../..');

async function runCommand(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: 'inherit',
      ...options,
    });

    child.once('exit', (code) => {
      if (code && code !== 0) {
        reject(new Error(`${command} ${args.join(' ')} failed with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

function ensureBayesgroveIntegrationPrerequisites() {
  const probe = spawnSync(
    'Rscript',
    ['-e', 'quit(status = if (requireNamespace("bayesgrove", quietly = TRUE)) 0 else 2)'],
    { stdio: 'ignore' },
  );

  if (probe.error) {
    if ('code' in probe.error && probe.error.code === 'ENOENT') {
      throw new Error('This smoke test requires `Rscript` on PATH.');
    }

    throw new Error(`Failed to probe Rscript: ${probe.error.message}`);
  }

  if (probe.status === 2) {
    throw new Error('This smoke test requires the `bayesgrove` R package.');
  }

  if (probe.status !== 0) {
    throw new Error(`R preflight failed with exit code ${probe.status}.`);
  }
}

async function waitFor(url, attempts = 160) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
    } catch {
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function getAvailablePort() {
  const net = await import('node:net');
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not resolve an ephemeral port.')));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function prepareBayesgroveProject(projectPath) {
  await new Promise((resolve, reject) => {
    const child = spawn('Rscript', ['-e', [
      'project <- bayesgrove::bg_init(path = ', JSON.stringify(projectPath), ')',
      '; bayesgrove::bg_register_node_kind(project, "source", output_type = "data.frame")',
      '; bayesgrove::bg_register_node_kind(project, "fit", input_contract = "data.frame", output_type = "fit")',
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

async function openTrackedConnection(url, expected) {
  const messages = [];
  const socket = new WebSocket(url);
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out waiting for websocket messages from ${url}`));
    }, 20_000);

    socket.addEventListener('message', (event) => {
      messages.push(JSON.parse(String(event.data)));
      if (expected(messages)) {
        clearTimeout(timeout);
        resolve({ socket, messages });
      }
    });

    socket.addEventListener('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function snapshotCount(messages) {
  return messages.filter((message) => message.message_type === 'GraphSnapshot').length;
}

function latestSnapshot(messages) {
  return [...messages].reverse().find((message) => message.message_type === 'GraphSnapshot');
}

function nodeIds(snapshot) {
  return Object.keys(snapshot?.graph?.nodes ?? {});
}

async function waitForMessages(messages, expected, attempts = 200) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (expected(messages)) {
      return messages;
    }
    await sleep(100);
  }
  throw new Error('Timed out waiting for websocket messages.');
}

async function sendCommandAndWait(socket, messages, envelope) {
  const priorSnapshotCount = snapshotCount(messages);
  socket.send(JSON.stringify(envelope));

  await waitForMessages(
    messages,
    (nextMessages) =>
      nextMessages.some(
        (message) => message.type === 'CommandResult' && message.id === envelope.id && message.success === true,
      ) && snapshotCount(nextMessages) > priorSnapshotCount,
  );

  return latestSnapshot(messages);
}

const projectPath = await mkdtemp(path.join(tmpdir(), 'glade-desktop-bayesgrove-project-'));
const stateDir = await mkdtemp(path.join(tmpdir(), 'glade-desktop-bayesgrove-state-'));
const port = await getAvailablePort();
const rPort = await getAvailablePort();
const entry = path.join(cwd, 'apps/desktop/dist-electron/main.cjs');

ensureBayesgroveIntegrationPrerequisites();
await runCommand('bun', ['run', '--cwd', 'apps/web', 'build']);
await runCommand('bun', ['run', '--cwd', 'apps/desktop', 'build']);
await prepareBayesgroveProject(projectPath);

const child = spawn(electronPath, [entry], {
  cwd,
  env: {
    ...process.env,
    BAYESGROVE_APP_ROOT: cwd,
    BAYESGROVE_PROJECT_PATH: projectPath,
    BAYESGROVE_STATE_DIR: stateDir,
    BAYESGROVE_SERVER_PORT: String(port),
    BAYESGROVE_R_PORT: String(rPort),
    BAYESGROVE_SMOKE_TEST: '1',
    BAYESGROVE_SMOKE_SCENARIO: 'bayesgrove-detail-drawer',
    BAYESGROVE_ELECTRON_HEADLESS: '1',
    NODE_ENV: 'production',
  },
  stdio: 'inherit',
});

try {
  await waitFor(`http://127.0.0.1:${port}/health`);

  const connection = await openTrackedConnection(
    `ws://127.0.0.1:${port}/ws`,
    (messages) => messages.some((message) => message.message_type === 'GraphSnapshot'),
  );

  const sourceSnapshot = await sendCommandAndWait(connection.socket, connection.messages, {
    id: 'desktop.add.source',
    command: { type: 'AddNode', kind: 'source', label: 'Source data' },
  });
  const sourceId = nodeIds(sourceSnapshot)[0];
  if (!sourceId) {
    throw new Error('Expected source node id after AddNode.');
  }

  const fitSnapshot = await sendCommandAndWait(connection.socket, connection.messages, {
    id: 'desktop.add.fit',
    command: { type: 'AddNode', kind: 'fit', label: 'Initial fit' },
  });
  const fitId = nodeIds(fitSnapshot).find((nodeId) => nodeId !== sourceId);
  if (!fitId) {
    throw new Error('Expected fit node id after AddNode.');
  }

  await sendCommandAndWait(connection.socket, connection.messages, {
    id: 'desktop.connect',
    command: { type: 'ConnectNodes', from: sourceId, to: fitId },
  });

  connection.socket.close();

  await new Promise((resolve, reject) => {
    if (child.exitCode !== null) {
      if (child.exitCode !== 0) {
        reject(new Error(`Electron exited with code ${child.exitCode}`));
        return;
      }
      resolve(undefined);
      return;
    }

    child.once('exit', (code) => {
      if (code && code !== 0) {
        reject(new Error(`Electron exited with code ${code}`));
        return;
      }
      resolve(undefined);
    });
  });
} finally {
  if (!child.killed) {
    child.kill('SIGTERM');
  }
}
