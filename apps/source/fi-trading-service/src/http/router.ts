/**
 * A small JSON router for the service's request/response surface.
 *
 * STOMP is a streaming subscription transport: a client subscribes and rows
 * arrive until it unsubscribes. Scenario work is the opposite shape — one
 * question, one compute-heavy answer — so it goes over HTTP on the same port
 * rather than being forced through a frame vocabulary built for streams.
 *
 * Two things here are load-bearing.
 *
 * **CORS.** The assistant runs in a browser on another origin (the same
 * arrangement `llmClient.ts` already has with its local model server), so
 * without `Access-Control-Allow-Origin` and an `OPTIONS` branch the browser
 * refuses every call before it reaches us. The failure is invisible server-side.
 *
 * **Handlers are async but the hook is not.** `StompServerOptions.httpHandler`
 * returns a boolean meaning "I have taken this request"; the response is
 * finished later. So a handler claims the request synchronously and then does
 * its work, which is what lets a scenario run yield to the event loop instead
 * of starving the 40 ms publisher.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

/** Bodies larger than this are refused rather than buffered. */
const MAX_BODY_BYTES = 1_000_000;

export interface JsonRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  /** Parsed JSON body, or null for a GET or an empty body. */
  body: unknown;
}

export type RouteHandler = (request: JsonRequest) => Promise<unknown>;

export interface Route {
  method: 'GET' | 'POST';
  path: string;
  handler: RouteHandler;
}

export interface RouterOptions {
  routes: readonly Route[];
  /** Allowed origin. `*` suits a local demo; a deployment would pin it. */
  allowOrigin?: string;
  onError?: (error: unknown, path: string) => void;
}

const CORS_MAX_AGE_SECONDS = 600;

function corsHeaders(allowOrigin: string): Record<string, string> {
  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': String(CORS_MAX_AGE_SECONDS),
  };
}

function sendJson(
  res: ServerResponse, status: number, payload: unknown, allowOrigin: string,
): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
    ...corsHeaders(allowOrigin),
  });
  res.end(body);
}

/** Read and parse a JSON body, or throw a message worth showing a caller. */
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes`);
    chunks.push(buffer);
  }
  if (size === 0) return null;
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Request body is not valid JSON');
  }
}

/**
 * Build an `httpHandler` for `StompServer`.
 *
 * Returns true as soon as it recognises the path, then finishes the response
 * asynchronously — the hook's contract is "I have taken this", not "I am done".
 */
export function createRouter(
  options: RouterOptions,
): (req: IncomingMessage, res: ServerResponse) => boolean {
  const allowOrigin = options.allowOrigin ?? '*';
  const byPath = new Map<string, Route>();
  for (const route of options.routes) byPath.set(`${route.method} ${route.path}`, route);
  const paths = new Set(options.routes.map((route) => route.path));

  return (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!paths.has(url.pathname)) return false;

    // Preflight. The browser sends this before any POST with a JSON body, and
    // it must be answered without touching a handler.
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(allowOrigin));
      res.end();
      return true;
    }

    const route = byPath.get(`${req.method ?? 'GET'} ${url.pathname}`);
    if (route === undefined) {
      sendJson(res, 405, { error: `${req.method ?? 'GET'} not allowed on ${url.pathname}` }, allowOrigin);
      return true;
    }

    void (async (): Promise<void> => {
      try {
        const body = route.method === 'POST' ? await readJsonBody(req) : null;
        const result = await route.handler({
          method: route.method, path: url.pathname, query: url.searchParams, body,
        });
        sendJson(res, 200, result, allowOrigin);
      } catch (error) {
        options.onError?.(error, url.pathname);
        const message = error instanceof Error ? error.message : String(error);
        sendJson(res, 400, { error: message }, allowOrigin);
      }
    })();
    return true;
  };
}
