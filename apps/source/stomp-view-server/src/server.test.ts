import http from 'node:http';
import { get as httpGet } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import type { AppConfig } from './config.js';
import { startServer } from './server.js';

function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    nodeEnv: 'test',
    rowProfile: 'slim',
    defaultSnapshotRows: 100,
    minSnapshotRows: 10,
    maxSnapshotRows: 500,
    liveTickMs: 40,
    maxRowsPerFrame: 50,
    maxLiveRowsPerSec: 1000,
    defaultLiveMode: 'legacy',
    debug: false,
    logOutbound: false,
    logLiveEvery: 1,
    logBodyPreviewChars: 400,
    ...overrides,
  };
}

function fetchJson(port: number, path: string, method = 'GET'): Promise<{
  status: number;
  body: unknown;
}> {
  return new Promise((resolve, reject) => {
    const req = httpGet({ hostname: '127.0.0.1', port, path, method }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode ?? 0, body: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('startServer', () => {
  let httpServer: http.Server | undefined;
  let port = 0;

  beforeEach(async () => {
    const originalCreate = http.createServer.bind(http);
    vi.spyOn(http, 'createServer').mockImplementation((handler) => {
      httpServer = originalCreate(handler);
      return httpServer;
    });

    await startServer(testConfig());
    const addr = httpServer!.address();
    port = typeof addr === 'object' && addr ? addr.port : 0;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => {
      httpServer?.close(() => resolve());
    });
  });

  it('serves health check', async () => {
    const { status, body } = await fetchJson(port, '/health');
    expect(status).toBe(200);
    expect(body).toMatchObject({
      status: 'healthy',
      service: 'stomp-view-server',
      environment: 'test',
    });
  });

  it('serves root metadata', async () => {
    const { status, body } = await fetchJson(port, '/');
    expect(status).toBe(200);
    expect(body).toMatchObject({
      name: 'STOMP FI View Server',
      version: '1.0.0',
    });
  });

  it('handles OPTIONS preflight', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpGet({ hostname: '127.0.0.1', port, path: '/health', method: 'OPTIONS' }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(200);
  });

  it('returns 404 for unknown routes', async () => {
    const { status, body } = await fetchJson(port, '/missing');
    expect(status).toBe(404);
    expect(body).toEqual({ error: 'Not Found' });
  });

  it('accepts WebSocket connections and routes STOMP frames', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    const connected = new Promise<string>((resolve) => {
      ws.on('message', (data) => resolve(data.toString()));
    });
    ws.send('CONNECT\naccept-version:1.2\n\n\0');
    const frame = await connected;
    expect(frame).toContain('CONNECTED');
    expect(frame).toContain('session-');

    ws.close();
    await new Promise<void>((resolve) => ws.on('close', () => resolve()));
  });

  it('splits null-delimited STOMP frames on one WebSocket message', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    const frames: string[] = [];
    ws.on('message', (data) => frames.push(data.toString()));

    ws.send('CONNECT\naccept-version:1.2\n\n\0CONNECT\naccept-version:1.2\n\n\0');
    await vi.waitFor(() => expect(frames.length).toBeGreaterThanOrEqual(2));

    ws.close();
  });
});
