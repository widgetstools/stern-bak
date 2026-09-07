/**
 * HTTP + WebSocket listener.
 *
 * One `node:http` server hosts both the health/REST surface and the
 * WebSocket upgrade, so there is a single port to configure and a single
 * thing to shut down. This is the ONLY module that knows about `ws`;
 * everything below it depends on the `WireSocket` shape instead, which is
 * what lets the whole protocol layer be tested without a socket.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';

import type { Logger } from '../logger.js';
import { SessionRegistry } from './SessionRegistry.js';
import { StompSession, type SourceResolver } from './StompSession.js';
import type { WireSocket } from './WireSocket.js';

export interface StompServerOptions {
  port: number;
  host: string;
  resolver: SourceResolver;
  logger: Logger;
  /** Extra HTTP routes. Return true once the response has been handled. */
  httpHandler?: (req: IncomingMessage, res: ServerResponse) => boolean;
}

/** Adapt a `ws` socket to the narrow shape the session layer depends on. */
function adapt(ws: WebSocket): WireSocket {
  return {
    get bufferedAmount(): number {
      return ws.bufferedAmount;
    },
    send: (data: string) => {
      if (ws.readyState === ws.OPEN) ws.send(data);
    },
    close: (code?: number, reason?: string) => ws.close(code, reason),
    on: (event: string, listener: (...args: never[]) => void) => {
      ws.on(event, listener as (...args: unknown[]) => void);
    },
  } as WireSocket;
}

export class StompServer {
  private readonly http: Server;
  private readonly wss: WebSocketServer;
  readonly sessions = new SessionRegistry();

  constructor(private readonly options: StompServerOptions) {
    this.http = createServer((req, res) => this.onHttp(req, res));
    this.wss = new WebSocketServer({ noServer: true });

    this.http.on('upgrade', (req, socket, head) => {
      this.wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws));
    });
  }

  private onHttp(req: IncomingMessage, res: ServerResponse): void {
    if (this.options.httpHandler?.(req, res) === true) return;
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, sessions: this.sessions.size }));
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }

  private onConnection(ws: WebSocket): void {
    const sessionId = this.sessions.nextId();
    const session = new StompSession({
      sessionId,
      socket: adapt(ws),
      resolver: this.options.resolver,
      log: (m) => this.options.logger.debug(m),
      onClose: (id) => this.sessions.remove(id),
    });
    this.sessions.add(session);
    this.options.logger.info(`session ${sessionId} opened (${this.sessions.size} live)`);
  }

  listen(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.http.once('error', reject);
      this.http.listen(this.options.port, this.options.host, () => {
        const address = this.http.address();
        const port = typeof address === 'object' && address !== null ? address.port : this.options.port;
        this.options.logger.info(`listening on ws://${this.options.host}:${port}`);
        resolve(port);
      });
    });
  }

  async close(): Promise<void> {
    this.sessions.closeAll();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
    await new Promise<void>((resolve) => this.http.close(() => resolve()));
  }
}
