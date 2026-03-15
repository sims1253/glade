import net from 'node:net';

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

export class NetService extends Context.Tag('glade/NetService')<
  NetService,
  {
    readonly canListenOnLoopback: (port: number) => Effect.Effect<boolean, Error>;
    readonly getAvailablePort: (preferredPort?: number | null) => Effect.Effect<number, Error>;
  }
>() {}

async function canListenOnLoopback(port: number) {
  return await new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

async function openEphemeralLoopbackPort() {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not resolve an ephemeral port.')));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

export const NetServiceLive = Layer.succeed(NetService, {
  canListenOnLoopback: (port: number) => Effect.tryPromise(() => canListenOnLoopback(port)),
  getAvailablePort: (preferredPort?: number | null) =>
    Effect.gen(function* () {
      if (typeof preferredPort === 'number' && Number.isFinite(preferredPort)) {
        if (yield* Effect.tryPromise(() => canListenOnLoopback(preferredPort))) {
          return preferredPort;
        }
      }

      return yield* Effect.tryPromise(() => openEphemeralLoopbackPort());
    }),
});

export function getAvailablePortEffect(preferredPort?: number | null) {
  return Effect.flatMap(NetService, (service) => service.getAvailablePort(preferredPort));
}

export async function getAvailablePort(preferredPort?: number | null) {
  return await Effect.runPromise(Effect.provide(getAvailablePortEffect(preferredPort), NetServiceLive));
}
