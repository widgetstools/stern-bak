import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { FastStompFrameParser, type StompFrame } from '../../../../packages/data/host-data/src/runtime/providers/transports/fastStompParser.js';
import { bootstrap, type RunningService } from './bootstrap.js';
import { loadConfig } from './config.js';
import { serializeFrame } from './wire/frameCodec.js';

/**
 * The one test that goes over a real socket.
 *
 * Everything else exercises the protocol against an in-memory double, which
 * is faster and can force states a real socket cannot. This one exists to
 * catch the wiring those tests cannot see: the HTTP upgrade, the `ws`
 * adapter, the bootstrap graph, and shutdown actually releasing the loop.
 * It decodes with the real browser-client parser, so a green run here is a
 * genuine end-to-end compatibility check.
 */

let service: RunningService | null = null;

afterEach(async () => {
  await service?.close();
  service = null;
});

function connect(port: number): Promise<{ ws: WebSocket; frames: StompFrame[]; wait: (pred: () => boolean, label: string) => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const frames: StompFrame[] = [];
    const parser = new FastStompFrameParser({ onFrame: (f) => frames.push(f) });
    ws.on('message', (data) => parser.feed(data.toString()));
    ws.on('error', reject);
    ws.on('open', () =>
      resolve({
        ws,
        frames,
        wait: async (pred, label) => {
          const deadline = Date.now() + 5000;
          while (!pred()) {
            if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
            await new Promise((r) => setTimeout(r, 10));
          }
        },
      }),
    );
  });
}

describe('service over a real socket', () => {
  it('serves a snapshot and then live updates to a real ws client', async () => {
    service = await bootstrap({
      ...loadConfig({}),
      port: 0,
      logLevel: 'silent',
      snapshotRows: 1200,
      tickRows: 300,
      tickIntervalMs: 10,
    });

    const { ws, frames, wait } = await connect(service.port);
    const topic = '/snapshot/positions/trd1';

    ws.send(serializeFrame('CONNECT', { 'accept-version': '1.2', host: 'x', 'heart-beat': '4000,4000' }));
    await wait(() => frames.some((f) => f.command === 'CONNECTED'), 'CONNECTED');

    ws.send(serializeFrame('SUBSCRIBE', { id: 'sub-0', destination: topic, ack: 'auto' }));
    ws.send(serializeFrame('SEND', { destination: `${topic}/5000/500` }, 'START'));

    await wait(
      () => frames.some((f) => f.headers['message-type'] === 'snapshot-complete'),
      'snapshot completion',
    );

    const snapshotRows = frames
      .filter((f) => f.headers['message-type'] === 'snapshot')
      .flatMap((f) => JSON.parse(f.body) as { positionId: string }[]);
    expect(snapshotRows).toHaveLength(1200);
    expect(new Set(snapshotRows.map((r) => r.positionId)).size).toBe(1200);

    await wait(
      () => frames.some((f) => f.headers['message-type'] === 'live-update'),
      'a live update',
    );
    const liveRows = frames
      .filter((f) => f.headers['message-type'] === 'live-update')
      .flatMap((f) => JSON.parse(f.body) as unknown[]);
    expect(liveRows.length).toBeGreaterThan(0);

    ws.close();
  });

  it('answers /health and releases the event loop on close', async () => {
    service = await bootstrap({ ...loadConfig({}), port: 0, logLevel: 'silent', tickRows: 0 });
    const response = await fetch(`http://127.0.0.1:${service.port}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });

    const missing = await fetch(`http://127.0.0.1:${service.port}/nope`);
    expect(missing.status).toBe(404);

    await service.close();
    service = null;
  });
});
