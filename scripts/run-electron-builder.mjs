import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const binary = path.join(
  root,
  'apps',
  'desktop',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder',
);

await new Promise((resolve, reject) => {
  const child = spawn(binary, process.argv.slice(2), {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  child.once('error', (error) => {
    reject(new Error(`Failed to spawn electron-builder: ${error.message}`));
  });

  child.once('exit', (code, signal) => {
    if (signal) {
      reject(new Error(`electron-builder was terminated by signal ${signal}`));
      return;
    }

    if (code !== 0) {
      reject(new Error(`electron-builder failed with code ${code}`));
      return;
    }
    resolve();
  });
});
