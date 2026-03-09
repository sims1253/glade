import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const target = process.env.BAYESGROVE_SERVER_TARGET?.trim() || null;
const slug = target ?? `${process.platform}-${process.arch}`;
const outputDir = path.join(root, 'dist', 'standalone', slug);
const executableName = target?.includes('windows') || (!target && process.platform === 'win32')
  ? 'glade-server.exe'
  : 'glade-server';

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
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

await mkdir(outputDir, { recursive: true });

const compileArgs = [
  'build',
  path.join('apps', 'server', 'src', 'index.ts'),
  '--compile',
  '--outfile',
  path.join('dist', 'standalone', slug, executableName),
];

if (target) {
  compileArgs.push('--target', target);
}

await run('bun', compileArgs);
