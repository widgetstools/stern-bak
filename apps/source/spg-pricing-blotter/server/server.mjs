/**
 * SPG pricing server — Express-style HTTP API + STOMP-over-WebSocket feed
 * over one port, backed by SQLite (`node:sqlite`, zero native deps).
 *
 * The contract is the SAME wire protocol `stomp-view-server` speaks (the
 * one the platform's `stomp-ssrm` provider already understands):
 *
 *   SUBSCRIBE  /snapshot/positions/{clientId}
 *   SEND       /snapshot/positions/{clientId}/{rate}[/{batchSize}]   ← trigger
 *   ← MESSAGE  message-type: snapshot          (JSON row batches)
 *   ← MESSAGE  message-type: snapshot-complete ("Success: …" — the end token)
 *   ← MESSAGE  message-type: live-update       (JSON row batches, forever)
 *
 * What is different from the synthetic view-server: rows live in SQLite,
 * seeded once from `seed/spg-positions.json`, and the REST write path is
 * the ONLY way a mark moves —
 *
 *   POST /api/updates  {updates: [{cusip, fields}]}
 *     → sqlite commit → (ackDelayMs, so the pending state is visible)
 *     → 200 {results} AND the re-derived rows broadcast as live-update
 *
 * so the feed echo the grid receives after an edit is by construction the
 * committed server state, derived fields included. Ambient drift touches
 * analytics fields only (never price/priorPrice — marks are trader-owned).
 *
 *   POST /api/lookup   {cusips: []} → {found: rows[], missing: []}
 *     (CSV import validation — an unknown cusip must never upsert a
 *      phantom row into the grid's engine cache)
 *   GET  /health
 */
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import * as wsNs from 'ws';
// Tolerate both ws module shapes: v8+ names WebSocketServer as an export,
// v7 hangs Server off the default WebSocket constructor.
const WebSocketServer = wsNs.WebSocketServer ?? wsNs.Server ?? wsNs.default?.WebSocketServer ?? wsNs.default?.Server;
import { allPositions, applyUpdates, driftTick, openDb, seedIfEmpty } from './db.mjs';
import { parseFrame, serializeFrame } from './stompFrames.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const TRIGGER = /^\/snapshot\/positions\/([^/]+)\/(\d+)(?:\/(\d+))?$/;
const TOPIC = /^\/snapshot\/positions\/[^/]+$/;

export function startSpgServer({
  port = Number(process.env.SPG_PORT ?? 8091),
  dbPath = process.env.SPG_DB ?? join(HERE, 'data', 'spg.sqlite'),
  seedPath = join(HERE, 'seed', 'spg-positions.json'),
  ackDelayMs = Number(process.env.SPG_ACK_DELAY_MS ?? 650),
  driftRowsPerSec = Number(process.env.SPG_DRIFT_ROWS_PER_SEC ?? 4),
  log = console.log,
} = {}) {
  if (dbPath !== ':memory:' && !existsSync(dirname(dbPath))) {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = openDb(dbPath);
  const seeded = seedIfEmpty(db, seedPath);

  /** clientKey → { ws, subs: Map<subId, destination>, session } */
  const clients = new Map();
  let nextSession = 1;
  let messageSeq = 1;
  let driftRate = driftRowsPerSec;

  function sendFrame(client, command, headers, body) {
    try {
      client.ws.send(serializeFrame(command, headers, body));
    } catch {
      /* socket mid-close */
    }
  }

  function sendMessage(client, subId, destination, messageType, body, extraHeaders = {}) {
    sendFrame(client, 'MESSAGE', {
      destination,
      'message-id': `msg-${messageSeq++}`,
      subscription: subId,
      'content-type': messageType === 'snapshot-complete' ? 'text/plain' : 'application/json',
      'message-type': messageType,
      ...extraHeaders,
    }, body);
  }

  /** Every (client, subscription) listening on a positions topic. */
  function* positionSubscribers() {
    for (const client of clients.values()) {
      for (const [subId, destination] of client.subs) {
        if (TOPIC.test(destination)) yield { client, subId, destination };
      }
    }
  }

  function broadcastRows(rows) {
    if (rows.length === 0) return;
    const body = JSON.stringify(rows);
    for (const { client, subId, destination } of positionSubscribers()) {
      sendMessage(client, subId, destination, 'live-update', body);
    }
  }

  function pumpSnapshot(client, subId, destination, batchSize) {
    const rows = allPositions(db);
    let batch = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      batch += 1;
      sendMessage(client, subId, destination, 'snapshot', JSON.stringify(rows.slice(i, i + batchSize)), {
        'batch-number': String(batch),
      });
    }
    sendMessage(client, subId, destination, 'snapshot-complete',
      `Success: All ${rows.length} positions records delivered. Starting live updates...`);
    log(`[spg-server] snapshot -> ${destination}: ${rows.length} rows in ${batch} batches`);
  }

  function handleStompFrame(client, frame) {
    switch (frame.command) {
      case 'CONNECT':
      case 'STOMP':
        client.session = `spg-${nextSession++}`;
        sendFrame(client, 'CONNECTED', {
          version: '1.2',
          session: client.session,
          server: 'spg-pricing-server/1.0.0',
          'heart-beat': '0,0',
        });
        return;
      case 'SUBSCRIBE': {
        const id = frame.headers.id ?? `sub-${client.subs.size}`;
        client.subs.set(id, frame.headers.destination ?? '');
        return;
      }
      case 'UNSUBSCRIBE':
        client.subs.delete(frame.headers.id ?? '');
        return;
      case 'SEND': {
        const match = (frame.headers.destination ?? '').match(TRIGGER);
        if (!match) return;
        const topic = `/snapshot/positions/${match[1]}`;
        driftRate = Math.min(50, Math.max(0, Number(match[2]) || 0));
        const batchSize = Math.min(2000, Math.max(50, Number(match[3]) || 500));
        for (const [subId, destination] of client.subs) {
          if (destination === topic) pumpSnapshot(client, subId, destination, batchSize);
        }
        return;
      }
      case 'DISCONNECT':
        if (frame.headers.receipt) {
          sendFrame(client, 'RECEIPT', { 'receipt-id': frame.headers.receipt });
        }
        return;
      default:
        return;
    }
  }

  // ── ambient drift: one server-wide clock, never the trader-owned marks ──
  const DRIFT_TICK_MS = 1000;
  const driftTimer = setInterval(() => {
    if (driftRate <= 0) return;
    if ([...positionSubscribers()].length === 0) return;
    broadcastRows(driftTick(db, driftRate));
  }, DRIFT_TICK_MS);
  driftTimer.unref?.();

  // ── HTTP: REST write path + health ──
  const httpServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Ack-Delay');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const respond = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    if (req.method === 'GET' && req.url === '/health') {
      respond(200, {
        status: 'healthy',
        service: 'spg-pricing-server',
        rows: db.prepare('SELECT COUNT(*) AS n FROM positions').get().n,
        subscribers: [...positionSubscribers()].length,
        ackDelayMs,
        driftRowsPerSec: driftRate,
        db: dbPath,
      });
      return;
    }

    if (req.method !== 'POST' || !req.url?.startsWith('/api/')) {
      respond(404, { error: 'not found' });
      return;
    }

    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        respond(400, { error: 'body is not JSON' });
        return;
      }

      if (req.url === '/api/lookup') {
        const cusips = Array.isArray(body.cusips) ? body.cusips.map(String) : [];
        const found = [];
        const missing = [];
        const get = db.prepare('SELECT * FROM positions WHERE cusip = ?');
        for (const c of cusips) {
          const row = get.get(c);
          if (row) found.push(row);
          else missing.push(c);
        }
        respond(200, { found, missing });
        return;
      }

      if (req.url === '/api/updates') {
        const updates = Array.isArray(body.updates) ? body.updates : [];
        if (updates.length === 0) { respond(400, { error: 'no updates' }); return; }
        let outcome;
        try {
          outcome = applyUpdates(db, updates);
        } catch (e) {
          respond(500, { error: String(e?.message ?? e) });
          return;
        }
        // The commit already happened; the delay is the demo's visible
        // "in flight at the server" window before ack + echo.
        const headerDelay = Number(req.headers['x-ack-delay']);
        const delay = Number.isFinite(headerDelay) ? Math.min(10_000, Math.max(0, headerDelay)) : ackDelayMs;
        setTimeout(() => {
          respond(200, { results: outcome.results });
          broadcastRows(outcome.changedRows);
          const ok = outcome.results.filter((r) => r.ok).length;
          log(`[spg-server] /api/updates: ${ok}/${outcome.results.length} committed, echoed to ${[...positionSubscribers()].length} subscriber(s)`);
        }, delay);
        return;
      }

      respond(404, { error: 'not found' });
    });
  });

  const wss = new WebSocketServer({ server: httpServer });
  wss.on('connection', (ws) => {
    const client = { ws, subs: new Map(), session: '' };
    const key = Symbol('client');
    clients.set(key, client);
    ws.on('message', (data) => {
      for (const rawFrame of data.toString().split('\0')) {
        const frame = parseFrame(rawFrame);
        if (frame) handleStompFrame(client, frame);
      }
    });
    ws.on('close', () => clients.delete(key));
    ws.on('error', () => clients.delete(key));
  });

  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      log(`[spg-server] ${seeded ? `seeded ${seeded} rows — ` : ''}http://localhost:${port}/health · ws://localhost:${port} · db ${dbPath}`);
      resolve({
        port,
        db,
        close: () => new Promise((done) => {
          clearInterval(driftTimer);
          wss.close();
          httpServer.close(() => done());
        }),
      });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startSpgServer();
}
