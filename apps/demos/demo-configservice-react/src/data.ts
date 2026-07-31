// ─── Sample FI Trading Data ──────────────────────────────────────────────────

export interface Order {
  id: string;
  time: string;
  security: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  yield: number;
  spread: number;
  filled: number;
  status: 'OPEN' | 'PARTIAL' | 'FILLED' | 'CANCELLED';
  venue: string;
  counterparty: string;
  account: string;
  desk: string;
  trader: string;
  settlementDate: string;
  currency: string;
  notional: number;
}

const SECURITIES = [
  'UST 2Y 4.25 03/26', 'UST 5Y 4.00 03/29', 'UST 10Y 3.875 02/34',
  'UST 30Y 4.125 02/54', 'TIPS 10Y 1.75 01/34', 'FN 6.0 TBA',
  'FN 5.5 TBA', 'GN 5.0 TBA', 'T-BILL 3M', 'T-BILL 6M',
  'IG CDX 5Y', 'HY CDX 5Y', 'BUND 10Y 2.50', 'JGB 10Y 0.75',
  'GILT 10Y 4.00', 'AAPL 3.85 08/46', 'MSFT 2.40 08/26',
  'JPM 4.25 11/27', 'GS 3.50 01/28', 'WFC 4.10 06/26',
];

const VENUES = ['Bloomberg', 'Tradeweb', 'MarketAxess', 'ICE', 'Direct', 'Voice'];
const COUNTERPARTIES = ['Goldman Sachs', 'Morgan Stanley', 'JPMorgan', 'Barclays', 'Citi', 'BofA', 'Deutsche Bank', 'UBS'];
const ACCOUNTS = ['MAIN-001', 'HEDGE-002', 'PROP-003', 'CLIENT-004', 'REPO-005'];
const DESKS = ['Rates', 'Credit', 'Structured', 'MBS', 'Munis'];
const TRADERS = ['A. Smith', 'J. Chen', 'M. Williams', 'S. Patel', 'K. Johnson', 'R. Garcia'];
const STATUSES: Order['status'][] = ['OPEN', 'PARTIAL', 'FILLED', 'CANCELLED'];

function rand(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateOrder(index: number): Order {
  const quantity = Math.round(rand(100, 50000) / 100) * 100;
  const filled = pick(STATUSES) === 'FILLED' ? quantity : Math.round(Math.random() * quantity / 100) * 100;
  const price = rand(85, 115);
  return {
    id: `ORD-${String(index + 1).padStart(5, '0')}`,
    time: new Date(Date.now() - Math.random() * 86400000 * 3).toISOString(),
    security: pick(SECURITIES),
    side: Math.random() > 0.5 ? 'BUY' : 'SELL',
    quantity,
    price,
    yield: rand(0.5, 6.5),
    spread: rand(-20, 150),
    filled,
    status: filled >= quantity ? 'FILLED' : filled > 0 ? 'PARTIAL' : pick(['OPEN', 'CANCELLED']),
    venue: pick(VENUES),
    counterparty: pick(COUNTERPARTIES),
    account: pick(ACCOUNTS),
    desk: pick(DESKS),
    trader: pick(TRADERS),
    settlementDate: new Date(Date.now() + rand(1, 5) * 86400000).toISOString().slice(0, 10),
    currency: 'USD',
    notional: Math.round(quantity * price * 10) / 10,
  };
}

export function generateOrders(count: number = 200): Order[] {
  return Array.from({ length: count }, (_, i) => generateOrder(i));
}

// ─── Second dataset for the two-grid dashboard ─────────────────────────
//
// Uses the same `Order` shape so we can share columnDefs, but skews the
// security list towards equities + names the ids / accounts / desks
// differently so users can see at a glance that the two grids render
// independent data.

const EQUITY_SECURITIES = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD',
  'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'BK', 'SCHW',
  'XOM', 'CVX', 'COP', 'SLB',
  'JNJ', 'PFE', 'MRK', 'LLY',
  'WMT', 'COST', 'TGT', 'HD', 'LOW',
];

const EQUITY_VENUES = ['NYSE', 'NASDAQ', 'ARCA', 'BATS', 'IEX'];
const EQUITY_DESKS = ['Cash Equities', 'Program Trading', 'ETF Desk', 'Prime Brokerage'];

function generateEquityOrder(index: number): Order {
  const quantity = Math.round(rand(50, 25000) / 50) * 50;
  const filledStatus = pick(STATUSES);
  const filled =
    filledStatus === 'FILLED' ? quantity : Math.round(Math.random() * quantity / 50) * 50;
  const price = rand(10, 500);
  return {
    id: `EQ-${String(index + 1).padStart(5, '0')}`,
    time: new Date(Date.now() - Math.random() * 86400000 * 3).toISOString(),
    security: pick(EQUITY_SECURITIES),
    side: Math.random() > 0.5 ? 'BUY' : 'SELL',
    quantity,
    price,
    yield: rand(0.1, 4.5), // dividend yield proxy
    spread: rand(-5, 20), // bid-ask cents
    filled,
    status: filled >= quantity ? 'FILLED' : filled > 0 ? 'PARTIAL' : pick(['OPEN', 'CANCELLED']),
    venue: pick(EQUITY_VENUES),
    counterparty: pick(COUNTERPARTIES),
    account: pick(ACCOUNTS),
    desk: pick(EQUITY_DESKS),
    trader: pick(TRADERS),
    settlementDate: new Date(Date.now() + rand(1, 2) * 86400000).toISOString().slice(0, 10),
    currency: 'USD',
    notional: Math.round(quantity * price * 10) / 10,
  };
}

export function generateEquityOrders(count: number = 300): Order[] {
  return Array.from({ length: count }, (_, i) => generateEquityOrder(i));
}

// ─── Live ticking ──────────────────────────────────────────────────────
//
// Deterministic mutation loop that fires N random updates per tick across
// price / yield / spread / filled. Each mutated row is returned as a FULL
// row object (not a diff) so AG-Grid's `applyTransactionAsync({ update })`
// path matches by rowIdField and re-renders only the dirty cells. This
// also means conditional-styling flash + cellClassRules trigger exactly
// the same as they would in production, because `cellValueChanged` fires
// for the changed cells only.

export interface TickOptions {
  /** How many rows to mutate per tick. Default 18 — enough movement to
   *  keep the grid feeling alive without drowning the styling layer. */
  mutationsPerTick?: number;
  /** Max absolute price drift per tick, in currency units. Default 0.25. */
  priceDrift?: number;
  /** Max absolute spread drift per tick, in bps. Default 3. */
  spreadDrift?: number;
  /** Max absolute yield drift per tick, in percent. Default 0.05. */
  yieldDrift?: number;
  /** Minimum gap between updates for the same row id. Default 500ms (~2/sec). */
  minRowUpdateIntervalMs?: number;
}

/**
 * Start a live-ticking loop. Calls `onTick(updates)` every `intervalMs`
 * with a fresh array of mutated Order objects (by-id match). The hosting
 * component pipes those into `gridApi.applyTransactionAsync({ update })`.
 *
 * Returns a `stop()` function — call on unmount.
 */
export function startLiveTicking(
  rows: Order[],
  onTick: (updates: Order[]) => void,
  intervalMs: number = 750,
  opts: TickOptions = {},
): () => void {
  const {
    mutationsPerTick = 18,
    priceDrift = 0.25,
    spreadDrift = 3,
    yieldDrift = 0.05,
    minRowUpdateIntervalMs = 500,
  } = opts;

  // Keep a working copy indexed by id so repeated ticks on the same row
  // accumulate rather than each tick reverting to the seed.
  const byId = new Map<string, Order>(rows.map((r) => [r.id, { ...r }]));
  const ids = Array.from(byId.keys());
  let cursor = 0;
  const directionById = new Map<string, 1 | -1>(ids.map((id, i) => [id, i % 2 === 0 ? 1 : -1]));
  const lastUpdatedAtById = new Map<string, number>();

  // Fisher-Yates shuffle.
  const shuffleIds = () => {
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = ids[i];
      ids[i] = ids[j];
      ids[j] = tmp;
    }
  };
  shuffleIds();

  const handle = setInterval(() => {
    const updates: Order[] = [];
    const count = Math.min(mutationsPerTick, ids.length);
    let attempts = 0;
    const maxAttempts = ids.length * 3;
    while (updates.length < count && attempts < maxAttempts) {
      attempts++;
      if (cursor >= ids.length) {
        cursor = 0;
        shuffleIds();
      }
      const id = ids[cursor++];
      const current = byId.get(id);
      if (!current) continue;
      const now = Date.now();
      const last = lastUpdatedAtById.get(id) ?? 0;
      if (now - last < minRowUpdateIntervalMs) continue;

      // Enforce per-row 50/50 green/red by alternating each row's sign
      // on every hit (rather than a global sign that can bias by row).
      const sign = directionById.get(id) ?? 1;
      const dPriceMagnitude = Math.max(0.01, Math.random() * priceDrift);
      const dPrice = sign * dPriceMagnitude;
      directionById.set(id, sign === 1 ? -1 : 1);
      const dSpread = Math.round((Math.random() - 0.5) * 2 * spreadDrift);
      const dYield = (Math.random() - 0.5) * 2 * yieldDrift;

      const nextPrice = Math.max(1, Math.round((current.price + dPrice) * 100) / 100);
      const nextSpread = current.spread + dSpread;
      const nextYield = Math.max(0, Math.round((current.yield + dYield) * 1000) / 1000);

      // Nudge fill progress for OPEN / PARTIAL rows so the status badge
      // occasionally flips to PARTIAL or FILLED — gives the conditional
      // styling on `status` a reason to light up.
      let filled = current.filled;
      let status = current.status;
      if (status === 'OPEN' || status === 'PARTIAL') {
        if (Math.random() < 0.35) {
          const fillStep = Math.round((current.quantity * 0.1) / 100) * 100;
          filled = Math.min(current.quantity, filled + fillStep);
          status = filled >= current.quantity ? 'FILLED' : filled > 0 ? 'PARTIAL' : 'OPEN';
        }
      }

      const next: Order = {
        ...current,
        price: nextPrice,
        spread: nextSpread,
        yield: nextYield,
        filled,
        status,
        notional: Math.round(current.quantity * nextPrice * 10) / 10,
      };
      byId.set(id, next);
      lastUpdatedAtById.set(id, now);
      updates.push(next);
    }

    if (updates.length > 0) onTick(updates);
  }, intervalMs);

  return () => clearInterval(handle);
}
