import { spawn } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const desktopDir = path.join(root, 'apps', 'desktop');
const desktopPackageJsonPath = path.join(desktopDir, 'package.json');
const rootPackageJsonPath = path.join(root, 'package.json');

type DesktopPlatform = 'linux' | 'mac' | 'win';
type DesktopArch = 'x64' | 'arm64';
type PublishMode = 'never' | 'always';
type SignMode = 'auto' | 'never';

interface DesktopPackageJson {
  readonly version: string;
  readonly productName?: string;
  readonly devDependencies?: Record<string, string>;
}

interface RootPackageJson {
  readonly version: string;
}

interface CliOptions {
  readonly platform: DesktopPlatform;
  readonly arch: DesktopArch;
  readonly targets: ReadonlyArray<string>;
  readonly version: string;
  readonly publish: PublishMode;
  readonly sign: SignMode;
  readonly outputDir: string;
  readonly dir: boolean;
}

interface AzureTrustedSigningOptions {
  readonly publisherName: string;
  readonly endpoint: string;
  readonly certificateProfileName: string;
  readonly codeSigningAccountName: string;
}

function currentPlatform(): DesktopPlatform {
  if (process.platform === 'darwin') {
    return 'mac';
  }

  if (process.platform === 'win32') {
    return 'win';
  }

  return 'linux';
}

function currentArch(): DesktopArch {
  return process.arch === 'arm64' ? 'arm64' : 'x64';
}

function defaultTargets(platform: DesktopPlatform) {
  switch (platform) {
    case 'linux':
      return ['AppImage', 'deb'];
    case 'mac':
      return ['dmg'];
    case 'win':
      return ['nsis'];
  }
}

function parseTargets(value: string | undefined, platform: DesktopPlatform) {
  const parsed = value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return parsed && parsed.length > 0 ? parsed : defaultTargets(platform);
}

function parseFlagValue(
  args: ReadonlyArray<string>,
  index: number,
  option: string,
) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${option}`);
  }

  return value;
}

async function loadPackageJson<T>(filePath: string) {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

function parsePlatform(value: string | undefined): DesktopPlatform {
  if (!value) {
    return currentPlatform();
  }

  if (value === 'linux' || value === 'mac' || value === 'win') {
    return value;
  }

  throw new Error(`Unsupported desktop platform: ${value}`);
}

function parseArch(value: string | undefined): DesktopArch {
  if (!value) {
    return currentArch();
  }

  if (value === 'x64' || value === 'arm64') {
    return value;
  }

  throw new Error(`Unsupported desktop architecture: ${value}`);
}

function parsePublishMode(value: string | undefined): PublishMode {
  if (!value) {
    return 'never';
  }

  if (value === 'never' || value === 'always') {
    return value;
  }

  throw new Error(`Unsupported publish mode: ${value}`);
}

function parseSignMode(value: string | undefined): SignMode {
  if (!value) {
    return 'auto';
  }

  if (value === 'auto' || value === 'never') {
    return value;
  }

  throw new Error(`Unsupported sign mode: ${value}`);
}

async function parseCliOptions() {
  const rootPackage = await loadPackageJson<RootPackageJson>(rootPackageJsonPath);
  let platformValue: string | undefined;
  let archValue: string | undefined;
  let targetsValue: string | undefined;
  let version = rootPackage.version;
  let publishValue: string | undefined;
  let signValue: string | undefined;
  let outputDirValue: string | undefined;
  let dir = false;

  for (let index = 0; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    switch (argument) {
      case '--platform':
        platformValue = parseFlagValue(process.argv, index, argument);
        index += 1;
        break;
      case '--arch':
        archValue = parseFlagValue(process.argv, index, argument);
        index += 1;
        break;
      case '--targets':
        targetsValue = parseFlagValue(process.argv, index, argument);
        index += 1;
        break;
      case '--version':
        version = parseFlagValue(process.argv, index, argument);
        index += 1;
        break;
      case '--publish':
        publishValue = parseFlagValue(process.argv, index, argument);
        index += 1;
        break;
      case '--sign':
        signValue = parseFlagValue(process.argv, index, argument);
        index += 1;
        break;
      case '--output-dir':
        outputDirValue = parseFlagValue(process.argv, index, argument);
        index += 1;
        break;
      case '--dir':
        dir = true;
        break;
      default:
        break;
    }
  }

  const platform = parsePlatform(platformValue);
  const arch = parseArch(archValue);
  const publish = parsePublishMode(publishValue);
  const sign = parseSignMode(signValue);
  if (platform === 'mac' && arch !== 'arm64') {
    throw new Error('macOS desktop release artifacts are arm64-only');
  }

  return {
    platform,
    arch,
    targets: parseTargets(targetsValue, platform),
    version,
    publish,
    sign,
    outputDir: outputDirValue
      ? path.resolve(root, outputDirValue)
      : path.join(root, 'dist', 'release-artifacts', 'desktop', `${platform}-${arch}`),
    dir,
  } satisfies CliOptions;
}

async function run(command: string, args: ReadonlyArray<string>, env: NodeJS.ProcessEnv = process.env) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: root,
      env,
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

function builderBinaryPath() {
  return path.join(
    desktopDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder',
  );
}

function platformFlag(platform: DesktopPlatform) {
  switch (platform) {
    case 'linux':
      return '--linux';
    case 'mac':
      return '--mac';
    case 'win':
      return '--win';
  }
}

async function stageReleaseWorkspace(options: CliOptions) {
  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), 'glade-release-desktop-'));
  const appDir = path.join(workspaceDir, 'app');
  const resourcesDir = path.join(workspaceDir, 'resources');
  const runtimeConfigPath = path.join(workspaceDir, 'electron-builder.json');

  await mkdir(appDir, { recursive: true });
  await mkdir(resourcesDir, { recursive: true });
  await mkdir(path.join(resourcesDir, 'apps', 'web'), { recursive: true });
  await cp(path.join(desktopDir, 'dist-electron'), path.join(appDir, 'dist-electron'), { recursive: true });
  await cp(path.join(desktopDir, 'dist', 'server'), path.join(resourcesDir, 'server'), { recursive: true });
  await cp(path.join(root, 'apps', 'web', 'dist'), path.join(resourcesDir, 'apps', 'web', 'dist'), { recursive: true });

  const desktopPackage = await loadPackageJson<DesktopPackageJson>(desktopPackageJsonPath);
  const stagedPackage = {
    ...desktopPackage,
    version: options.version,
  };

  await writeFile(path.join(appDir, 'package.json'), JSON.stringify(stagedPackage, null, 2));
  await symlink(
    path.join(desktopDir, 'node_modules'),
    path.join(appDir, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );

  return {
    appDir,
    resourcesDir,
    runtimeConfigPath,
    workspaceDir,
    desktopPackage,
  };
}

function parseGitHubRepository() {
  const repository = process.env.GITHUB_REPOSITORY?.trim() || 'sims1253/glade';
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid GitHub repository value: ${repository}`);
  }

  return { owner, repo };
}

function readAzureTrustedSigningOptions() {
  const publisherName = process.env.AZURE_TRUSTED_SIGNING_PUBLISHER_NAME?.trim();
  const endpoint = process.env.AZURE_TRUSTED_SIGNING_ENDPOINT?.trim();
  const certificateProfileName = process.env.AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME?.trim();
  const codeSigningAccountName = process.env.AZURE_TRUSTED_SIGNING_ACCOUNT_NAME?.trim();

  const definedValues = [publisherName, endpoint, certificateProfileName, codeSigningAccountName].filter(Boolean);
  if (definedValues.length === 0) {
    if (process.env.GLADE_REQUIRE_AZURE_TRUSTED_SIGNING === 'true') {
      throw new Error('Azure Trusted Signing is required but no configuration was provided');
    }

    return null;
  }

  if (!publisherName || !endpoint || !certificateProfileName || !codeSigningAccountName) {
    throw new Error('Azure Trusted Signing configuration is incomplete');
  }

  return {
    publisherName,
    endpoint,
    certificateProfileName,
    codeSigningAccountName,
  } satisfies AzureTrustedSigningOptions;
}

function createRuntimeConfig(
  options: CliOptions,
  stage: Awaited<ReturnType<typeof stageReleaseWorkspace>>,
) {
  const { owner, repo } = parseGitHubRepository();
  const electronVersion = stage.desktopPackage.devDependencies?.electron;
  if (!electronVersion) {
    throw new Error('Unable to resolve electron version from apps/desktop/package.json');
  }

  const config: Record<string, unknown> = {
    appId: 'io.glade.desktop',
    productName: stage.desktopPackage.productName ?? 'Glade',
    artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
    asar: true,
    electronVersion,
    generateUpdatesFilesForAllChannels: true,
    npmRebuild: false,
    nodeGypRebuild: false,
    directories: {
      app: stage.appDir,
      output: options.outputDir,
      buildResources: path.join(root, 'assets', 'desktop'),
    },
    files: ['dist-electron/**/*', 'package.json'],
    extraResources: [
      {
        from: path.join(stage.resourcesDir, 'server'),
        to: 'server',
        filter: ['glade-server*'],
      },
      {
        from: path.join(stage.resourcesDir, 'apps', 'web', 'dist'),
        to: path.join('apps', 'web', 'dist'),
        filter: ['**/*'],
      },
    ],
    publish: [
      {
        provider: 'github',
        owner,
        repo,
        releaseType: 'release',
      },
    ],
    dmg: {
      icon: 'icons/icon.icns',
      contents: [
        { x: 150, y: 220 },
        { x: 410, y: 220, type: 'link', path: '/Applications' },
      ],
    },
    deb: {
      depends: ['libnotify4', 'libxtst6', 'libnss3'],
    },
    nsis: {
      oneClick: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: 'always',
      perMachine: false,
    },
  };

  if (options.platform === 'linux') {
    config.linux = {
      category: 'Science',
      icon: 'icons',
      maintainer: 'sims1253 <sims1253@users.noreply.github.com>',
      target: options.targets.map((target) => ({ target, arch: [options.arch] })),
    };
  }

  if (options.platform === 'mac') {
    config.mac = {
      category: 'public.app-category.developer-tools',
      icon: 'icons/icon.icns',
      hardenedRuntime: true,
      gatekeeperAssess: false,
      entitlements: 'entitlements.mac.plist',
      entitlementsInherit: 'entitlements.mac.plist',
      target: options.targets.map((target) => ({ target, arch: [options.arch] })),
    };
  }

  if (options.platform === 'win') {
    const azureTrustedSigning = options.sign === 'auto' ? readAzureTrustedSigningOptions() : null;
    config.win = {
      icon: 'icons/icon.ico',
      target: options.targets.map((target) => ({ target, arch: [options.arch] })),
      ...(azureTrustedSigning ? { azureSignOptions: azureTrustedSigning } : {}),
    };
  }

  return config;
}

function createBuilderEnv(options: CliOptions) {
  if (options.sign !== 'never') {
    return process.env;
  }

  return {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    CSC_FOR_PULL_REQUEST: 'true',
    CSC_LINK: '',
    CSC_KEY_PASSWORD: '',
    APPLE_ID: '',
    APPLE_APP_SPECIFIC_PASSWORD: '',
    APPLE_TEAM_ID: '',
    WIN_CSC_LINK: '',
    WIN_CSC_KEY_PASSWORD: '',
  };
}

async function assertDesktopArtifacts(options: CliOptions) {
  const entries = await readdir(options.outputDir, { withFileTypes: true });
  if (options.dir) {
    if (entries.length === 0) {
      throw new Error(`No desktop unpacked output was produced in ${options.outputDir}`);
    }

    return;
  }

  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const expectedExtensions: string[] = [];
  for (const target of options.targets) {
    switch (target) {
      case 'AppImage':
        expectedExtensions.push('.AppImage');
        break;
      case 'deb':
        expectedExtensions.push('.deb');
        break;
      case 'dmg':
        expectedExtensions.push('.dmg');
        break;
      case 'nsis':
        expectedExtensions.push('.exe');
        break;
      default:
        break;
    }
  }

  for (const extension of expectedExtensions) {
    if (!files.some((file) => file.endsWith(extension))) {
      throw new Error(`Missing expected desktop artifact with extension ${extension} in ${options.outputDir}`);
    }
  }
}

const options = await parseCliOptions();
await rm(options.outputDir, { recursive: true, force: true });
await mkdir(options.outputDir, { recursive: true });

await run(process.execPath, [path.join(root, 'scripts', 'build-desktop-bundle.ts')]);

const stage = await stageReleaseWorkspace(options);

try {
  const runtimeConfig = createRuntimeConfig(options, stage);
  await writeFile(stage.runtimeConfigPath, JSON.stringify(runtimeConfig, null, 2));

  const builderArgs = [
    '--config',
    stage.runtimeConfigPath,
    platformFlag(options.platform),
    '--publish',
    options.publish,
  ];

  if (options.dir) {
    builderArgs.push('--dir');
  }

  await run(builderBinaryPath(), builderArgs, createBuilderEnv(options));
  await assertDesktopArtifacts(options);
} finally {
  await rm(stage.workspaceDir, { recursive: true, force: true });
}
