import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_LOG_ROTATION_MAX_BYTES = 1_048_576;
export const DEFAULT_LOG_ROTATION_MAX_FILES = 5;

export interface RotatingFileSinkOptions {
  readonly directory: string;
  readonly fileName: string;
  readonly maxBytes?: number;
  readonly maxFiles?: number;
}

export interface RotatingFileSink {
  readonly directory: string;
  readonly fileName: string;
  readonly filePath: string;
  readonly maxBytes: number;
  readonly maxFiles: number;
  write(text: string): Promise<void>;
  writeLine(line: string): Promise<void>;
}

interface ResolvedSinkOptions {
  readonly directory: string;
  readonly fileName: string;
  readonly filePath: string;
  readonly maxBytes: number;
  readonly maxFiles: number;
}

const sinkCache = new Map<string, Promise<RotatingFileSink>>();

function resolveSinkOptions(options: RotatingFileSinkOptions): ResolvedSinkOptions {
  return {
    directory: options.directory,
    fileName: options.fileName,
    filePath: path.join(options.directory, options.fileName),
    maxBytes: options.maxBytes ?? DEFAULT_LOG_ROTATION_MAX_BYTES,
    maxFiles: Math.max(1, options.maxFiles ?? DEFAULT_LOG_ROTATION_MAX_FILES),
  };
}

async function readFileSize(filePath: string) {
  try {
    const current = await stat(filePath);
    return current.size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 0;
    }

    throw error;
  }
}

async function rotateLogFiles(options: ResolvedSinkOptions) {
  if (options.maxFiles <= 1) {
    await rm(options.filePath, { force: true });
    return;
  }

  const oldestPath = `${options.filePath}.${options.maxFiles - 1}`;
  await rm(oldestPath, { force: true });

  for (let index = options.maxFiles - 2; index >= 1; index -= 1) {
    const currentPath = `${options.filePath}.${index}`;
    const nextPath = `${options.filePath}.${index + 1}`;
    try {
      await rename(currentPath, nextPath);
    } catch {
    }
  }

  try {
    await rename(options.filePath, `${options.filePath}.1`);
  } catch {
  }
}

async function ensureCapacity(options: ResolvedSinkOptions, incomingBytes: number) {
  if (incomingBytes > options.maxBytes) {
    await rotateLogFiles(options);
    return;
  }

  const currentSize = await readFileSize(options.filePath);
  if (currentSize + incomingBytes > options.maxBytes) {
    await rotateLogFiles(options);
  }
}

function sinkCacheKey(options: RotatingFileSinkOptions) {
  const resolved = resolveSinkOptions(options);
  return `${resolved.directory}\u0000${resolved.fileName}\u0000${resolved.maxBytes}\u0000${resolved.maxFiles}`;
}

export async function createRotatingFileSink(options: RotatingFileSinkOptions): Promise<RotatingFileSink> {
  const resolved = resolveSinkOptions(options);
  let queue = Promise.resolve();

  const run = async (text: string) => {
    await mkdir(resolved.directory, { recursive: true });
    await ensureCapacity(resolved, Buffer.byteLength(text));
    await appendFile(resolved.filePath, text, 'utf8');
  };

  const sink: RotatingFileSink = {
    ...resolved,
    write(text: string) {
      const current = queue.then(() => run(text), () => run(text));
      queue = current.catch(() => undefined);
      return current;
    },
    writeLine(line: string) {
      return sink.write(`${line}\n`);
    },
  };

  return sink;
}

export async function getSharedRotatingFileSink(options: RotatingFileSinkOptions) {
  const key = sinkCacheKey(options);
  const existing = sinkCache.get(key);
  if (existing) {
    return await existing;
  }

  const pending = createRotatingFileSink(options);
  sinkCache.set(key, pending);
  return await pending;
}

export async function writeRotatingLogLine(options: RotatingFileSinkOptions & { readonly line: string }) {
  const { line, ...sinkOptions } = options;
  const sink = await getSharedRotatingFileSink(sinkOptions);
  await sink.writeLine(line);
}

export function createLineBuffer(onLine: (line: string) => void) {
  let buffer = '';

  return {
    push(chunk: string) {
      buffer += chunk.replace(/\r\n/g, '\n');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        onLine(line);
      }
    },
    flush() {
      if (!buffer) {
        return;
      }
      onLine(buffer);
      buffer = '';
    },
  };
}
