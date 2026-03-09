import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import { WebSocketServer, type WebSocket } from 'ws';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Runtime from 'effect/Runtime';

import { type HealthResponse } from '@glade/contracts';
import { EXTENSION_BUNDLES_PATH, HEALTH_PATH, WS_PATH } from '@glade/shared';

import { ServerConfig } from './config';
import { contentTypeFor } from './lib/content-type';
import { ServerEdge } from './services/server-edge';

export class AppServer extends Context.Tag('glade/AppServer')<
  AppServer,
  { readonly url: string }
>() {}

function healthResponse(version: string): HealthResponse {
  return { status: 'ok', version };
}

function webDistPath(rootDir: string) {
  return path.join(rootDir, 'apps', 'web', 'dist');
}

function extensionBundleRoot(stateDir: string) {
  return path.join(stateDir, 'extensions');
}

async function proxyToVite(request: http.IncomingMessage, response: http.ServerResponse, target: string) {
  const requestUrl = new URL(request.url || '/', target).toString();
  const init: RequestInit = {
    headers: request.headers as Record<string, string>,
  };
  if (request.method) {
    init.method = request.method;
  }
  const proxied = await fetch(requestUrl, init);

  response.statusCode = proxied.status;
  for (const [key, value] of proxied.headers.entries()) {
    response.setHeader(key, value);
  }
  response.end(Buffer.from(await proxied.arrayBuffer()));
}

async function serveStatic(rootDir: string, requestPath: string, response: http.ServerResponse) {
  const distRoot = webDistPath(rootDir);
  const normalized = requestPath === '/' ? '/index.html' : requestPath;
  const assetPath = path.join(distRoot, normalized);
  const resolved = existsSync(assetPath) ? assetPath : path.join(distRoot, 'index.html');
  const buffer = await readFile(resolved);
  response.statusCode = 200;
  response.setHeader('Content-Type', contentTypeFor(resolved));
  response.end(buffer);
}

async function serveExtensionBundle(stateDir: string, requestPath: string, response: http.ServerResponse) {
  const relativePath = requestPath.slice(EXTENSION_BUNDLES_PATH.length).replace(/^\/+/, '');
  if (!relativePath) {
    response.statusCode = 404;
    response.end('Not Found');
    return;
  }

  const bundleRoot = extensionBundleRoot(stateDir);
  const resolved = path.resolve(bundleRoot, relativePath);
  const safeRoot = `${bundleRoot}${path.sep}`;
  if (resolved !== bundleRoot && !resolved.startsWith(safeRoot)) {
    response.statusCode = 404;
    response.end('Not Found');
    return;
  }

  let stats;
  try {
    stats = await stat(resolved);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      response.statusCode = 404;
      response.end('Not Found');
      return;
    }
    throw error;
  }

  if (!stats.isFile()) {
    response.statusCode = 404;
    response.end('Not Found');
    return;
  }

  const buffer = await readFile(resolved);
  response.statusCode = 200;
  response.setHeader('Content-Type', contentTypeFor(resolved));
  response.end(buffer);
}

export const AppServerLive: Layer.Layer<AppServer, unknown, ServerConfig | ServerEdge> = Layer.scoped(
  AppServer,
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const router = yield* ServerEdge;
    const effectRuntime = yield* Effect.runtime<never>();

    const requestHandler = (request: http.IncomingMessage, response: http.ServerResponse) => {
      void Runtime.runPromise(
        effectRuntime,
        Effect.tryPromise(async () => {
          const requestPath = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`).pathname;

          if (requestPath === HEALTH_PATH) {
            response.statusCode = 200;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(JSON.stringify(healthResponse(config.version)));
            return;
          }

          if (requestPath.startsWith(EXTENSION_BUNDLES_PATH)) {
            await serveExtensionBundle(config.stateDir, requestPath, response);
            return;
          }

          if (config.nodeEnv === 'development' && config.viteDevServerUrl) {
            await proxyToVite(request, response, config.viteDevServerUrl);
            return;
          }

          await serveStatic(config.rootDir, requestPath, response);
        }).pipe(
          Effect.catchAll(() =>
            Effect.sync(() => {
              response.statusCode = 500;
              response.end('Internal Server Error');
            }),
          ),
        ),
      );
    };

    const httpServer = http.createServer(requestHandler);
    const webSocketServer = new WebSocketServer({ noServer: true });

    const upgradeHandler = (
      request: http.IncomingMessage,
      socket: Parameters<typeof webSocketServer.handleUpgrade>[1],
      head: Buffer,
    ) => {
      const pathname = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`).pathname;
      if (pathname !== WS_PATH) {
        socket.destroy();
        return;
      }

      webSocketServer.handleUpgrade(request, socket, head, (client) => {
        webSocketServer.emit('connection', client, request);
      });
    };

    httpServer.on('upgrade', upgradeHandler);
    webSocketServer.on('connection', (socket: WebSocket) => {
      void Runtime.runPromise(effectRuntime, router.attachClient(socket));
    });

    yield* NodeHttpServer.make(() => httpServer, {
      host: config.host,
      port: config.port,
    });
    yield* Effect.addFinalizer(() =>
      Effect.tryPromise(
        () =>
          new Promise<void>((resolve, reject) => {
            httpServer.off('upgrade', upgradeHandler);
            webSocketServer.close((error) => {
              if (error) {
                reject(error);
                return;
              }
              resolve();
            });
          }),
      ).pipe(Effect.orDie));
    yield* router.startSession;

    const address = httpServer.address();
    const url = typeof address === 'string'
      ? address
      : `http://${address?.address === '::' ? '127.0.0.1' : address?.address ?? config.host}:${address?.port ?? config.port}`;

    return { url };
  }),
);
