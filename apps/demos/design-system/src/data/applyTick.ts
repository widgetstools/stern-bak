import type { Position, Quote, TerminalState } from './types';

const HISTORY_CAP = 60;

/** Nudge one quote by an rng-driven delta; recompute bid/ask/dir/changePct/oas. */
function tickQuote(q: Quote, rng: () => number): Quote {
  const delta = (rng() - 0.5) * 0.12;          // ±0.06 max
  const mid = round3(Math.max(1, q.mid + delta));
  const spread = round3(q.ask - q.bid) || 0.1;
  const dir = delta > 0.002 ? 'up' : delta < -0.002 ? 'down' : 'flat';
  const oasDelta = (rng() - 0.5) * 4;
  return {
    ...q,
    mid,
    bid: round3(mid - spread / 2),
    ask: round3(mid + spread / 2),
    last: mid,
    ytm: round3(Math.max(0.2, Math.min(12, q.ytm - delta * 0.05))),
    oas: Math.max(0, Math.round(q.oas + oasDelta)),
    changePct: round2(Math.max(-99, Math.min(99, q.changePct + delta * 0.4))),
    dir,
  };
}

/**
 * Pure ticking reducer — returns a new state with nudged quotes, appended
 * (capped) price history, and recomputed position MV/PnL. No Date.now /
 * Math.random: the rng is injected so seeds and tests stay deterministic.
 */
export function applyTick(state: TerminalState, rng: () => number): TerminalState {
  const quotes: Record<string, Quote> = {};
  const history: Record<string, number[]> = {};
  for (const inst of state.instruments) {
    const q = tickQuote(state.quotes[inst.id], rng);
    quotes[inst.id] = q;
    const prev = state.history[inst.id] ?? [];
    history[inst.id] = [...prev, q.mid].slice(-HISTORY_CAP);
  }
  const positions: Position[] = state.positions.map((p) => {
    const q = quotes[p.instrumentId];
    return {
      ...p,
      marketValue: Math.round((p.qty * q.mid) / 100),
      unrealizedPnl: Math.round((p.qty * (q.mid - p.avgCost)) / 100),
    };
  });
  return { ...state, quotes, history, positions };
}

function round2(n: number) { return Math.round(n * 100) / 100; }
function round3(n: number) { return Math.round(n * 1000) / 1000; }
