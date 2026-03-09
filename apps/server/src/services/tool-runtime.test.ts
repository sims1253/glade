import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { CommandDispatchError } from '../errors';
import { executeToolNode, parseToolOutput } from './tool-runtime';

const stateDirs: Array<string> = [];

afterEach(async () => {
  await Promise.all(stateDirs.splice(0).map(async (stateDir) => {
    await rm(stateDir, { recursive: true, force: true });
  }));
});

async function createStateDir() {
  const stateDir = await mkdtemp(path.join(tmpdir(), 'glade-tool-runtime-'));
  stateDirs.push(stateDir);
  return stateDir;
}

describe('tool-runtime', () => {
  it('executes json_file tools and returns a persisted artifact hash', async () => {
    const stateDir = await createStateDir();
    const result = await executeToolNode({
      nodeId: 'node_json_file',
      runtime: 'binary',
      command: 'node',
      argsTemplate: [
        '-e',
        'const fs=require("node:fs"); const input=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); fs.writeFileSync(process.argv[2], JSON.stringify({answer: input.value + 1}));',
        '{input_json_path}',
        '{output_json_path}',
      ],
      inputSerializer: 'json_file',
      outputParser: 'json_file',
      allowShell: false,
      inputs: { value: 41 },
      stateDir,
      timeoutMs: 5_000,
    });

    expect(result.output).toEqual({ answer: 42 });
    expect(result.artifactPath).toContain(path.join(stateDir, 'artifacts', 'node_json_file'));
    expect(result.artifactHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(readFile(path.join(stateDir, 'logs', 'tool-runtime.log'), 'utf8')).resolves.toContain('start node_json_file');
  });

  it('executes json_stdin tools and parses json_stdout', async () => {
    const stateDir = await createStateDir();
    const result = await executeToolNode({
      nodeId: 'node_json_stdout',
      runtime: 'binary',
      command: 'node',
      argsTemplate: [
        '-e',
        'let data=""; process.stdin.on("data", (chunk) => data += chunk); process.stdin.on("end", () => process.stdout.write(JSON.stringify(JSON.parse(data))));',
      ],
      inputSerializer: 'json_stdin',
      outputParser: 'json_stdout',
      allowShell: false,
      inputs: { shape: 'normal' },
      stateDir,
      timeoutMs: 5_000,
    });

    expect(result.output).toEqual({ shape: 'normal' });
    expect(result.artifactPath).toBeNull();
  });

  it('executes argv serializers by appending alternating name/value pairs', async () => {
    const stateDir = await createStateDir();
    const result = await executeToolNode({
      nodeId: 'node_argv',
      runtime: 'binary',
      command: 'node',
      argsTemplate: [
        '-e',
        'const args=process.argv.slice(1); const output={}; for (let index = 0; index < args.length; index += 2) { output[args[index]] = args[index + 1]; } process.stdout.write(JSON.stringify(output));',
      ],
      inputSerializer: 'argv',
      outputParser: 'json_stdout',
      allowShell: false,
      inputs: { alpha: 1, beta: true },
      stateDir,
      timeoutMs: 5_000,
    });

    expect(result.output).toEqual({
      alpha: '1',
      beta: 'true',
    });
  });

  it('parses lines_stdout output', async () => {
    await expect(parseToolOutput('lines_stdout', 'a\nb\n', null)).resolves.toEqual(['a', 'b']);
  });

  it('surfaces non-zero exit codes as execution errors', async () => {
    const stateDir = await createStateDir();
    await expect(executeToolNode({
      nodeId: 'node_error',
      runtime: 'binary',
      command: 'node',
      argsTemplate: ['-e', 'process.stderr.write("tool failed"); process.exit(2);'],
      inputSerializer: 'json_stdin',
      outputParser: 'json_stdout',
      allowShell: false,
      inputs: {},
      stateDir,
      timeoutMs: 5_000,
    })).rejects.toMatchObject({
      code: 'tool_execution_failed',
      message: 'Command exited with code 2: tool failed',
    } satisfies Partial<CommandDispatchError>);
  });

  it('surfaces clear tool resolution errors', async () => {
    const stateDir = await createStateDir();
    await expect(executeToolNode({
      nodeId: 'node_missing_tool',
      runtime: 'binary',
      command: 'definitely-missing-glade-binary',
      argsTemplate: [],
      inputSerializer: 'json_stdin',
      outputParser: 'json_stdout',
      allowShell: false,
      inputs: {},
      stateDir,
      timeoutMs: 5_000,
    })).rejects.toMatchObject({
      code: 'tool_not_found',
      message: 'Binary `definitely-missing-glade-binary` not found on PATH.',
    } satisfies Partial<CommandDispatchError>);
  });

  it('terminates tools that exceed the timeout budget', async () => {
    const stateDir = await createStateDir();
    await expect(executeToolNode({
      nodeId: 'node_timeout',
      runtime: 'binary',
      command: 'node',
      argsTemplate: ['-e', 'setTimeout(() => {}, 5_000);'],
      inputSerializer: 'json_stdin',
      outputParser: 'json_stdout',
      allowShell: false,
      inputs: {},
      stateDir,
      timeoutMs: 50,
    })).rejects.toMatchObject({
      code: 'tool_execution_timeout',
      message: 'Tool execution timed out after 50ms.',
    } satisfies Partial<CommandDispatchError>);
  });
});
