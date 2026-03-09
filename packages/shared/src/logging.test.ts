import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { writeRotatingLogLine } from './logging';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(async (directory) => {
    await rm(directory, { recursive: true, force: true });
  }));
});

async function createTempDir() {
  const directory = await mkdtemp(path.join(tmpdir(), 'glade-logging-'));
  tempDirs.push(directory);
  return directory;
}

describe('logging helpers', () => {
  it('appends without rotating when the file stays within the size limit', async () => {
    const directory = await createTempDir();

    await writeRotatingLogLine({ directory, fileName: 'runtime.log', line: 'first', maxBytes: 64, maxFiles: 3 });
    await writeRotatingLogLine({ directory, fileName: 'runtime.log', line: 'second', maxBytes: 64, maxFiles: 3 });

    await expect(readFile(path.join(directory, 'runtime.log'), 'utf8')).resolves.toBe('first\nsecond\n');
    await expect(readFile(path.join(directory, 'runtime.log.1'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rotates log files before appending beyond the size limit', async () => {
    const directory = await createTempDir();

    await writeRotatingLogLine({ directory, fileName: 'runtime.log', line: 'first-entry', maxBytes: 16, maxFiles: 3 });
    await writeRotatingLogLine({ directory, fileName: 'runtime.log', line: 'second-entry', maxBytes: 16, maxFiles: 3 });
    await writeRotatingLogLine({ directory, fileName: 'runtime.log', line: 'third-entry', maxBytes: 16, maxFiles: 3 });

    await expect(readFile(path.join(directory, 'runtime.log'), 'utf8')).resolves.toBe('third-entry\n');
    await expect(readFile(path.join(directory, 'runtime.log.1'), 'utf8')).resolves.toBe('second-entry\n');
    await expect(readFile(path.join(directory, 'runtime.log.2'), 'utf8')).resolves.toBe('first-entry\n');
  });

  it('prunes the oldest rotated file once maxFiles is exceeded', async () => {
    const directory = await createTempDir();

    await writeRotatingLogLine({ directory, fileName: 'runtime.log', line: 'aaaa', maxBytes: 8, maxFiles: 3 });
    await writeRotatingLogLine({ directory, fileName: 'runtime.log', line: 'bbbb', maxBytes: 8, maxFiles: 3 });
    await writeRotatingLogLine({ directory, fileName: 'runtime.log', line: 'cccc', maxBytes: 8, maxFiles: 3 });
    await writeRotatingLogLine({ directory, fileName: 'runtime.log', line: 'dddd', maxBytes: 8, maxFiles: 3 });

    await expect(readFile(path.join(directory, 'runtime.log'), 'utf8')).resolves.toBe('dddd\n');
    await expect(readFile(path.join(directory, 'runtime.log.1'), 'utf8')).resolves.toBe('cccc\n');
    await expect(readFile(path.join(directory, 'runtime.log.2'), 'utf8')).resolves.toBe('bbbb\n');
    await expect(readFile(path.join(directory, 'runtime.log.3'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('creates the log file on the first write', async () => {
    const directory = await createTempDir();

    await writeRotatingLogLine({ directory, fileName: 'runtime.log', line: 'first-entry' });

    await expect(readFile(path.join(directory, 'runtime.log'), 'utf8')).resolves.toBe('first-entry\n');
  });
});
