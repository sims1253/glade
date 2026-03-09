import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const serverDir = path.join(root, 'apps', 'desktop', 'dist', 'server');
const requestedTargets = (process.env.BAYESGROVE_SERVER_TARGETS?.trim() || process.env.BAYESGROVE_SERVER_TARGET?.trim() || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

interface BuildTarget {
  readonly target: string;
  readonly runtimePlatform: string;
  readonly arch: 'x64' | 'arm64';
  readonly executableName: string;
}

function currentBunTarget() {
  const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `bun-${platform}-${arch}-modern`;
}

function parseTarget(target: string): BuildTarget {
  const normalized = target.replace(/^bun-/, '').replace(/-modern$/, '');
  const [platform, arch] = normalized.split('-');
  if (!platform || !arch || (arch !== 'x64' && arch !== 'arm64')) {
    throw new Error(`Invalid Bun target: ${target}`);
  }

  const runtimePlatform = platform === 'windows' ? 'win32' : platform;
  const extension = runtimePlatform === 'win32' ? '.exe' : '';

  return {
    target,
    runtimePlatform,
    arch,
    executableName: `glade-server-${runtimePlatform}-${arch}${extension}`,
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

const targets = (requestedTargets.length > 0 ? requestedTargets : [currentBunTarget()]).map(parseTarget);

await run(process.execPath, [path.join(root, 'scripts', 'generate-icons.ts')]);
await run('bun', ['run', '--cwd', 'apps/web', 'build']);
await run('bun', ['run', '--cwd', 'apps/desktop', 'build']);
await rm(serverDir, { recursive: true, force: true });
await mkdir(serverDir, { recursive: true });

for (const target of targets) {
  await run('bun', [
    'build',
    path.join('apps', 'server', 'src', 'index.ts'),
    '--compile',
    '--target',
    target.target,
    '--outfile',
    path.join('apps', 'desktop', 'dist', 'server', target.executableName),
  ]);
}
