export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'pending' | 'partial' | 'filled' | 'cancelled';
export type OrderKind = 'RFQ' | 'Limit';
export type Direction = 'up' | 'down' | 'flat';

export interface Instrument {
  id: string;          // stable row id
  cusip: string;
  ticker: string;
  description: string;
  coupon: number;      // %
  maturity: string;    // ISO date
  rating: string;      // e.g. 'AA', 'BBB+'
  sector: string;
  currency: string;    // 'USD'
  ytw: number;         // yield to worst, %
  gSpd: number;        // G-spread, bps
  cvx: number;         // convexity
  seniority: string;   // e.g. 'Senior Unsecured', 'Senior Secured', 'Subordinated'
  axes: string;        // dealer axes, e.g. 'GS MS'
  ratingClass: 'aaa' | 'aa' | 'a' | 'bbb' | 'hy';
}

export interface Quote {
  id: string;          // === Instrument.id
  bid: number;
  mid: number;
  ask: number;
  last: number;
  ytm: number;         // yield to maturity, %
  oas: number;         // bps
  dv01: number;
  changePct: number;   // session % change
  dir: Direction;      // last tick direction (drives flash)
}

export interface Order {
  id: string;
  instrumentId: string;
  ticker: string;
  side: OrderSide;
  kind: OrderKind;     // RFQ or Limit
  qty: number;         // order face (USD)
  filled: number;      // filled face (USD)
  price: number;
  ytm: number;         // %
  status: OrderStatus;
  ts: number;          // epoch ms (passed in, never Date.now() in reducers)
}

export interface Position {
  instrumentId: string;
  ticker: string;
  qty: number;
  avgCost: number;
  marketValue: number;
  unrealizedPnl: number;
  dv01: number;
}

export interface TerminalState {
  instruments: Instrument[];
  quotes: Record<string, Quote>;   // keyed by id
  orders: Order[];
  positions: Position[];
  /** Yield-curve points {tenorYears, yield%} for the Analytics chart. */
  curve: { tenor: number; yield: number }[];
  /** Rolling price history per instrument id (last N mids) for PriceChart. */
  history: Record<string, number[]>;
}

export interface BookRisk {
  book: string;       // e.g. 'CREDIT-IG'
  mv: number;         // market value $M
  dv01: number;       // $k
  oas: number;        // bps
  pnl: number;        // $k, session
}

export interface ResearchNote {
  id: string;
  date: string;       // ISO date
  author: string;
  ticker: string;
  title: string;
  rating: 'Overweight' | 'Underweight' | 'Market Weight';
  oasTarget: number | null;
  oasCurrent: number;
  sector: string;
  summary: string;
  risks: string[];
}

export interface RateScenario {
  label: string;   // e.g. '-100bp'
  pnl: number;     // $k
}

export interface CurvePoint {
  tenor: number;   // years
  today: number;   // yield %
  week: number;    // yield % a week ago
  month: number;   // yield % a month ago
}

export interface MarketIndex {
  name: string;
  last: number;
  chg: number;    // session change
  ytd: number;    // YTD %
}
