import type { Instrument, Quote } from './types';
import { DEALERS } from './seeds';

export interface Level {
  dealer: string;
  price: number;
  yield: number;    // %
  faceMM: number;   // face value in $MM
  dv01: number;     // $k
  type: 'STREAM' | 'IND' | 'RFQ';
  cumPct: number;   // cumulative fill bar [0..100]
}

export interface MidRow {
  mid: number;
  spread: number;   // ask - bid in price points
  midYield: number; // %
  zSpread: number;  // bps
}

export interface DepthResult {
  asks: Level[];    // 12 levels, sorted highest price first (farthest from mid first)
  bids: Level[];    // 12 levels, sorted highest price first (closest to mid first)
  midRow: MidRow;
}

const LEVEL_COUNT = 12;

function pickType(r: number): 'STREAM' | 'IND' | 'RFQ' {
  if (r < 0.50) return 'STREAM';
  if (r < 0.80) return 'IND';
  return 'RFQ';
}

function buildStep(rng: () => number): number {
  return 0.01 + rng() * 0.02;
}

function buildRawLevels(
  basePrice: number,
  direction: 1 | -1,
  quote: Quote,
  rng: () => number,
): Omit<Level, 'cumPct'>[] {
  const step = buildStep(rng);
  return Array.from({ length: LEVEL_COUNT }, (_, i) => {
    const price = +(basePrice + direction * step * (i + 1)).toFixed(3);
    // Approximate yield from price using a simple linear approximation
    const priceDiff = price - quote.mid;
    const yieldApprox = +(quote.ytm - priceDiff * 0.1).toFixed(3);
    const faceMM = +(1 + rng() * 24).toFixed(1);
    // dv01 scales with face size and quote dv01 (per $MM)
    const dv01 = +(faceMM * quote.dv01 / 10).toFixed(2);
    const dealer = DEALERS[i % DEALERS.length];
    const type = pickType(rng());
    return { dealer, price, yield: yieldApprox, faceMM, dv01, type };
  });
}

function addCumPct(levels: Omit<Level, 'cumPct'>[]): Level[] {
  const totalFace = levels.reduce((acc, l) => acc + l.faceMM, 0);
  let cumFace = 0;
  return levels.map((l) => {
    cumFace += l.faceMM;
    const cumPct = Math.min(100, +((cumFace / totalFace) * 100).toFixed(1));
    return { ...l, cumPct };
  });
}

export function buildDepth(
  quote: Quote,
  instrument: Instrument,
  rng: () => number,
): DepthResult {
  const rawAsks = buildRawLevels(quote.ask, 1, quote, rng);
  // Asks: highest price first (farthest from mid first), so reverse the 0..11 index order
  const asksSorted = [...rawAsks].sort((a, b) => b.price - a.price);
  const asks = addCumPct(asksSorted);

  const rawBids = buildRawLevels(quote.bid, -1, quote, rng);
  // Bids: highest price first (closest to mid first), prices go downward so index 0 is closest
  const bidsSorted = [...rawBids].sort((a, b) => b.price - a.price);
  const bids = addCumPct(bidsSorted);

  const midRow: MidRow = {
    mid: quote.mid,
    spread: +(quote.ask - quote.bid).toFixed(3),
    midYield: quote.ytm,
    zSpread: instrument.gSpd,
  };

  return { asks, bids, midRow };
}
