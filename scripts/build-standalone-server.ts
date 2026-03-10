import { spawn } from 'node:child_process';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

interface CliOptions {
  readonly target: string | null;
  readonly version: string | null;
  readonly outputDir: string;
  readonly executableName: string;
}

interface ParsedTarget {
  readonly runtimePlatform: string;
  readonly arch: 'x64' | 'arm64';
}

function parseFlagValue(args: ReadonlyArray<string>, index: number, option: string) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${option}`);
  }

  return value;
}

function parseTarget(target: string | null): ParsedTarget {
  if (!target) {
    return {
      runtimePlatform: process.platform,
      arch: process.arch === 'arm64' ? 'arm64' : 'x64',
    };
  }

  const normalized = target.replace(/^bun-/, '').replace(/-modern$/, '');
  const [platform, arch] = normalized.split('-');
  if (!platform || !arch || (arch !== 'x64' && arch !== 'arm64')) {
    throw new Error(`Invalid Bun target: ${target}`);
  }

  return {
    runtimePlatform: platform === 'windows' ? 'win32' : platform,
    arch,
  };
}

function normalizePlatformSlug(runtimePlatform: string) {
  if (runtimePlatform === 'win32') {
    return 'windows';
  }

  return runtimePlatform;
}

function createExecutableName(target: ParsedTarget, version: string | null) {
  const extension = target.runtimePlatform === 'win32' ? '.exe' : '';
  if (!version) {
    return `glade-server${extension}`;
  }

  const runtimePlatform = normalizePlatformSlug(target.runtimePlatform);
  return `glade-server-${version}-${runtimePlatform}-${target.arch}${extension}`;
}

function parseCliOptions(): CliOptions {
  let target = process.env.BAYESGROVE_SERVER_TARGET?.trim() || null;
  let version: string | null = null;
  let outputDirValue: string | null = null;

  for (let index = 0; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    switch (argument) {
      case '--target':
        target = parseFlagValue(process.argv, index, argument);
        index += 1;
        break;
      case '--version':
        version = parseFlagValue(process.argv, index, argument);
        index += 1;
        break;
      case '--output-dir':
        outputDirValue = parseFlagValue(process.argv, index, argument);
        index += 1;
        break;
      default:
        break;
    }
  }

  const parsedTarget = parseTarget(target);
  const slug = target ?? `${normalizePlatformSlug(parsedTarget.runtimePlatform)}-${parsedTarget.arch}`;

  return {
    target,
    version,
    outputDir: outputDirValue ? path.resolve(root, outputDirValue) : path.join(root, 'dist', 'standalone', slug),
    executableName: createExecutableName(parsedTarget, version),
  };
}

async function run(command: string, args: ReadonlyArray<string>) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
    });

    child.once('error', (error) => {
      reject(new Error(`Failed to start ${command}: ${error.message}`));
    });

    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} ${args.join(' ')} terminated by signal ${signal}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`${command} ${args.join(' ')} failed with code ${code}`));
        return;
      }

      resolve();
    });
  });
}

const { executableName, outputDir, target } = parseCliOptions();

await mkdir(outputDir, { recursive: true });

const compileArgs = [
  'build',
  path.join('apps', 'server', 'src', 'index.ts'),
  '--compile',
  '--outfile',
  path.join(outputDir, executableName),
];

if (target) {
  compileArgs.push('--target', target);
}

await run('bun', compileArgs);

const entries = await readdir(outputDir, { withFileTypes: true });
if (!entries.some((entry) => entry.isFile() && entry.name === executableName)) {
  throw new Error(`Missing expected standalone artifact ${path.join(outputDir, executableName)}`);
}
