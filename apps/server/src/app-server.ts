import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { decodeCommand, type Command, type HealthResponse, type SessionStatus } from '@glade/contracts';
import { HEALTH_PATH, WS_PATH } from '@glade/shared';
import { WebSocketServer, type WebSocket } from 'ws';

import { ServerConfig } from './config';
import { contentTypeFor } from './lib/content-type';
import { SessionStatusStore } from './services/session-status';
import { WebSocketHub } from './services/websocket-hub';

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

async function proxyToVite(request: http.IncomingMessage, response: http.ServerResponse, target: string) {
  const requestUrl = new URL(request.url || '/', target).toString();
  const init: RequestInit = {
    headers: request.headers as Record<string, string>,
  };
  if (request.method) {
    init.method = request.method;
  }
  const proxied = await fetch(requestUrl, {
    ...init,
  });

  response.statusCode = proxied.status;
  for (const [key, value] of proxied.headers.entries()) {
    response.setHeader(key, value);
  }

  if (!proxied.body) {
    response.end();
    return;
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

function handleCommand(command: Command, currentStatus: SessionStatus): SessionStatus | { type: 'Pong'; at: string } {
  switch (command.type) {
    case 'GetSessionStatus':
      return currentStatus;
    case 'Ping':
      return { type: 'Pong', at: new Date().toISOString() };
  }
}

export const AppServerLive = Layer.scoped(
  AppServer,
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const statusStore = yield* SessionStatusStore;
    const hub = yield* WebSocketHub;
    const httpServer = http.createServer((request, response) => {
      void Effect.runPromise(
        Effect.tryPromise(async () => {
          const requestPath = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`).pathname;

          if (requestPath === HEALTH_PATH) {
            response.statusCode = 200;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(JSON.stringify(healthResponse(config.version)));
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
    });

    const webSocketServer = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (request, socket, head) => {
      const pathname = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`).pathname;
      if (pathname !== WS_PATH) {
        socket.destroy();
        return;
      }

      webSocketServer.handleUpgrade(request, socket, head, (client) => {
        webSocketServer.emit('connection', client, request);
      });
    });

    webSocketServer.on('connection', (socket: WebSocket) => {
      void Effect.runPromise(
        Effect.gen(function* () {
          yield* hub.add(socket);
          yield* hub.send(socket, yield* statusStore.get);
        }),
      );

      socket.on('message', (payload) => {
        void Effect.runPromise(
          Effect.gen(function* () {
            const decoded = yield* decodeCommand(JSON.parse(String(payload)));
            const currentStatus = yield* statusStore.get;
            yield* hub.send(socket, handleCommand(decoded, currentStatus));
          }),
        );
      });

      socket.on('close', () => {
        void Effect.runPromise(hub.remove(socket));
      });
    });

    yield* Effect.acquireRelease(
      Effect.tryPromise(
        () =>
          new Promise<{ url: string }>((resolve, reject) => {
            httpServer.once('error', reject);
            httpServer.listen(config.port, config.host, () => {
              resolve({ url: `http://${config.host}:${config.port}` });
            });
          }),
      ),
      () =>
        Effect.tryPromise(
          () =>
            new Promise<void>((resolve, reject) => {
              webSocketServer.close((webSocketError) => {
                if (webSocketError) {
                  reject(webSocketError);
                  return;
                }

                httpServer.close((httpError) => {
                  if (httpError) {
                    reject(httpError);
                    return;
                  }
                  resolve();
                });
              });
            }),
        ).pipe(Effect.orDie),
    );

    return { url: `http://${config.host}:${config.port}` };
  }),
);
