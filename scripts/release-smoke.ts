import { spawn } from 'node:child_process';
import { readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const smokeRoot = path.join(root, 'dist', 'release-smoke');

interface RootPackageJson {
  readonly version: string;
}

function currentPlatform() {
  if (process.platform === 'darwin') {
    return 'mac';
  }

  if (process.platform === 'win32') {
    return 'win';
  }

  return 'linux';
}

function currentTargets() {
  switch (currentPlatform()) {
    case 'linux':
      return {
        builderTargets: 'AppImage',
        artifactExtensions: ['.AppImage'],
      };
    case 'mac':
      return {
        builderTargets: 'dmg',
        artifactExtensions: ['.dmg'],
      };
    case 'win':
      return {
        builderTargets: 'nsis',
        artifactExtensions: ['.exe'],
      };
  }
}

async function run(command: string, args: ReadonlyArray<string>) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
      shell: process.platform === 'win32' && command.endsWith('.cmd'),
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

async function loadVersion() {
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as RootPackageJson;
  return packageJson.version;
}

async function assertDesktopArtifacts(outputDir: string) {
  const entries = await readdir(outputDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  for (const extension of currentTargets().artifactExtensions) {
    if (!files.some((file) => file.endsWith(extension))) {
      throw new Error(`Missing expected release smoke desktop artifact ${extension} in ${outputDir}`);
    }
  }
}

await rm(smokeRoot, { recursive: true, force: true });

const version = await loadVersion();
const desktopOutputDir = path.join(smokeRoot, 'desktop');
const desktopTargets = currentTargets().builderTargets;

await run(process.execPath, [
  path.join(root, 'scripts', 'build-desktop-artifact.ts'),
  '--version',
  version,
  '--targets',
  desktopTargets,
  '--sign',
  'never',
  '--publish',
  'never',
  '--output-dir',
  desktopOutputDir,
]);

await assertDesktopArtifacts(desktopOutputDir);
