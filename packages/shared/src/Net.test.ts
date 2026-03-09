import net from 'node:net';

import { describe, expect, it } from 'vitest';

import { getAvailablePort } from './Net';

async function listenOnEphemeralPort() {
  return await new Promise<{ server: net.Server; port: number }>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not determine the listening port.')));
        return;
      }

      resolve({ server, port: address.port });
    });
  });
}

describe('Net helpers', () => {
  it('returns the preferred port when it is available', async () => {
    const { server, port } = await listenOnEphemeralPort();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));

    await expect(getAvailablePort(port)).resolves.toBe(port);
  });

  it('falls back when the preferred port is already occupied', async () => {
    const { server, port } = await listenOnEphemeralPort();

    try {
      const resolved = await getAvailablePort(port);
      expect(resolved).not.toBe(port);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
