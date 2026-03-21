/**
 * Shared test environment for pipeline E2E tests.
 *
 * Provides a singleton backend server with executors registered.
 * Pipeline tests need executors (data, fit) which GUI tests don't require,
 * so they use their own setup that also registers executors via the REPL
 * after the server starts.
 *
 * The server is started once per worker process and reused across all
 * pipeline test files. Cleanup is called from the last test file's afterAll.
 */

import { createBayesgroveProject, cleanupProject, type BayesgroveProject } from '../fixtures/project-setup';
import { startServer, type ServerHandle } from '../fixtures/server';
import { connectWebSocket, type WebSocketHandle } from '../fixtures/websocket';
import { killProcessesOnPort } from '../fixtures/helpers';

const SERVER_PORT = 3100;

let project: BayesgroveProject | null = null;
let server: ServerHandle | null = null;
let ws: WebSocketHandle | null = null;
let started = false;

/**
 * Send a command to the R REPL and wait for it to complete.
 *
 * Uses the WebSocket repl.write method and waits for a response.
 * Then waits for the R prompt to return (indicated by repl.output).
 */
async function replCommand(wsHandle: WebSocketHandle, command: string): Promise<string[]> {
  // Get the current message count before sending the command
  const messagesBefore = wsHandle.getMessages().length;

  const requestId = wsHandle.send('repl.write', { _tag: 'repl.write', data: command + '\n' });
  const response = await wsHandle.waitForResponse(requestId, 30_000);

  if (response._tag === 'WebSocketError') {
    throw new Error(`REPL command failed: ${JSON.stringify(response)}`);
  }

  // Wait for the R process to finish executing by polling for new repl.output
  // messages. R outputs a ">" prompt after completing a command.
  const startTime = Date.now();
  while (Date.now() - startTime < 15_000) {
    const messages = wsHandle.getMessages();
    const newMessages = messages.slice(messagesBefore);
    const hasNewOutput = newMessages.some(
      (msg) =>
        msg._tag === 'WsPush' &&
        msg.channel === 'repl.output' &&
        String((msg.payload as Record<string, unknown>).line ?? '').includes('>'),
    );
    if (hasNewOutput) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Collect all repl.output messages that arrived after the command was sent
  const messages = wsHandle.getMessages();
  const output: string[] = [];
  for (let i = messagesBefore; i < messages.length; i++) {
    const msg = messages[i]!;
    if (msg._tag === 'WsPush' && (msg.channel === 'repl.output' || msg.channel === 'repl.rawOutput')) {
      const payload = msg.payload as { line?: string; data?: string };
      const text = payload.line ?? payload.data ?? '';
      if (text) {
        output.push(text);
      }
    }
  }
  return output;
}

/**
 * Ensure the shared pipeline test environment is running.
 *
 * On first call:
 * 1. Cleans up any orphaned processes
 * 2. Creates a bayesgrove project (with default workflow)
 * 3. Starts the server
 * 4. Connects via WebSocket
 * 5. Registers data and fit executors via REPL
 */
export async function ensurePipelineEnvironment(): Promise<void> {
  if (started) return;

  // Clean up any orphaned processes from a previous crashed worker
  killProcessesOnPort(SERVER_PORT);

  project = await createBayesgroveProject();
  server = await startServer({
    projectPath: project.projectPath,
    stateDir: project.stateDir,
    serverPort: SERVER_PORT,
    rPort: project.rPort,
  });

  // Connect via WebSocket to register executors
  ws = connectWebSocket(SERVER_PORT);

  // Wait for the server bootstrap message
  await ws.waitForChannel('server.bootstrap', 30_000);

  // Wait for the R session to be fully ready.
  // The R process emits __GLADE_READY__ on stdout when bg_serve starts.
  // We wait for this via repl.rawOutput before sending any commands.
  const startTime = Date.now();
  while (Date.now() - startTime < 30_000) {
    const messages = ws.getMessages();
    const hasReady = messages.some(
      (msg) =>
        msg._tag === 'WsPush' &&
        (msg.channel === 'repl.rawOutput' || msg.channel === 'repl.output') &&
        String((msg.payload as Record<string, unknown>).data ?? (msg.payload as Record<string, unknown>).line ?? '').includes('__GLADE_READY__'),
    );
    if (hasReady) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Extra wait after __GLADE_READY__ for bg_serve to settle
  await new Promise((resolve) => setTimeout(resolve, 5_000));

  // Register data executor — returns hardcoded Eight Schools data
  await replCommand(ws,
    'bayesgrove::bg_register_node_kind(project, "data", executor = function(node, inputs) { list(J=8L, y=c(28,8,-3,7,-1,1,18,12), sigma=c(15,10,16,11,9,11,10,18)) })',
  );

  // Register fit executor — uses cmdstanr to compile and sample.
  // The default workflow's fit kind has an input_contract requiring "data",
  // so fit nodes must be added with a data node as input.
  const stanFilePath = '/home/m0hawk/Documents/glade/e2e/fixtures/models/eight_schools.stan';
  await replCommand(ws,
    `bayesgrove::bg_register_node_kind(project, "fit", executor = function(node, inputs) { stan_file <- "${stanFilePath}"; mod <- cmdstanr::cmdstan_model(stan_file, quiet=TRUE); fit <- mod$sample(data=inputs[[1]], chains=2, parallel_chains=2, iter_warmup=500, iter_sampling=500, seed=42L, refresh=0); diag <- fit$diagnostic_summary(quiet=TRUE); list(divergences=as.integer(diag$divergent_transitions[[1]]), rhat_max=max(diag$rhat, na.rm=TRUE), neff_min=min(diag[["bulk ess"]], na.rm=TRUE)) })`,
  );

  started = true;
}

/**
 * Clean up the shared pipeline test environment.
 *
 * Stops the server, closes the WebSocket, and removes temp directories.
 */
export async function cleanupPipelineEnvironment(): Promise<void> {
  if (!started || !project || !server) return;

  if (ws) {
    await ws.close();
    ws = null;
  }

  await server.stop();
  cleanupProject(project.projectPath, project.stateDir);
  project = null;
  server = null;
  started = false;
}
