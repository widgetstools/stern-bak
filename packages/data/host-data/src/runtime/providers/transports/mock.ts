/**
 * MockProvider — synthesises rich, realistic fixed-income data for
 * dev and end-to-end testing of MarketsGrid's real-time features.
 *
 * Routing:
 *   cfg.dataType = 'positions' → portfolio of ~50 positions drawn from
 *     the shared universe (see `mockUniverse.ts`). Each row has 250+
 *     fields including nested ratings, key-rate durations, exposure
 *     breakdowns, and call/sink schedules. Ticks walk pricing, yields,
 *     spreads, accrued interest, and P&L on a random subset per
 *     interval.
 *   cfg.dataType = 'trades'    → seeded trade book that grows + decays
 *     under a lifecycle state machine (New → Pending → Executed →
 *     Allocated → Confirmed → Settled, with occasional amendments and
 *     fails). Ticks either mint new trades or advance an existing
 *     trade's status. Trades link to positions by `cusip`.
 *   cfg.dataType = 'orders' or 'custom' → falls back to the legacy
 *     simple row generator for back-compat with older configs.
 *
 * Shared state: the universe (`mockUniverse.ts`) is a module-level
 * singleton, so two provider instances inside the same SharedWorker
 * (one for positions, one for trades) see identical CUSIPs and the
 * trades.cusip → positions.cusip join works out of the box.
 *
 * Lifecycle: emit `loading`, push the initial snapshot with
 * `replace: true`, transition to `ready`, then start the ticker.
 * `restart(extra)` clears + re-seeds with the overlay merged onto the
 * existing config.
 */

import type { MockProviderConfig, MockSsrmProviderConfig } from '@wellsfargo-starui/types';
import type { ProviderEmit, ProviderHandle } from '../Provider.js';
import { getUniverse } from './mockUniverse.js';
import { buildPosition, tickPosition, type PositionRow } from './mockPosition.js';
import { buildTrade, tickTrade, pickTradingCusip, type TradeRow } from './mockTrade.js';

/** CSRM `mock` and SSRM `mock-ssrm` share the same row generator. */
type MockLikeConfig = MockProviderConfig | MockSsrmProviderConfig;

export interface MockProviderOpts {
  /** Inject for deterministic tests. Defaults to `setInterval`. */
  setTicker?: (cb: () => void, ms: number) => unknown;
  /** Companion to `setTicker`. Defaults to `clearInterval`. */
  clearTicker?: (handle: unknown) => void;
}

export function startMock(
  cfg: MockLikeConfig,
  emit: ProviderEmit,
  opts: MockProviderOpts = {},
): ProviderHandle {
  const setTicker = opts.setTicker ?? ((cb, ms) => setInterval(cb, ms));
  const clearTicker = opts.clearTicker ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));

  const dataType = cfg.dataType ?? 'positions';
  if (dataType === 'positions') return startPositions(cfg, emit, setTicker, clearTicker);
  if (dataType === 'trades')    return startTrades(cfg, emit, setTicker, clearTicker);
  return startLegacy(cfg, emit, setTicker, clearTicker);
}

// ─── Positions ───────────────────────────────────────────────────────

function startPositions(
  cfgIn: MockLikeConfig,
  emit: ProviderEmit,
  setTicker: NonNullable<MockProviderOpts['setTicker']>,
  clearTicker: NonNullable<MockProviderOpts['clearTicker']>,
): ProviderHandle {
  let cfg = cfgIn;
  let snapshot: PositionRow[] = [];
  let ticker: unknown = null;

  const build = (): PositionRow[] => {
    const universe = getUniverse();
    const target = cfg.rowCount ?? universe.length;
    const rows: PositionRow[] = [];
    // If rowCount > universe size, cycle universe entries with rotating account idx.
    for (let i = 0; i < target; i++) {
      const u = universe[i % universe.length];
      rows.push(buildPosition(u, Math.floor(i / universe.length)));
    }
    return rows;
  };

  const startTicker = () => {
    const updates = cfg.enableUpdates ?? true;
    const interval = cfg.updateIntervalMs ?? cfg.updateInterval ?? 750;
    if (!updates || snapshot.length === 0) return;
    ticker = setTicker(() => {
      // Tick a random 1-4% of the portfolio per interval — feels like
      // an active market without saturating the grid.
      const n = Math.max(1, Math.floor(snapshot.length * (0.01 + Math.random() * 0.03)));
      const batch: PositionRow[] = [];
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(Math.random() * snapshot.length);
        const ticked = tickPosition(snapshot[idx]);
        snapshot[idx] = ticked;
        batch.push(ticked);
      }
      emit({ rows: batch });
    }, interval);
  };

  const stopTicker = () => {
    if (ticker !== null) { clearTicker(ticker); ticker = null; }
  };

  const fireSnapshot = () => {
    snapshot = build();
    emit({ rows: snapshot, replace: true });
    emit({ status: 'ready' });
    startTicker();
  };

  emit({ status: 'loading' });
  Promise.resolve().then(fireSnapshot);

  return {
    stop: () => stopTicker(),
    restart: (extra) => {
      if (trySoftRuntimeRestart(extra, cfg, (next) => { cfg = next; }, stopTicker, startTicker)) {
        return;
      }
      stopTicker();
      cfg = applyOverlay(cfg, extra);
      emit({ rows: [], replace: true });
      emit({ status: 'loading' });
      Promise.resolve().then(fireSnapshot);
    },
  };
}

// ─── Trades ──────────────────────────────────────────────────────────

const TRADE_BOOK_CAP = 1000;

function startTrades(
  cfgIn: MockLikeConfig,
  emit: ProviderEmit,
  setTicker: NonNullable<MockProviderOpts['setTicker']>,
  clearTicker: NonNullable<MockProviderOpts['clearTicker']>,
): ProviderHandle {
  let cfg = cfgIn;
  let book: TradeRow[] = [];
  let bookByIdx = new Map<string, number>();
  let ticker: unknown = null;

  const build = (): TradeRow[] => {
    const target = cfg.rowCount ?? 200;
    const rows: TradeRow[] = [];
    for (let i = 0; i < target; i++) {
      const trade = buildTrade(pickTradingCusip());
      // Pre-age some trades so the initial set isn't all "New".
      // ~70% of seeded trades are walked partway through the lifecycle.
      const steps = Math.floor(Math.random() * 5);
      let advanced = trade;
      for (let s = 0; s < steps; s++) advanced = tickTrade(advanced);
      rows.push(advanced);
    }
    return rows;
  };

  const rebuildIndex = () => {
    bookByIdx = new Map();
    for (let i = 0; i < book.length; i++) bookByIdx.set(book[i].tradeId, i);
  };

  const startTicker = () => {
    const updates = cfg.enableUpdates ?? true;
    const interval = cfg.updateIntervalMs ?? cfg.updateInterval ?? 750;
    if (!updates) return;
    ticker = setTicker(() => {
      const batch: TradeRow[] = [];

      // 35% chance: mint a brand new trade
      if (Math.random() < 0.35 || book.length === 0) {
        const fresh = buildTrade(pickTradingCusip());
        if (book.length >= TRADE_BOOK_CAP) {
          // Drop a settled trade to make room; if none settled, drop oldest.
          const dropIdx = book.findIndex((t) => t.tradeStatus === 'Settled') >= 0
            ? book.findIndex((t) => t.tradeStatus === 'Settled')
            : 0;
          book.splice(dropIdx, 1);
          rebuildIndex();
        }
        book.push(fresh);
        bookByIdx.set(fresh.tradeId, book.length - 1);
        batch.push(fresh);
      }

      // Mutate 1–3 existing trades per tick — advance status, amend, etc.
      const mutateCount = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < mutateCount && book.length > 0; i++) {
        const idx = Math.floor(Math.random() * book.length);
        const ticked = tickTrade(book[idx]);
        book[idx] = ticked;
        batch.push(ticked);
      }

      if (batch.length > 0) emit({ rows: batch });
    }, interval);
  };

  const stopTicker = () => {
    if (ticker !== null) { clearTicker(ticker); ticker = null; }
  };

  const fireSnapshot = () => {
    book = build();
    rebuildIndex();
    emit({ rows: book, replace: true });
    emit({ status: 'ready' });
    startTicker();
  };

  emit({ status: 'loading' });
  Promise.resolve().then(fireSnapshot);

  return {
    stop: () => stopTicker(),
    restart: (extra) => {
      if (trySoftRuntimeRestart(extra, cfg, (next) => { cfg = next; }, stopTicker, startTicker)) {
        return;
      }
      stopTicker();
      cfg = applyOverlay(cfg, extra);
      emit({ rows: [], replace: true });
      emit({ status: 'loading' });
      Promise.resolve().then(fireSnapshot);
    },
  };
}

// ─── Legacy (orders / custom) ────────────────────────────────────────

interface LegacyRow extends Record<string, unknown> {
  id: string;
  instrument: string;
  side: 'Buy' | 'Sell';
  status: 'New' | 'PartiallyFilled' | 'Filled' | 'Cancelled';
  quantity: number;
  price: number;
  timestamp: number;
}
const LEGACY_INSTR = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META', 'NVDA', 'TSLA', 'JPM', 'BAC', 'GS'];
const LEGACY_SIDES: LegacyRow['side'][] = ['Buy', 'Sell'];
const LEGACY_STATUSES: LegacyRow['status'][] = ['New', 'PartiallyFilled', 'Filled', 'Cancelled'];

function buildLegacyRow(idx: number): LegacyRow {
  return {
    id: `row-${idx}`,
    instrument: LEGACY_INSTR[idx % LEGACY_INSTR.length],
    side: LEGACY_SIDES[idx % LEGACY_SIDES.length],
    status: LEGACY_STATUSES[idx % LEGACY_STATUSES.length],
    quantity: 100 + (idx * 37) % 900,
    price: Number((50 + (idx * 17) % 450 + Math.random() * 0.99).toFixed(2)),
    timestamp: Date.now(),
  };
}

function startLegacy(
  cfgIn: MockLikeConfig,
  emit: ProviderEmit,
  setTicker: NonNullable<MockProviderOpts['setTicker']>,
  clearTicker: NonNullable<MockProviderOpts['clearTicker']>,
): ProviderHandle {
  let cfg = cfgIn;
  let rowCount = cfg.rowCount ?? 50;
  let updates = cfg.enableUpdates ?? true;
  let interval = cfg.updateIntervalMs ?? cfg.updateInterval ?? 2000;
  let snapshot: LegacyRow[] = [];
  let ticker: unknown = null;

  const buildSnap = (): LegacyRow[] => {
    const out: LegacyRow[] = [];
    for (let i = 0; i < rowCount; i++) out.push(buildLegacyRow(i));
    return out;
  };

  const startT = () => {
    if (!updates || rowCount === 0) return;
    ticker = setTicker(() => {
      const idx = Math.floor(Math.random() * rowCount);
      const updated: LegacyRow = {
        ...snapshot[idx],
        price: Number((snapshot[idx].price + (Math.random() - 0.5)).toFixed(2)),
        timestamp: Date.now(),
      };
      snapshot[idx] = updated;
      emit({ rows: [updated] });
    }, interval);
  };
  const stopT = () => { if (ticker !== null) { clearTicker(ticker); ticker = null; } };
  const fire = () => {
    snapshot = buildSnap();
    emit({ rows: snapshot, replace: true });
    emit({ status: 'ready' });
    startT();
  };

  emit({ status: 'loading' });
  Promise.resolve().then(fire);

  return {
    stop: () => stopT(),
    restart: (extra) => {
      const soft = trySoftRuntimeRestart(
        extra,
        cfg,
        (next) => {
          cfg = next;
          rowCount = cfg.rowCount ?? rowCount;
          updates = cfg.enableUpdates ?? updates;
          interval = cfg.updateIntervalMs ?? cfg.updateInterval ?? interval;
        },
        stopT,
        startT,
      );
      if (soft) return;
      stopT();
      cfg = applyOverlay(cfg, extra);
      rowCount = cfg.rowCount ?? rowCount;
      updates = cfg.enableUpdates ?? updates;
      interval = cfg.updateIntervalMs ?? cfg.updateInterval ?? interval;
      emit({ rows: [], replace: true });
      emit({ status: 'loading' });
      Promise.resolve().then(fire);
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function applyOverlay(cfg: MockLikeConfig, extra: unknown): MockLikeConfig {
  if (!extra || typeof extra !== 'object') return cfg;
  const o = extra as Record<string, unknown>;
  return {
    ...cfg,
    rowCount: typeof o.rowCount === 'number' ? o.rowCount : cfg.rowCount,
    updateIntervalMs: typeof o.updateIntervalMs === 'number' ? o.updateIntervalMs : cfg.updateIntervalMs,
    enableUpdates: typeof o.enableUpdates === 'boolean' ? o.enableUpdates : cfg.enableUpdates,
    dataType: (typeof o.dataType === 'string' ? o.dataType : cfg.dataType) as MockLikeConfig['dataType'],
  };
}

/** Interval / pause toggles only — no snapshot rebuild. */
function isSoftRuntimePatch(extra: unknown, cfg: MockLikeConfig): boolean {
  if (!extra || typeof extra !== 'object') return false;
  const o = extra as Record<string, unknown>;
  if ('__scenarioClear' in o || '__refresh' in o) return false;
  if (typeof o.dataType === 'string' && o.dataType !== cfg.dataType) return false;
  if (typeof o.rowCount === 'number' && o.rowCount !== cfg.rowCount) return false;
  return typeof o.updateIntervalMs === 'number' || typeof o.enableUpdates === 'boolean';
}

function trySoftRuntimeRestart(
  extra: unknown,
  cfgIn: MockLikeConfig,
  setCfg: (next: MockLikeConfig) => void,
  stopTicker: () => void,
  startTicker: () => void,
): boolean {
  if (!isSoftRuntimePatch(extra, cfgIn)) return false;
  setCfg(applyOverlay(cfgIn, extra));
  stopTicker();
  startTicker();
  return true;
}

/**
 * Probe helper — returns a small sample of rows for the editor's
 * "Infer Fields" button without spinning up a live ticker. Exported
 * so `useProviderProbe` can call it without going through the full
 * provider lifecycle.
 */
export function probeMock(cfg: MockLikeConfig, opts: { maxRows?: number } = {}): { ok: true; rows: readonly unknown[] } {
  const max = opts.maxRows ?? 5;
  const dataType = cfg.dataType ?? 'positions';
  const universe = getUniverse();
  const rows: unknown[] = [];
  if (dataType === 'trades') {
    for (let i = 0; i < max; i++) rows.push(buildTrade(universe[i % universe.length]));
  } else if (dataType === 'positions') {
    for (let i = 0; i < max; i++) rows.push(buildPosition(universe[i % universe.length], 0));
  } else {
    for (let i = 0; i < max; i++) rows.push(buildLegacyRow(i));
  }
  return { ok: true, rows };
}
