import { createReadStream } from 'node:fs';
import * as net from 'node:net';
import * as Effect from 'effect/Effect';

export interface BootstrapEnvelope {
  readonly mode?: string;
  readonly port?: number;
  readonly host?: string;
  readonly authToken?: string;
  readonly projectPath?: string;
}

const BOOTSTRAP_READ_TIMEOUT_MS = 1_000;

function fdPath(fd: number): string {
  if (process.platform === 'linux') {
    return `/proc/self/fd/${fd}`;
  }
  return `/dev/fd/${fd}`;
}

function readFromFd(fd: number): Effect.Effect<string, Error> {
  return Effect.async<string, Error>((resume) => {
    let data = '';
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (error) {
        resume(Effect.fail(error));
      } else {
        resume(Effect.succeed(data));
      }
    };

    try {
      const stream = createReadStream(fdPath(fd), { encoding: 'utf-8' });
      const timer = setTimeout(() => {
        stream.destroy();
        finish(new Error(`Bootstrap fd ${fd} read timed out after ${BOOTSTRAP_READ_TIMEOUT_MS}ms`));
      }, BOOTSTRAP_READ_TIMEOUT_MS);

      stream.on('data', (chunk: string) => {
        data += chunk;
      });

      stream.on('end', () => {
        clearTimeout(timer);
        finish();
      });

      stream.on('error', (error) => {
        clearTimeout(timer);
        finish(error);
      });
    } catch {
      finish(new Error(`Could not open fd ${fd} for reading`));
    }
  });
}

function readFromSocket(fd: number): Effect.Effect<string, Error> {
  return Effect.async<string, Error>((resume) => {
    const path = fdPath(fd);
    const client = net.createConnection(path, () => {
      let data = '';
      client.on('data', (chunk: Buffer) => {
        data += chunk.toString('utf-8');
      });
      client.on('end', () => {
        resume(Effect.succeed(data));
      });
      client.on('error', (error) => {
        resume(Effect.fail(error));
      });
    });
    client.on('error', (error) => {
      resume(Effect.fail(error));
    });
  });
}

export function readBootstrapEnvelope(fd: number): Effect.Effect<BootstrapEnvelope | null, never> {
  return Effect.gen(function* () {
    let rawData: string;
    try {
      rawData = yield* readFromFd(fd).pipe(
        Effect.catchAll(() => readFromSocket(fd)),
        Effect.catchAll(() => Effect.succeed('')),
      );
    } catch {
      return null;
    }

    const trimmed = rawData.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        return parsed as BootstrapEnvelope;
      }
    } catch {
      // Not valid JSON, ignore
    }

    return null;
  });
}
