import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const assetsDir = path.join(root, 'assets', 'desktop');
const iconsDir = path.join(assetsDir, 'icons');
const svgPath = path.join(assetsDir, 'icon.svg');
const masterPng = path.join(iconsDir, 'icon-1024.png');
const sizes = [16, 32, 64, 128, 256, 512];

async function run(command: string, args: ReadonlyArray<string>, ignoreFailure = false) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
    });

    child.once('error', (error) => {
      if (ignoreFailure) {
        resolve();
        return;
      }

      reject(new Error(`Failed to start ${command}: ${error.message}`));
    });

    child.once('exit', (code, signal) => {
      if (signal || code !== 0) {
        if (ignoreFailure) {
          resolve();
          return;
        }

        const failure = signal ? `signal ${signal}` : `code ${code}`;
        reject(new Error(`${command} ${args.join(' ')} failed with ${failure}`));
        return;
      }

      resolve();
    });
  });
}

await access(svgPath);
await mkdir(iconsDir, { recursive: true });
await run('rsvg-convert', ['-w', '1024', '-h', '1024', '-o', masterPng, svgPath]);

for (const size of sizes) {
  await run('magick', [masterPng, '-resize', `${size}x${size}`, path.join(iconsDir, `icon-${size}.png`)]);
}

await run('magick', [...sizes.map((size) => path.join(iconsDir, `icon-${size}.png`)), path.join(iconsDir, 'icon.ico')]);
await run('magick', [...sizes.map((size) => path.join(iconsDir, `icon-${size}.png`)), path.join(iconsDir, 'icon.icns')], true);
