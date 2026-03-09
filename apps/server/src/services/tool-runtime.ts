import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { JsonObject, JsonValue, NodeInputSerializer, NodeOutputParser, NodeRuntime } from '@glade/contracts';
import { ProcessTimeoutError, runBufferedProcess, type BufferedProcessResult } from '@glade/shared/process';

import { CommandDispatchError } from '../errors';

export interface ToolExecutionRequest {
  readonly nodeId: string;
  readonly runtime: NodeRuntime;
  readonly command: string;
  readonly argsTemplate: ReadonlyArray<string>;
  readonly inputSerializer: NodeInputSerializer;
  readonly outputParser: NodeOutputParser;
  readonly allowShell: boolean;
  readonly inputs: JsonObject;
  readonly stateDir: string;
  readonly timeoutMs: number;
}

export interface ToolExecutionResult {
  readonly status: 'ok';
  readonly runtime: NodeRuntime;
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly stdout: string;
  readonly stderr: string;
  readonly output: JsonValue;
  readonly artifactPath: string | null;
  readonly artifactHash: string | null;
  readonly metrics: JsonObject;
  readonly executedAt: string;
}

export interface ToolRuntimeDependencies {
  readonly runProcess?: (options: {
    readonly command: string;
    readonly args: ReadonlyArray<string>;
    readonly env: NodeJS.ProcessEnv;
    readonly stdin: string | null;
    readonly timeoutMs: number;
  }) => Promise<BufferedProcessResult>;
}

interface PreparedInvocation {
  readonly executable: string;
  readonly args: Array<string>;
  readonly stdin: string | null;
  readonly env: NodeJS.ProcessEnv;
  readonly artifactPath: string | null;
  readonly inputTempDir: string;
}

function serializeArg(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
}

function shellEscape(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function substituteTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{([^}]+)\}/g, (fullMatch, key) => values[key] ?? fullMatch);
}

async function hashFile(targetPath: string) {
  const buffer = await readFile(targetPath);
  return createHash('sha256').update(buffer).digest('hex');
}

function toolResolutionError(runtime: NodeRuntime, command: string) {
  switch (runtime) {
    case 'uvx':
      return new CommandDispatchError({
        code: 'tool_not_found',
        message: 'uvx not found. Install uv: https://docs.astral.sh/uv/',
      });
    case 'bunx':
      return new CommandDispatchError({
        code: 'tool_not_found',
        message: 'bunx not found. Install Bun: https://bun.sh',
      });
    case 'binary':
      return new CommandDispatchError({
        code: 'tool_not_found',
        message: `Binary \`${command}\` not found on PATH.`,
      });
    case 'shell':
      return new CommandDispatchError({
        code: 'tool_not_found',
        message: 'Shell runtime is unavailable.',
      });
    default:
      return new CommandDispatchError({
        code: 'tool_not_found',
        message: `Runtime ${runtime} could not be resolved.`,
      });
  }
}

export async function prepareToolInvocation(request: ToolExecutionRequest): Promise<PreparedInvocation> {
  const inputTempDir = await mkdtemp(path.join(tmpdir(), 'glade-tool-input-'));
  const artifactDir = path.join(request.stateDir, 'artifacts', request.nodeId, randomUUID());
  await mkdir(artifactDir, { recursive: true });

  const placeholders: Record<string, string> = {};
  let stdin: string | null = null;
  let env: NodeJS.ProcessEnv = {
    ...process.env,
  };

  if (request.inputSerializer === 'json_file') {
    const inputPath = path.join(inputTempDir, 'input.json');
    await writeFile(inputPath, JSON.stringify(request.inputs, null, 2), 'utf8');
    placeholders.input_json_path = inputPath;
  }

  if (request.inputSerializer === 'json_stdin') {
    stdin = JSON.stringify(request.inputs);
  }

  if (request.inputSerializer === 'env') {
    env = {
      ...env,
      ...Object.fromEntries(Object.entries(request.inputs).map(([key, value]) => [key, serializeArg(value)])),
    };
  }

  let artifactPath: string | null = null;
  if (request.outputParser === 'json_file') {
    artifactPath = path.join(artifactDir, 'output.json');
    placeholders.output_json_path = artifactPath;
  }

  const templatedArgs = request.argsTemplate.map((entry) => substituteTemplate(entry, placeholders));
  const serializerArgs = request.inputSerializer === 'argv'
    ? Object.entries(request.inputs).flatMap(([key, value]) => [key, serializeArg(value)])
    : [];

  switch (request.runtime) {
    case 'uvx':
      return {
        executable: 'uvx',
        args: [request.command, ...templatedArgs, ...serializerArgs],
        stdin,
        env,
        artifactPath,
        inputTempDir,
      };
    case 'bunx':
      return {
        executable: 'bunx',
        args: [request.command, ...templatedArgs, ...serializerArgs],
        stdin,
        env,
        artifactPath,
        inputTempDir,
      };
    case 'binary':
      return {
        executable: request.command,
        args: [...templatedArgs, ...serializerArgs],
        stdin,
        env,
        artifactPath,
        inputTempDir,
      };
    case 'shell': {
      if (!request.allowShell) {
        throw new CommandDispatchError({
          code: 'shell_runtime_not_allowed',
          message: 'Shell runtime requires allowShell: true in the node descriptor.',
        });
      }

      const shellCommand = [
        request.command,
        ...templatedArgs.map(shellEscape),
        ...serializerArgs.map(shellEscape),
      ].join(' ').trim();
      if (process.platform === 'win32') {
        return {
          executable: 'cmd.exe',
          args: ['/d', '/s', '/c', shellCommand],
          stdin,
          env,
          artifactPath,
          inputTempDir,
        };
      }

      return {
        executable: 'bash',
        args: ['-lc', shellCommand],
        stdin,
        env,
        artifactPath,
        inputTempDir,
      };
    }
    case 'r_session':
      throw new CommandDispatchError({
        code: 'invalid_runtime_execution',
        message: 'r_session nodes must be dispatched through bayesgrove, not the tool runtime.',
      });
  }
}

export async function parseToolOutput(
  parser: NodeOutputParser,
  stdout: string,
  artifactPath: string | null,
): Promise<JsonValue> {
  switch (parser) {
    case 'json_file':
      if (!artifactPath) {
        throw new CommandDispatchError({
          code: 'missing_output_artifact',
          message: 'json_file output parsing requires an output artifact path.',
        });
      }
      return JSON.parse(await readFile(artifactPath, 'utf8')) as JsonValue;
    case 'json_stdout': {
      const trimmed = stdout.trim();
      if (!trimmed) {
        throw new CommandDispatchError({
          code: 'missing_tool_output',
          message: 'The tool did not emit JSON on stdout.',
        });
      }
      return JSON.parse(trimmed) as JsonValue;
    }
    case 'lines_stdout':
      return stdout.split(/\r?\n/u).filter((line) => line.length > 0);
  }
}

export async function executeToolNode(
  request: ToolExecutionRequest,
  dependencies: ToolRuntimeDependencies = {},
): Promise<ToolExecutionResult> {
  if (!request.command.trim()) {
    throw new CommandDispatchError({
      code: 'missing_tool_command',
      message: `Node ${request.nodeId} does not declare a command for runtime ${request.runtime}.`,
    });
  }

  const prepared = await prepareToolInvocation(request);
  const executedAt = new Date().toISOString();
  const startedAt = Date.now();
  console.info(
    `[tool-runtime] ${request.nodeId} ${prepared.executable} ${prepared.args.join(' ')}`.trim(),
  );

  try {
    const runProcess = dependencies.runProcess ?? ((options) =>
      runBufferedProcess({
        command: options.command,
        args: options.args,
        env: options.env,
        stdin: options.stdin,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeoutMs: options.timeoutMs,
      }));
    const outcome = await runProcess({
      command: prepared.executable,
      args: prepared.args,
      env: prepared.env,
      stdin: prepared.stdin,
      timeoutMs: request.timeoutMs,
    }).catch((error) => {
      if (error instanceof ProcessTimeoutError) {
        throw new CommandDispatchError({
          code: 'tool_execution_timeout',
          message: `Tool execution timed out after ${request.timeoutMs}ms.`,
          cause: error,
        });
      }
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        throw toolResolutionError(request.runtime, request.command);
      }
      if (error instanceof CommandDispatchError) {
        throw error;
      }
      throw new CommandDispatchError({
        code: 'tool_execution_failed',
        message: error instanceof Error ? error.message : String(error),
        cause: error,
      });
    });
    if (outcome.exitCode !== 0) {
      throw new CommandDispatchError({
        code: 'tool_execution_failed',
        message: outcome.stderr.trim().length > 0
          ? `Command exited with code ${outcome.exitCode}: ${outcome.stderr.trim()}`
          : `Command exited with code ${outcome.exitCode}.`,
      });
    }

    const output = await parseToolOutput(request.outputParser, outcome.stdout, prepared.artifactPath);
    const artifactHash = prepared.artifactPath ? await hashFile(prepared.artifactPath) : null;

    return {
      status: 'ok',
      runtime: request.runtime,
      command: prepared.executable,
      args: [...prepared.args],
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      output,
      artifactPath: prepared.artifactPath,
      artifactHash,
      metrics: {
        duration_ms: Date.now() - startedAt,
        exit_code: outcome.exitCode,
        stdout_bytes: Buffer.byteLength(outcome.stdout),
        stderr_bytes: Buffer.byteLength(outcome.stderr),
      },
      executedAt,
    };
  } finally {
    await rm(prepared.inputTempDir, { recursive: true, force: true });
  }
}
