/**
 * Synthetic positions rows shared by the spike pages and the hub worker —
 * 28 flat fields shaped like the demo feed. Deterministic LCG so runs are
 * comparable. Update batches are 7-column sparse ticks (the realistic
 * feed shape; Perspective applies partial-column updates in place).
 */

const DESKS = ['IG Credit', 'HY Credit', 'Govies', 'EM', 'Rates'];
const TRADERS = ['Jane Doe', 'John Smith', 'Sarah Williams', 'Lisa Davis', 'Mike Brown'];
let seed = 12345;
const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

export function positionId(i: number): string {
  return `POS-${i.toString(16).padStart(8, '0')}`;
}

export function row(i: number, tick: number): Record<string, unknown> {
  const px = 90 + rnd() * 20;
  return {
    positionId: positionId(i),
    cusip: `CUS${(i % 9000).toString().padStart(6, '0')}`,
    ticker: `TICK${i % 5000}`,
    instrumentName: `Corp ${2028 + (i % 15)} ${(rnd() * 8).toFixed(3)}%`,
    instrumentType: i % 3 === 0 ? 'CD' : 'IG',
    bookName: `BOOK00${i % 5}`,
    portfolio: `PORT${1000 + (i % 400)}`,
    trader: TRADERS[i % TRADERS.length],
    desk: DESKS[i % DESKS.length],
    region: i % 2 ? 'EMEA' : 'AMER',
    country: i % 2 ? 'GB' : 'US',
    asOfDate: '2026-08-30',
    notionalAmount: Math.round(rnd() * 5e7),
    marketValue: Math.round(rnd() * 5e7),
    currentPrice: px,
    averagePrice: px - rnd(),
    pnl: (rnd() - 0.5) * 1e6 + tick,
    unrealizedPnl: (rnd() - 0.5) * 1e6,
    realizedPnl: (rnd() - 0.5) * 1e5,
    dailyPnl: (rnd() - 0.5) * 1e5,
    mtdPnl: (rnd() - 0.5) * 1e6,
    ytdPnl: (rnd() - 0.5) * 1e7,
    yield: rnd() * 8,
    spread: rnd() * 400,
    dv01: rnd() * 1e4,
    pv01: rnd() * 1e4,
    cs01: rnd() * 1e4,
    ratingMoody: ['Aaa', 'Aa1', 'A2', 'Baa3', 'Ba1'][i % 5],
  };
}

export function buildSnapshotJson(n: number): string {
  const rows = new Array(n);
  for (let i = 0; i < n; i++) rows[i] = row(i, 0);
  return JSON.stringify(rows);
}

export function buildUpdatePool(n: number, batchRows: number, pool: number): string[] {
  const batches: string[] = [];
  for (let b = 0; b < pool; b++) {
    const rows = new Array(batchRows);
    for (let j = 0; j < batchRows; j++) {
      const i = Math.floor(rnd() * n);
      rows[j] = {
        positionId: positionId(i),
        currentPrice: 90 + rnd() * 20,
        pnl: (rnd() - 0.5) * 1e6,
        unrealizedPnl: (rnd() - 0.5) * 1e6,
        dailyPnl: (rnd() - 0.5) * 1e5,
        dv01: rnd() * 1e4,
        spread: rnd() * 400,
      };
    }
    batches.push(JSON.stringify(rows));
  }
  return batches;
}
