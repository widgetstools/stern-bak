import type {
  BookRisk,
  CurvePoint,
  Instrument,
  MarketIndex,
  Order,
  OrderStatus,
  Position,
  Quote,
  RateScenario,
  ResearchNote,
  TerminalState,
} from './types';

/** Deterministic LCG PRNG — stable across runs so seeds/tests never flake. */
export function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
}

/** ~16 realistic fixed-income instruments across sectors and ratings. */
export const SEED_INSTRUMENTS: Instrument[] = [
  { id: 'i01', cusip: '912828Z78', ticker: 'T 2.5 02/45',      description: 'US Treasury 2.5% 2045',          coupon: 2.5,   maturity: '2045-02-15', rating: 'AAA',  sector: 'Government', currency: 'USD', ratingClass: 'aaa', ytw: 2.52, gSpd:   5, cvx: 19.8, seniority: 'Senior',           axes: 'GS MS JPM' },
  { id: 'i02', cusip: '912810TM0', ticker: 'T 1.875 11/51',     description: 'US Treasury 1.875% 2051',         coupon: 1.875, maturity: '2051-11-15', rating: 'AAA',  sector: 'Government', currency: 'USD', ratingClass: 'aaa', ytw: 1.89, gSpd:   6, cvx: 25.2, seniority: 'Senior',           axes: 'GS BAML' },
  { id: 'i03', cusip: '037833DX5', ticker: 'AAPL 3.25 02/30',   description: 'Apple Inc 3.25% 2030',            coupon: 3.25,  maturity: '2030-02-23', rating: 'AA+',  sector: 'Technology', currency: 'USD', ratingClass: 'aa',  ytw: 3.28, gSpd:  72, cvx:  6.4, seniority: 'Senior Unsecured', axes: 'GS MS CITI' },
  { id: 'i04', cusip: '594918BR4', ticker: 'MSFT 2.4 08/26',    description: 'Microsoft 2.4% 2026',             coupon: 2.4,   maturity: '2026-08-08', rating: 'AAA',  sector: 'Technology', currency: 'USD', ratingClass: 'aaa', ytw: 2.43, gSpd:  38, cvx:  2.8, seniority: 'Senior Unsecured', axes: 'JPM BAML' },
  { id: 'i05', cusip: '46625HRL6', ticker: 'JPM 4.25 10/27',    description: 'JPMorgan 4.25% 2027',             coupon: 4.25,  maturity: '2027-10-01', rating: 'A-',   sector: 'Financials', currency: 'USD', ratingClass: 'a',   ytw: 4.31, gSpd:  92, cvx:  3.2, seniority: 'Senior Unsecured', axes: 'MS CITI DB' },
  { id: 'i06', cusip: '06051GHF9', ticker: 'BAC 3.95 04/28',    description: 'Bank of America 3.95% 2028',      coupon: 3.95,  maturity: '2028-04-21', rating: 'A-',   sector: 'Financials', currency: 'USD', ratingClass: 'a',   ytw: 3.98, gSpd:  98, cvx:  3.8, seniority: 'Senior Unsecured', axes: 'GS JPM BARC' },
  { id: 'i07', cusip: '30231GBH5', ticker: 'XOM 3.482 03/30',   description: 'Exxon Mobil 3.482% 2030',         coupon: 3.482, maturity: '2030-03-19', rating: 'AA-',  sector: 'Energy',     currency: 'USD', ratingClass: 'aa',  ytw: 3.50, gSpd:  55, cvx:  5.9, seniority: 'Senior Unsecured', axes: 'GS DB UBS' },
  { id: 'i08', cusip: '166764BW9', ticker: 'CVX 3.078 05/50',   description: 'Chevron 3.078% 2050',             coupon: 3.078, maturity: '2050-05-11', rating: 'AA-',  sector: 'Energy',     currency: 'USD', ratingClass: 'aa',  ytw: 3.09, gSpd:  58, cvx: 22.5, seniority: 'Senior Unsecured', axes: 'MS BAML' },
  { id: 'i09', cusip: '478160CN2', ticker: 'JNJ 2.45 03/26',    description: 'Johnson & Johnson 2.45% 2026',    coupon: 2.45,  maturity: '2026-03-01', rating: 'AAA',  sector: 'Healthcare', currency: 'USD', ratingClass: 'aaa', ytw: 2.46, gSpd:  32, cvx:  2.2, seniority: 'Senior Unsecured', axes: 'GS JPM CITI' },
  { id: 'i10', cusip: '58933YBG6', ticker: 'MRK 2.75 02/51',    description: 'Merck 2.75% 2051',                coupon: 2.75,  maturity: '2051-02-10', rating: 'A+',   sector: 'Healthcare', currency: 'USD', ratingClass: 'a',   ytw: 2.77, gSpd:  62, cvx: 24.1, seniority: 'Senior Unsecured', axes: 'MS DB' },
  { id: 'i11', cusip: '254687FK6', ticker: 'DIS 3.8 03/30',     description: 'Walt Disney 3.8% 2030',           coupon: 3.8,   maturity: '2030-03-22', rating: 'A-',   sector: 'Consumer',   currency: 'USD', ratingClass: 'a',   ytw: 3.83, gSpd:  95, cvx:  6.1, seniority: 'Senior Unsecured', axes: 'GS BAML BARC' },
  { id: 'i12', cusip: '191216CL2', ticker: 'KO 2.875 05/41',    description: 'Coca-Cola 2.875% 2041',           coupon: 2.875, maturity: '2041-05-05', rating: 'A+',   sector: 'Consumer',   currency: 'USD', ratingClass: 'a',   ytw: 2.89, gSpd:  68, cvx: 14.3, seniority: 'Senior Unsecured', axes: 'JPM CITI' },
  { id: 'i13', cusip: '92826CAC8', ticker: 'V 3.15 12/25',      description: 'Visa 3.15% 2025',                 coupon: 3.15,  maturity: '2025-12-14', rating: 'AA-',  sector: 'Financials', currency: 'USD', ratingClass: 'aa',  ytw: 3.17, gSpd:  44, cvx:  1.5, seniority: 'Senior Unsecured', axes: 'GS MS JPM' },
  { id: 'i14', cusip: '532457BV3', ticker: 'LLY 3.95 03/49',    description: 'Eli Lilly 3.95% 2049',            coupon: 3.95,  maturity: '2049-03-15', rating: 'A+',   sector: 'Healthcare', currency: 'USD', ratingClass: 'a',   ytw: 3.97, gSpd:  88, cvx: 21.8, seniority: 'Senior Unsecured', axes: 'MS BAML UBS' },
  { id: 'i15', cusip: '00206RKM5', ticker: 'T 4.3 02/30',       description: 'AT&T 4.3% 2030',                  coupon: 4.3,   maturity: '2030-02-15', rating: 'BBB',  sector: 'Telecom',    currency: 'USD', ratingClass: 'bbb', ytw: 4.33, gSpd: 145, cvx:  6.5, seniority: 'Senior Unsecured', axes: 'GS CITI DB' },
  { id: 'i16', cusip: '459200KS9', ticker: 'IBM 4.15 05/39',    description: 'IBM 4.15% 2039',                  coupon: 4.15,  maturity: '2039-05-15', rating: 'A-',   sector: 'Technology', currency: 'USD', ratingClass: 'a',   ytw: 4.18, gSpd: 108, cvx: 12.2, seniority: 'Senior Unsecured', axes: 'JPM BARC UBS' },
];

export const DEALERS: string[] = ['GS', 'MS', 'JPM', 'BAML', 'CITI', 'DB', 'BARC', 'UBS'];

export const CURVE_SERIES: CurvePoint[] = [
  { tenor:  1, today: 5.28, week: 5.31, month: 5.20 },
  { tenor:  2, today: 4.92, week: 4.97, month: 4.85 },
  { tenor:  3, today: 4.71, week: 4.76, month: 4.65 },
  { tenor:  5, today: 4.52, week: 4.58, month: 4.42 },
  { tenor:  7, today: 4.48, week: 4.55, month: 4.38 },
  { tenor: 10, today: 4.45, week: 4.52, month: 4.35 },
  { tenor: 20, today: 4.72, week: 4.79, month: 4.60 },
  { tenor: 30, today: 4.62, week: 4.68, month: 4.50 },
];

export const RATE_SCENARIOS: RateScenario[] = [
  { label: '-100bp', pnl:  8_420 },
  { label: '-75bp',  pnl:  6_180 },
  { label: '-50bp',  pnl:  4_050 },
  { label: '-25bp',  pnl:  2_010 },
  { label: 'flat',   pnl:     42 },
  { label: '+25bp',  pnl: -2_150 },
  { label: '+50bp',  pnl: -4_380 },
  { label: '+75bp',  pnl: -6_700 },
  { label: '+100bp', pnl: -9_110 },
];

export const BOOK_RISK: BookRisk[] = [
  { book: 'CREDIT-IG',  mv:   842_000, dv01:   620, oas: 112, pnl:   840 },
  { book: 'CREDIT-HY',  mv:   215_000, dv01:   180, oas: 385, pnl:  -320 },
  { book: 'RATES-UST',  mv: 1_240_000, dv01: 1_050, oas:   5, pnl: 1_200 },
  { book: 'RATES-TIPS', mv:   380_000, dv01:   290, oas:  18, pnl:   415 },
  { book: 'MUNI',       mv:   165_000, dv01:   140, oas:  62, pnl:   -85 },
];

export const MARKET_INDICES: MarketIndex[] = [
  { name: 'CDX IG 42',  last:   65.2, chg:  -1.8, ytd: -12.4 },
  { name: 'CDX HY 42',  last:  342.5, chg:  +8.2, ytd: +28.6 },
  { name: 'ITRAXX EUR', last:   72.4, chg:  -2.1, ytd:  -8.2 },
  { name: 'US 10Y',     last:    4.45, chg: +0.03, ytd:  +0.62 },
  { name: 'US 2Y',      last:    4.92, chg: +0.05, ytd:  +0.55 },
  { name: 'VIX',        last:   18.4, chg:  -0.9, ytd:  -2.1 },
  { name: 'MOVE',       last:  112.3, chg:  +3.2, ytd: +18.5 },
  { name: 'SOFR',       last:    5.31, chg: +0.00, ytd:  +0.06 },
];

export const RESEARCH_NOTES: ResearchNote[] = [
  {
    id: 'rn01', date: '2026-06-18', author: 'S. Krishnamurthy', ticker: 'AAPL 3.25 02/30',
    title: 'AAPL — Solid free-cash hedging OAS tightening',
    rating: 'Overweight', oasTarget: 55, oasCurrent: 78, sector: 'Technology',
    summary: 'Strong balance sheet and buyback activity support spread compression. Current OAS offers value vs. sector peers.',
    risks: ['Macro slowdown reducing consumer electronics demand', 'Antitrust regulatory pressure on App Store revenue'],
  },
  {
    id: 'rn02', date: '2026-06-15', author: 'T. Nakamura', ticker: 'T 4.3 02/30',
    title: 'AT&T — Elevated leverage limits upside',
    rating: 'Market Weight', oasTarget: 145, oasCurrent: 138, sector: 'Telecom',
    summary: 'Deleveraging trajectory on track but pace may disappoint. Neutral until leverage approaches 2.5x.',
    risks: ['Higher capex for fibre roll-out', 'Competitive pressure from cable on broadband'],
  },
  {
    id: 'rn03', date: '2026-06-12', author: 'C. Okafor', ticker: 'JPM 4.25 10/27',
    title: 'JPM — Resilient earnings underpin tight spreads',
    rating: 'Overweight', oasTarget: 72, oasCurrent: 88, sector: 'Financials',
    summary: 'DFAST results confirmed solid capital buffer. Short-dated JPM paper attractive on a risk-adjusted basis.',
    risks: ['Credit card delinquency normalisation', 'Regulatory capital requirements increase'],
  },
  {
    id: 'rn04', date: '2026-06-10', author: 'L. Fontaine', ticker: 'XOM 3.482 03/30',
    title: 'XOM — Energy transition uncertainty weighs on long-end',
    rating: 'Underweight', oasTarget: null, oasCurrent: 62, sector: 'Energy',
    summary: 'Positive near-term free cash but long-term stranded-asset risk not priced for 2030 bonds.',
    risks: ['Oil price decline', 'Carbon tax legislation accelerating ahead of schedule'],
  },
  {
    id: 'rn05', date: '2026-06-05', author: 'S. Krishnamurthy', ticker: 'LLY 3.95 03/49',
    title: 'LLY — GLP-1 pipeline supports long-dated spread compression',
    rating: 'Overweight', oasTarget: 85, oasCurrent: 102, sector: 'Healthcare',
    summary: 'Revenue diversification through GLP-1 franchise reduces event risk. 30Y paper looks cheap on the curve.',
    risks: ['Patent cliff on Mounjaro post-2033', 'US drug pricing legislation'],
  },
];

const ORDER_PLAN: { idx: number; side: 'buy' | 'sell'; kind: 'RFQ' | 'Limit'; qty: number; fillPct: number; status: OrderStatus }[] = [
  { idx: 0,  side: 'buy',  kind: 'RFQ',   qty: 6_000_000, fillPct: 1,    status: 'filled' },
  { idx: 2,  side: 'sell', kind: 'RFQ',   qty: 3_000_000, fillPct: 1,    status: 'filled' },
  { idx: 4,  side: 'buy',  kind: 'RFQ',   qty: 10_000_000, fillPct: 1,   status: 'filled' },
  { idx: 5,  side: 'buy',  kind: 'Limit', qty: 7_000_000, fillPct: 0.29, status: 'partial' },
  { idx: 7,  side: 'sell', kind: 'RFQ',   qty: 4_000_000, fillPct: 1,    status: 'filled' },
  { idx: 9,  side: 'buy',  kind: 'RFQ',   qty: 15_000_000, fillPct: 1,   status: 'filled' },
  { idx: 12, side: 'sell', kind: 'Limit', qty: 5_000_000, fillPct: 0,    status: 'pending' },
  { idx: 14, side: 'buy',  kind: 'RFQ',   qty: 8_000_000, fillPct: 0,    status: 'cancelled' },
];

const POSITION_PLAN: { idx: number; qty: number }[] = [
  { idx: 0,  qty:  10_000_000 }, { idx: 2,  qty:  6_000_000 }, { idx: 4,  qty: -4_000_000 },
  { idx: 6,  qty:   8_000_000 }, { idx: 9,  qty:  5_000_000 }, { idx: 11, qty: -2_000_000 },
  { idx: 13, qty:   7_000_000 }, { idx: 15, qty:  3_000_000 },
];

function buildQuote(inst: Instrument, rng: () => number): Quote {
  const mid = 92 + rng() * 16;            // 92–108
  const spread = 0.05 + rng() * 0.2;
  const ytm = inst.coupon + (rng() - 0.5) * 1.5;
  return {
    id: inst.id,
    bid: round3(mid - spread / 2),
    mid: round3(mid),
    ask: round3(mid + spread / 2),
    last: round3(mid),
    ytm: round3(Math.max(0.2, ytm)),
    oas: Math.round(20 + rng() * 180),
    dv01: round2(5 + rng() * 12),
    changePct: round2((rng() - 0.5) * 1.2),
    dir: 'flat',
  };
}

export function seedState(now: number): TerminalState {
  const rng = makeRng(0xc0ffee);
  const instruments = SEED_INSTRUMENTS;
  const quotes: Record<string, Quote> = {};
  const history: Record<string, number[]> = {};
  for (const inst of instruments) {
    const q = buildQuote(inst, rng);
    quotes[inst.id] = q;
    history[inst.id] = Array.from({ length: 40 }, (_, k) => round3(q.mid + (rng() - 0.5) * 0.6 + Math.sin(k / 6) * 0.3));
  }
  const orders: Order[] = ORDER_PLAN.map((o, k) => {
    const inst = instruments[o.idx];
    const q = quotes[inst.id];
    return {
      id: `o${k + 1}`, instrumentId: inst.id, ticker: inst.ticker, side: o.side, kind: o.kind,
      qty: o.qty, filled: Math.round(o.qty * o.fillPct), price: round3(q.mid), ytm: q.ytm,
      status: o.status, ts: now - k * 47 * 60_000,
    };
  });
  const positions: Position[] = POSITION_PLAN.map((p) => {
    const inst = instruments[p.idx];
    const q = quotes[inst.id];
    const avgCost = round3(q.mid - (rng() - 0.5) * 2);
    return { instrumentId: inst.id, ticker: inst.ticker, qty: p.qty, avgCost, marketValue: Math.round((p.qty * q.mid) / 100), unrealizedPnl: Math.round((p.qty * (q.mid - avgCost)) / 100), dv01: round2((Math.abs(p.qty) / 1_000_000) * q.dv01) };
  });
  const curve = [1, 2, 3, 5, 7, 10, 20, 30].map((tenor) => ({ tenor, yield: round3(1.6 + Math.log(tenor + 1) * 1.15 + rng() * 0.1) }));
  return { instruments, quotes, orders, positions, curve, history };
}


function round2(n: number) { return Math.round(n * 100) / 100; }
function round3(n: number) { return Math.round(n * 1000) / 1000; }
