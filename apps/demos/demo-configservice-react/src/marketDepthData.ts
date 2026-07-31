/**
 * Market-depth simulator.
 *
 * Produces a per-symbol Level-2 order book with live-ticking updates. The
 * model is deliberately simple (no microstructure, no queue priority) —
 * just enough realism to drive a ladder view with a believable rhythm:
 *
 *   • Every tick, a handful of levels mutate — size added (new orders),
 *     size reduced (partial cancels / fills), or a level disappears.
 *   • Occasionally a trade CROSSES the spread — decrements best ask/bid,
 *     bumps `last` + `lastSide`, and drifts the whole book ±1–3 ticks.
 *   • The book stays price-sorted at all times (asks ascending from the
 *     touch, bids descending from the touch).
 *
 * Consumers subscribe with `createDepthFeed().subscribe(symbol, onBook)`
 * and receive a fresh `SymbolBook` on every mutation. Unsubscribe via
 * the returned disposer.
 */

// ─── Types ────────────────────────────────────────────────────────────

export interface DepthLevel {
  price: number;
  size: number;
  /** Number of individual orders aggregated at this price (display only). */
  orders: number;
}

export type TradeSide = 'buy' | 'sell';

export interface L1Quote {
  bestBid: number | null;
  bestAsk: number | null;
  bidSize: number;
  askSize: number;
  /** Spread in currency units (askSize - bidSize). */
  spread: number | null;
  /** Midpoint between best bid / best ask. */
  mid: number | null;
  /** Most recent trade price. */
  last: number | null;
  /** Which side lifted / hit. `null` on first snapshot. */
  lastSide: TradeSide | null;
  /** Session open for change calculation. Fixed per symbol per session. */
  sessionOpen: number;
  /** Change from session open. */
  change: number;
  /** Percentage change from session open. */
  changePct: number;
  /** Timestamp (ms) of the last update. */
  updatedAt: number;
}

export interface SymbolBook {
  symbol: string;
  /** Asks sorted ascending by price — best (lowest) at index 0. */
  asks: DepthLevel[];
  /** Bids sorted descending by price — best (highest) at index 0. */
  bids: DepthLevel[];
  l1: L1Quote;
  /** Monotonic version counter — useful for React.memo comparisons. */
  version: number;
  /** Per-level flash metadata for the ladder's pulse animation. Keyed
   *  by price (string) → side that just mutated. Cleared on next tick.
   *  Only the *changed* side of a level is marked — a trade on the ask
   *  at 42.50 sets `flashes['42.50'] = 'ask'`. */
  flashes: Record<string, TradeSide>;
}

// ─── Configuration ────────────────────────────────────────────────────

export interface DepthFeedConfig {
  /** Symbols to simulate. Order matters — first symbol is the default. */
  symbols?: SymbolSpec[];
  /** Book depth per side. Default 10. */
  levels?: number;
  /** Tick interval in ms. Default 600. */
  intervalMs?: number;
  /** Probability per tick that a trade prints (crosses the spread). 0–1. */
  tradeProbability?: number;
  /** Mutations per tick (place/modify/cancel events). Default 4. */
  mutationsPerTick?: number;
}

export interface SymbolSpec {
  symbol: string;
  /** Opening price for the session. */
  sessionOpen: number;
  /** Tick size — minimum price increment. */
  tickSize: number;
  /** Reference size per level — actual sizes vary ±60% around this. */
  refSize: number;
}

export const DEFAULT_SYMBOLS: SymbolSpec[] = [
  { symbol: 'AAPL', sessionOpen: 228.45, tickSize: 0.01, refSize: 1200 },
  { symbol: 'MSFT', sessionOpen: 415.20, tickSize: 0.01, refSize: 800 },
  { symbol: 'NVDA', sessionOpen: 132.80, tickSize: 0.01, refSize: 3500 },
  { symbol: 'TSLA', sessionOpen: 248.60, tickSize: 0.01, refSize: 2400 },
  { symbol: 'AMZN', sessionOpen: 186.30, tickSize: 0.01, refSize: 1800 },
  { symbol: 'GOOGL', sessionOpen: 165.75, tickSize: 0.01, refSize: 1500 },
  { symbol: 'META', sessionOpen: 512.40, tickSize: 0.01, refSize: 900 },
  { symbol: 'AMD', sessionOpen: 148.90, tickSize: 0.01, refSize: 2100 },
];

// ─── Helpers ──────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function roundToTick(price: number, tickSize: number): number {
  const n = Math.round(price / tickSize);
  // Keep reasonable precision — store as 4dp so multiplication round-trips.
  return Math.round(n * tickSize * 10000) / 10000;
}

function priceKey(price: number): string {
  return price.toFixed(4);
}

// ─── Book construction ────────────────────────────────────────────────

function buildInitialBook(spec: SymbolSpec, levels: number): SymbolBook {
  const { sessionOpen, tickSize, refSize } = spec;
  // Start with a 1–3 tick spread around the session open.
  const halfSpread = tickSize * Math.ceil(rand(1, 3));
  const bestBid = roundToTick(sessionOpen - halfSpread, tickSize);
  const bestAsk = roundToTick(sessionOpen + halfSpread, tickSize);

  const asks: DepthLevel[] = [];
  const bids: DepthLevel[] = [];

  for (let i = 0; i < levels; i++) {
    const askPrice = roundToTick(bestAsk + i * tickSize * (1 + Math.floor(i / 3)), tickSize);
    const bidPrice = roundToTick(bestBid - i * tickSize * (1 + Math.floor(i / 3)), tickSize);
    // Far-from-touch levels carry less size on average than the inside.
    const sizeFactor = 1 + Math.abs(0.9 - i * 0.06);
    asks.push({
      price: askPrice,
      size: Math.round(refSize * sizeFactor * rand(0.5, 1.4)),
      orders: Math.max(1, Math.round(rand(1, 8))),
    });
    bids.push({
      price: bidPrice,
      size: Math.round(refSize * sizeFactor * rand(0.5, 1.4)),
      orders: Math.max(1, Math.round(rand(1, 8))),
    });
  }

  const l1: L1Quote = {
    bestBid,
    bestAsk,
    bidSize: bids[0].size,
    askSize: asks[0].size,
    spread: roundToTick(bestAsk - bestBid, tickSize),
    mid: roundToTick((bestBid + bestAsk) / 2, tickSize),
    last: sessionOpen,
    lastSide: null,
    sessionOpen,
    change: 0,
    changePct: 0,
    updatedAt: Date.now(),
  };

  return { symbol: spec.symbol, asks, bids, l1, version: 0, flashes: {} };
}

// ─── Tick mutation ────────────────────────────────────────────────────

function updateL1(book: SymbolBook, spec: SymbolSpec): void {
  const bestBid = book.bids[0]?.price ?? null;
  const bestAsk = book.asks[0]?.price ?? null;
  const spread = bestBid != null && bestAsk != null
    ? roundToTick(bestAsk - bestBid, spec.tickSize)
    : null;
  const mid = bestBid != null && bestAsk != null
    ? roundToTick((bestBid + bestAsk) / 2, spec.tickSize)
    : null;
  book.l1.bestBid = bestBid;
  book.l1.bestAsk = bestAsk;
  book.l1.bidSize = book.bids[0]?.size ?? 0;
  book.l1.askSize = book.asks[0]?.size ?? 0;
  book.l1.spread = spread;
  book.l1.mid = mid;
  const ref = mid ?? book.l1.last ?? book.l1.sessionOpen;
  book.l1.change = Math.round((ref - book.l1.sessionOpen) * 10000) / 10000;
  book.l1.changePct = book.l1.sessionOpen > 0
    ? Math.round((book.l1.change / book.l1.sessionOpen) * 100000) / 1000
    : 0;
  book.l1.updatedAt = Date.now();
}

function mutateLevel(level: DepthLevel, refSize: number): boolean {
  // Three cases: add size, trim size, or evict. Biased towards non-evict.
  const roll = Math.random();
  if (roll < 0.12 && level.size > refSize * 0.3) {
    // Evict entirely (cancel + refill at a slightly different size later).
    level.size = 0;
    level.orders = 0;
    return true;
  }
  if (roll < 0.55) {
    const delta = Math.round(refSize * rand(0.08, 0.35));
    level.size += delta;
    level.orders += Math.random() < 0.3 ? 1 : 0;
    return true;
  }
  const reduce = Math.round(level.size * rand(0.05, 0.3));
  if (reduce > 0 && level.size - reduce > 0) {
    level.size -= reduce;
    level.orders = Math.max(1, level.orders - (Math.random() < 0.25 ? 1 : 0));
    return true;
  }
  return false;
}

function executeTrade(book: SymbolBook, spec: SymbolSpec): void {
  // Random direction — but lean slightly in the direction of whichever
  // side is thinner (simulates one-sided pressure).
  const bidWeight = book.bids[0]?.size ?? 0;
  const askWeight = book.asks[0]?.size ?? 0;
  const total = bidWeight + askWeight;
  const hitBid = total > 0 ? Math.random() < bidWeight / total : Math.random() < 0.5;
  const side: TradeSide = hitBid ? 'sell' : 'buy'; // hitting bid = seller aggressing
  const book_side = hitBid ? book.bids : book.asks;
  if (book_side.length === 0) return;

  const topLevel = book_side[0];
  const tradeSize = Math.max(1, Math.round(topLevel.size * rand(0.08, 0.45)));
  topLevel.size -= tradeSize;
  book.l1.last = topLevel.price;
  book.l1.lastSide = side;
  book.flashes[priceKey(topLevel.price)] = side === 'buy' ? 'buy' : 'sell';

  // If the top level is cleared, remove it and push a new far level on
  // the opposite end so the ladder stays `levels` deep.
  if (topLevel.size <= 0) {
    book_side.shift();
    const last = book_side[book_side.length - 1];
    if (last) {
      const dir = hitBid ? -1 : 1; // new bid level goes lower, ask level higher
      const newPrice = roundToTick(last.price + dir * spec.tickSize * (1 + Math.floor(Math.random() * 3)), spec.tickSize);
      book_side.push({
        price: newPrice,
        size: Math.round(spec.refSize * rand(0.7, 1.6)),
        orders: Math.max(1, Math.round(rand(1, 6))),
      });
    }
  }
}

function rehealBook(book: SymbolBook, spec: SymbolSpec, levels: number): void {
  // Drop any zero-size levels that accumulated, then top up empty
  // levels at the far end so the ladder stays full-depth.
  book.asks = book.asks.filter((l) => l.size > 0);
  book.bids = book.bids.filter((l) => l.size > 0);

  while (book.asks.length < levels) {
    const last = book.asks[book.asks.length - 1]?.price ?? book.l1.bestAsk ?? spec.sessionOpen;
    const newPrice = roundToTick(last + spec.tickSize * (1 + Math.floor(Math.random() * 3)), spec.tickSize);
    book.asks.push({
      price: newPrice,
      size: Math.round(spec.refSize * rand(0.6, 1.6)),
      orders: Math.max(1, Math.round(rand(1, 6))),
    });
  }
  while (book.bids.length < levels) {
    const last = book.bids[book.bids.length - 1]?.price ?? book.l1.bestBid ?? spec.sessionOpen;
    const newPrice = roundToTick(last - spec.tickSize * (1 + Math.floor(Math.random() * 3)), spec.tickSize);
    book.bids.push({
      price: newPrice,
      size: Math.round(spec.refSize * rand(0.6, 1.6)),
      orders: Math.max(1, Math.round(rand(1, 6))),
    });
  }

  // Re-sort defensively in case a trade disturbed ordering.
  book.asks.sort((a, b) => a.price - b.price);
  book.bids.sort((a, b) => b.price - a.price);
}

function tickBook(book: SymbolBook, spec: SymbolSpec, cfg: Required<DepthFeedConfig>): void {
  book.flashes = {};

  // 1. Mutations — place/trim/cancel on random levels.
  for (let i = 0; i < cfg.mutationsPerTick; i++) {
    const onAsk = Math.random() < 0.5;
    const book_side = onAsk ? book.asks : book.bids;
    if (book_side.length === 0) continue;
    const idx = Math.floor(Math.random() * book_side.length);
    const level = book_side[idx];
    if (mutateLevel(level, spec.refSize)) {
      book.flashes[priceKey(level.price)] = onAsk ? 'buy' : 'sell';
    }
  }

  // 2. Trades — cross the spread with some probability.
  if (Math.random() < cfg.tradeProbability) {
    executeTrade(book, spec);
  }

  // 3. Re-heal + update L1.
  rehealBook(book, spec, cfg.levels);
  updateL1(book, spec);
  book.version++;
}

// ─── Feed implementation ──────────────────────────────────────────────

export interface DepthFeed {
  readonly symbols: readonly SymbolSpec[];
  /** Current snapshot for `symbol`. Use as the React initial state. */
  getBook(symbol: string): SymbolBook | undefined;
  /** Subscribe to mutations on `symbol`. Receives a fresh snapshot every
   *  tick. Returns a disposer; safe to call during cleanup. */
  subscribe(symbol: string, listener: (book: SymbolBook) => void): () => void;
  /** Stop the underlying interval. Idempotent. */
  dispose(): void;
  /** True iff the tick loop is running. Toggle via start/pause. */
  isRunning(): boolean;
  pause(): void;
  resume(): void;
}

export function createDepthFeed(config: DepthFeedConfig = {}): DepthFeed {
  const cfg: Required<DepthFeedConfig> = {
    symbols: config.symbols ?? DEFAULT_SYMBOLS,
    levels: config.levels ?? 10,
    intervalMs: config.intervalMs ?? 600,
    tradeProbability: config.tradeProbability ?? 0.55,
    mutationsPerTick: config.mutationsPerTick ?? 4,
  };

  const books = new Map<string, SymbolBook>();
  const specs = new Map<string, SymbolSpec>();
  const listeners = new Map<string, Set<(b: SymbolBook) => void>>();

  for (const spec of cfg.symbols) {
    specs.set(spec.symbol, spec);
    books.set(spec.symbol, buildInitialBook(spec, cfg.levels));
  }

  let handle: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const tick = () => {
    for (const [symbol, book] of books) {
      const spec = specs.get(symbol);
      if (!spec) continue;
      tickBook(book, spec, cfg);
      const subs = listeners.get(symbol);
      if (subs && subs.size > 0) {
        // Emit a shallow clone so React sees a new reference and
        // re-renders. Arrays/levels are cloned one level deep.
        const snapshot: SymbolBook = {
          ...book,
          asks: book.asks.map((l) => ({ ...l })),
          bids: book.bids.map((l) => ({ ...l })),
          l1: { ...book.l1 },
          flashes: { ...book.flashes },
        };
        for (const fn of subs) fn(snapshot);
      }
    }
  };

  const start = () => {
    if (handle != null) return;
    handle = setInterval(tick, cfg.intervalMs);
    running = true;
  };

  const stop = () => {
    if (handle == null) return;
    clearInterval(handle);
    handle = null;
    running = false;
  };

  start();

  return {
    symbols: cfg.symbols,
    getBook: (symbol) => books.get(symbol),
    subscribe(symbol, listener) {
      let subs = listeners.get(symbol);
      if (!subs) {
        subs = new Set();
        listeners.set(symbol, subs);
      }
      subs.add(listener);
      // Fire an initial snapshot so consumers don't wait a tick to
      // render the book.
      const book = books.get(symbol);
      if (book) listener({
        ...book,
        asks: book.asks.map((l) => ({ ...l })),
        bids: book.bids.map((l) => ({ ...l })),
        l1: { ...book.l1 },
        flashes: {},
      });
      return () => {
        subs?.delete(listener);
      };
    },
    dispose: stop,
    isRunning: () => running,
    pause: stop,
    resume: start,
  };
}
