import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRouter, type Route } from './router.js';

const routes: Route[] = [
  { method: 'GET', path: '/api/ping', handler: async (request) => ({ pong: request.query.get('n') }) },
  { method: 'POST', path: '/api/echo', handler: async (request) => ({ got: request.body }) },
  { method: 'POST', path: '/api/boom', handler: async () => { throw new Error('deliberate'); } },
];

let server: Server;
let base = '';
const errors: string[] = [];

beforeAll(async () => {
  const router = createRouter({ routes, onError: (_e, path) => errors.push(path) });
  server = createServer((req, res) => {
    if (router(req, res)) return;
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('CORS', () => {
  it('answers a preflight without touching a handler', async () => {
    const response = await fetch(`${base}/api/echo`, { method: 'OPTIONS' });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    expect(response.headers.get('access-control-allow-headers')).toBe('content-type');
    expect(response.headers.get('access-control-max-age')).toBe('600');
  });

  it('puts the allow-origin header on real responses too, not just preflights', async () => {
    const response = await fetch(`${base}/api/ping`);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('honours a pinned origin', async () => {
    const router = createRouter({ routes, allowOrigin: 'https://desk.example' });
    const scoped = createServer((req, res) => { if (!router(req, res)) { res.writeHead(404); res.end(); } });
    await new Promise<void>((resolve) => scoped.listen(0, '127.0.0.1', resolve));
    const address = scoped.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/api/ping`);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://desk.example');
    await new Promise<void>((resolve) => scoped.close(() => resolve()));
  });
});

describe('routing', () => {
  it('serves a GET and passes the query string through', async () => {
    const response = await fetch(`${base}/api/ping?n=7`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ pong: '7' });
  });

  it('parses a JSON body on a POST', async () => {
    const response = await fetch(`${base}/api/echo`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ worlds: 12 }),
    });
    expect(await response.json()).toEqual({ got: { worlds: 12 } });
  });

  it('treats an empty body as null rather than a parse error', async () => {
    const response = await fetch(`${base}/api/echo`, { method: 'POST' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ got: null });
  });

  it('rejects a body that is not JSON, with a message worth reading', async () => {
    const response = await fetch(`${base}/api/echo`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json',
    });
    expect(response.status).toBe(400);
    expect((await response.json() as { error: string }).error).toMatch(/not valid JSON/);
  });

  it('answers 405 for a known path with the wrong method', async () => {
    const response = await fetch(`${base}/api/ping`, { method: 'POST' });
    expect(response.status).toBe(405);
    expect((await response.json() as { error: string }).error).toContain('/api/ping');
  });

  it('declines a path it does not own, so other handlers still run', async () => {
    const response = await fetch(`${base}/somewhere/else`);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not found');
  });

  it('turns a thrown handler into a 400 and reports it', async () => {
    const response = await fetch(`${base}/api/boom`, { method: 'POST' });
    expect(response.status).toBe(400);
    expect((await response.json() as { error: string }).error).toBe('deliberate');
    expect(errors).toContain('/api/boom');
  });

  it('sets a content-length that matches the body it sends', async () => {
    const response = await fetch(`${base}/api/ping?n=1`);
    const text = await response.text();
    expect(response.headers.get('content-length')).toBe(String(Buffer.byteLength(text)));
  });
});
