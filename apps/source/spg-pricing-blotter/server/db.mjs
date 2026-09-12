/**
 * SQLite store for the SPG blotter server — `node:sqlite`, zero deps.
 *
 * The database is the source of truth: every trader write lands here
 * BEFORE any confirmation goes back over the feed, so the yellow
 * "pending" border in the grid genuinely means "the server has not
 * committed this yet". Derived fields (`currentFace`, `marketValue`,
 * `priceChangePct`) are recomputed here on every write — the echo the
 * grid receives after a price edit therefore also moves cells the
 * trader never touched, which is the point: the server owns the math.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export const POSITION_COLUMNS = [
  'cusip', 'dealName', 'assetClass', 'tranche', 'rating', 'coupon', 'spreadDm',
  'yieldToMaturity', 'walYears', 'factor', 'originalFace', 'currentFace',
  'price', 'priorPrice', 'priceChangePct', 'marketValue', 'pnl',
  'maturityDate', 'trader', 'desk', 'lastUpdate',
];

/** Columns a client is allowed to write. Everything else is server-derived or identity. */
export const WRITABLE_COLUMNS = new Set([
  'price', 'priorPrice', 'trader', 'spreadDm', 'yieldToMaturity', 'coupon', 'pnl',
]);

const NUMERIC_WRITABLE = new Set(['price', 'priorPrice', 'spreadDm', 'yieldToMaturity', 'coupon', 'pnl']);

function derive(row) {
  const currentFace = Math.round(row.originalFace * row.factor);
  const marketValue = Math.round(currentFace * (row.price / 100));
  const priceChangePct = row.priorPrice
    ? Number((((row.price - row.priorPrice) / row.priorPrice) * 100).toFixed(4))
    : 0;
  return { ...row, currentFace, marketValue, priceChangePct };
}

export function openDb(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS positions (
      cusip TEXT PRIMARY KEY,
      dealName TEXT, assetClass TEXT, tranche TEXT, rating TEXT,
      coupon REAL, spreadDm REAL, yieldToMaturity REAL, walYears REAL,
      factor REAL, originalFace REAL, currentFace REAL,
      price REAL, priorPrice REAL, priceChangePct REAL,
      marketValue REAL, pnl REAL,
      maturityDate TEXT, trader TEXT, desk TEXT, lastUpdate TEXT
    );
  `);
  return db;
}

export function seedIfEmpty(db, seedPath) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM positions').get().n;
  if (count > 0) return count;
  const raw = JSON.parse(readFileSync(seedPath, 'utf8'));
  const insert = db.prepare(`INSERT INTO positions (${POSITION_COLUMNS.join(', ')})
    VALUES (${POSITION_COLUMNS.map((c) => `:${c}`).join(', ')})`);
  db.exec('BEGIN');
  try {
    for (const row of raw) insert.run(derive(row));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return raw.length;
}

export function allPositions(db) {
  return db.prepare('SELECT * FROM positions ORDER BY cusip').all();
}

export function positionsByCusip(db, cusips) {
  if (cusips.length === 0) return [];
  const out = [];
  const get = db.prepare('SELECT * FROM positions WHERE cusip = ?');
  for (const c of cusips) {
    const row = get.get(String(c));
    if (row) out.push(row);
  }
  return out;
}

/**
 * Apply one batch of client writes. Each update names its cusip and ONLY
 * the fields the trader edited — unknown cusips and non-writable fields
 * are refused per-row rather than failing the batch, so one bad line in
 * a 500-row paste doesn't strand the other 499.
 *
 * Returns `{ results, changedRows }`: per-update verdicts for the REST
 * reply, and the full re-derived rows for the feed broadcast.
 */
export function applyUpdates(db, updates) {
  const get = db.prepare('SELECT * FROM positions WHERE cusip = ?');
  const results = [];
  const changedRows = [];
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    for (const u of updates) {
      const cusip = String(u?.cusip ?? '');
      const existing = get.get(cusip);
      if (!existing) {
        results.push({ cusip, ok: false, error: 'unknown cusip' });
        continue;
      }
      const fields = u?.fields && typeof u.fields === 'object' ? u.fields : {};
      const applied = {};
      let bad = null;
      for (const [k, v] of Object.entries(fields)) {
        if (!WRITABLE_COLUMNS.has(k)) { bad = `field "${k}" is not writable`; break; }
        if (NUMERIC_WRITABLE.has(k)) {
          const n = Number(v);
          if (!Number.isFinite(n)) { bad = `field "${k}" needs a finite number`; break; }
          applied[k] = n;
        } else {
          applied[k] = String(v);
        }
      }
      if (bad) {
        results.push({ cusip, ok: false, error: bad });
        continue;
      }
      if (Object.keys(applied).length === 0) {
        results.push({ cusip, ok: false, error: 'no writable fields' });
        continue;
      }
      const next = derive({ ...existing, ...applied, lastUpdate: now });
      db.prepare(`UPDATE positions SET ${POSITION_COLUMNS.filter((c) => c !== 'cusip')
        .map((c) => `${c} = :${c}`).join(', ')} WHERE cusip = :cusip`).run(next);
      results.push({ cusip, ok: true, fields: Object.keys(applied) });
      changedRows.push(next);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { results, changedRows };
}

/**
 * Ambient market drift — the live feed's heartbeat. Touches ONLY
 * analytics fields (yield / spread / pnl), never the trader-owned marks
 * (`price` / `priorPrice`): a mark moves when a trader moves it, which
 * keeps the edit-confirmation story honest while the blotter still
 * visibly streams.
 */
export function driftTick(db, count, rng = Math.random) {
  const cusips = db.prepare('SELECT cusip FROM positions ORDER BY RANDOM() LIMIT ?').all(count);
  const now = new Date().toISOString();
  const changed = [];
  const get = db.prepare('SELECT * FROM positions WHERE cusip = ?');
  db.exec('BEGIN');
  try {
    for (const { cusip } of cusips) {
      const row = get.get(cusip);
      if (!row) continue;
      const next = derive({
        ...row,
        yieldToMaturity: Number((row.yieldToMaturity + (rng() - 0.5) * 0.04).toFixed(3)),
        spreadDm: Math.max(20, Math.round(row.spreadDm + (rng() - 0.5) * 6)),
        pnl: Math.round(row.pnl + (rng() - 0.5) * 25_000),
        lastUpdate: now,
      });
      db.prepare('UPDATE positions SET yieldToMaturity = :yieldToMaturity, spreadDm = :spreadDm, pnl = :pnl, marketValue = :marketValue, lastUpdate = :lastUpdate WHERE cusip = :cusip')
        .run({ cusip: next.cusip, yieldToMaturity: next.yieldToMaturity, spreadDm: next.spreadDm, pnl: next.pnl, marketValue: next.marketValue, lastUpdate: next.lastUpdate });
      changed.push(next);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return changed;
}
