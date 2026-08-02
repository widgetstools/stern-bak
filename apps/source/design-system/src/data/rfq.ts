/** Pure deterministic RFQ state machine — no Date.now(), no Math.random(). */

export type RfqSide = 'buy' | 'sell';
export type RfqRequestStatus = 'pending' | 'quoted' | 'done' | 'cancelled';
export type RfqQuoteStatus = 'live' | 'stale' | 'done';

export interface RfqQuote {
  dealer: string;
  bid: number;
  ask: number;
  bidSizeMM: number;
  askSizeMM: number;
  status: RfqQuoteStatus;
}

export interface RfqExec {
  dealer: string;
  price: number;
  action: 'hit' | 'lift';
}

export interface RfqRequest {
  id: string;
  instrumentId: string;
  side: RfqSide;
  sizeMM: number;
  /** Reference mid captured at send time — all dealer quotes cluster around it. */
  mid: number;
  status: RfqRequestStatus;
  quotes: RfqQuote[];
  ticks: number;
  dealers: string[];
  exec?: RfqExec;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type RfqSendPayload = {
  id: string;
  instrumentId: string;
  side: RfqSide;
  sizeMM: number;
  /** Reference mid (the instrument's current mid) — dealers quote around it. */
  mid: number;
  dealers: string[];
};

export type RfqAction =
  | { type: 'send'; req: RfqSendPayload }
  | { type: 'tick' }
  | { type: 'hit'; id: string; dealer: string }
  | { type: 'lift'; id: string; dealer: string }
  | { type: 'cancel'; id: string }
  | { type: 'clear' };

// ~30 ticks models ~30 s at 1 tick/s interval
export const EXPIRY_TICKS = 30;

// Fixed per-tick probability that any given unquoted dealer responds.
// A single rng() draw is compared against this value.
// With rngHigh=0.9 => 0.9 >= QUOTE_PROB so dealer quotes;
// with rngLow=0.1  => 0.1 <  QUOTE_PROB so dealer does NOT quote.
// We want rngHigh to trigger quotes, so QUOTE_PROB must be <= 0.9.
// We want at least some coverage for intermediate rng values.
const QUOTE_PROB = 0.6;

// ─── Internal helpers ─────────────────────────────────────────────────────────

function round3(n: number) { return Math.round(n * 1000) / 1000; }

/** Generate a stochastic dealer quote. Uses rng to skew around mid. */
function makeDealerQuote(dealer: string, rng: () => number, mid: number): RfqQuote {
  const halfSpread = 0.04 + rng() * 0.08;  // 4-12 cts spread
  const skew = (rng() - 0.5) * 0.06;       // +/-3 ct skew
  const bid = round3(mid - halfSpread + skew);
  const ask = round3(mid + halfSpread + skew);
  const bidSizeMM = round3(1 + rng() * 9);  // 1-10 MM
  const askSizeMM = round3(1 + rng() * 9);
  return { dealer, bid, ask, bidSizeMM, askSizeMM, status: 'live' };
}

/**
 * Stream in quotes for a single request. Each requested dealer that hasn't
 * quoted yet has a chance (QUOTE_PROB) to respond this tick.
 * Returns updated request.
 */
function streamQuotes(req: RfqRequest, rng: () => number, mid: number): RfqRequest {
  if (req.status === 'done' || req.status === 'cancelled') return req;

  const quotedDealers = new Set(req.quotes.map((q) => q.dealer));
  const newQuotes: RfqQuote[] = [...req.quotes];

  for (const dealer of req.dealers) {
    if (quotedDealers.has(dealer)) continue;
    // Single rng draw: >= QUOTE_PROB means dealer responds
    if (rng() >= QUOTE_PROB) {
      newQuotes.push(makeDealerQuote(dealer, rng, mid));
    }
  }

  const status: RfqRequestStatus = newQuotes.length >= 1 ? 'quoted' : 'pending';
  return { ...req, quotes: newQuotes, status };
}

// ─── Tick handler ─────────────────────────────────────────────────────────────

function applyTick(requests: RfqRequest[], rng: () => number): RfqRequest[] {
  return requests.map((req) => {
    if (req.status === 'done' || req.status === 'cancelled') return req;
    const ticks = req.ticks + 1;
    if (ticks >= EXPIRY_TICKS) {
      return { ...req, ticks, status: 'cancelled' };
    }
    // Quote around the request's STABLE mid so the market never crosses.
    return streamQuotes({ ...req, ticks }, rng, req.mid);
  });
}

// ─── Execute (hit / lift) ─────────────────────────────────────────────────────

function applyExecute(
  requests: RfqRequest[],
  id: string,
  dealer: string,
  action: 'hit' | 'lift',
): RfqRequest[] {
  return requests.map((req) => {
    if (req.id !== id) return req;
    const target = req.quotes.find((q) => q.dealer === dealer);
    if (!target || req.status !== 'quoted') return req;

    const price = action === 'hit' ? target.bid : target.ask;
    const exec: RfqExec = { dealer, price, action };

    const quotes: RfqQuote[] = req.quotes.map((q) => {
      if (q.dealer === dealer) return { ...q, status: 'done' as const };
      return { ...q, status: 'stale' as const };
    });

    return { ...req, status: 'done', exec, quotes };
  });
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

/**
 * Pure RFQ state machine.
 * @param requests - current array of RFQ requests (never mutated)
 * @param action   - discriminated union action
 * @param rng      - injected PRNG (never Math.random)
 */
export function rfqReducer(
  requests: RfqRequest[],
  action: RfqAction,
  rng: () => number,
): RfqRequest[] {
  switch (action.type) {
    case 'send': {
      const newReq: RfqRequest = {
        id: action.req.id,
        instrumentId: action.req.instrumentId,
        side: action.req.side,
        sizeMM: action.req.sizeMM,
        mid: action.req.mid,
        status: 'pending',
        quotes: [],
        ticks: 0,
        dealers: action.req.dealers,
      };
      return [...requests, newReq];
    }

    case 'tick':
      return applyTick(requests, rng);

    case 'hit':
      return applyExecute(requests, action.id, action.dealer, 'hit');

    case 'lift':
      return applyExecute(requests, action.id, action.dealer, 'lift');

    case 'cancel':
      return requests.map((req) =>
        req.id === action.id && req.status !== 'done'
          ? { ...req, status: 'cancelled' as const }
          : req,
      );

    case 'clear':
      return requests.filter(
        (req) => req.status !== 'done' && req.status !== 'cancelled',
      );

    default:
      return requests;
  }
}
