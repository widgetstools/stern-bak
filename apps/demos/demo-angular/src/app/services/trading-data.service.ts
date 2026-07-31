import { Injectable } from '@angular/core';

// ── Interfaces ──
export interface Bond {
  id: string;
  ticker: string;
  issuer: string;
  cpn: number;
  mat: string;
  cusip: string;
  rtg: string;
  rtgClass: 'aaa' | 'aa' | 'a' | 'bbb' | 'hy';
  sector: string;
  seniority: string;
  bid: number;
  ask: number;
  ytm: number;
  ytw: number;
  oas: number;
  gSpd: number;
  dur: number;
  dv01: number;
  cvx: number;
  face: string;
  side: 'Buy' | 'Sell';
  axes: string;
}
export interface LadderRung {
  cpn: number;
  maturity: string;
  bid: number;
  ask: number;
  ytm: number;
  spread: number;
  amtOut: string;
  axes: string;
  pct: number;
}
export interface Trade {
  id: string;
  time: string;
  bond: string;
  side: 'B' | 'S';
  size: string;
  price: number;
  ytm: number;
  status: 'Filled' | 'Partial' | 'Pending' | 'Cancelled';
}
export interface WatchItem {
  label: string;
  ytm: number;
  change: number;
  alert: boolean;
}
export interface RfqQuote {
  dealer: string;
  bid: number;
  ask: number;
  bidSize: string;
  askSize: string;
  ts: number;
  status: 'live' | 'stale' | 'done';
}
export interface RfqRequest {
  id: string;
  bond: string;
  size: string;
  side: 'Buy' | 'Sell';
  status: 'pending' | 'quoted' | 'done' | 'cancelled';
  quotes: RfqQuote[];
  createdAt: number;
}
export interface OrderBookLevel {
  price: number;
  qty: number;
  total: number;
  pct: number;
}
export interface TickerItem {
  label: string;
  value: string;
  change: string;
  up: boolean;
}
export interface Order {
  id: string;
  time: string;
  bond: string;
  side: string;
  qty: string;
  type: string;
  px: number;
  ytm: number;
  status: 'Filled' | 'Partial' | 'Pending' | 'Cancelled';
  filled: string;
}
export interface ResearchNote {
  id: string;
  date: string;
  author: string;
  ticker: string;
  title: string;
  body: string;
  rating: string;
  target: number | null;
  prev: number | null;
  sector: string;
}
export interface RiskPosition {
  book: string;
  bonds: number;
  mv: number;
  dv01: number;
  oas: number;
  pnl: number;
}
export interface MarketIndex {
  name: string;
  val: number;
  chg: number;
  ytd: string;
}

// ── Data ──
export const BONDS: Bond[] = [
  {
    id: 'b1',
    ticker: 'UST',
    issuer: 'US Treasury',
    cpn: 4.625,
    mat: '06/26',
    cusip: '912828ZT0',
    rtg: 'Aaa',
    rtgClass: 'aaa',
    sector: 'Government',
    seniority: 'Sovereign',
    bid: 100.072,
    ask: 100.197,
    ytm: 4.52,
    ytw: 4.52,
    oas: 0,
    gSpd: 8,
    dur: 1.85,
    dv01: 185,
    cvx: 0.04,
    face: '10MM',
    side: 'Buy',
    axes: '0B/00',
  },
  {
    id: 'b2',
    ticker: 'UST',
    issuer: 'US Treasury',
    cpn: 4.5,
    mat: '09/27',
    cusip: '912828CHT1',
    rtg: 'Aaa',
    rtgClass: 'aaa',
    sector: 'Government',
    seniority: 'Sovereign',
    bid: 99.933,
    ask: 100.058,
    ytm: 4.55,
    ytw: 4.55,
    oas: 0,
    gSpd: 12,
    dur: 2.82,
    dv01: 282,
    cvx: 0.09,
    face: '15MM',
    side: 'Buy',
    axes: '0B/00',
  },
  {
    id: 'b3',
    ticker: 'UST',
    issuer: 'US Treasury',
    cpn: 4.25,
    mat: '03/29',
    cusip: '912828CJN2',
    rtg: 'Aaa',
    rtgClass: 'aaa',
    sector: 'Government',
    seniority: 'Sovereign',
    bid: 99.241,
    ask: 99.366,
    ytm: 4.38,
    ytw: 4.38,
    oas: 0,
    gSpd: 18,
    dur: 4.52,
    dv01: 452,
    cvx: 0.22,
    face: '8MM',
    side: 'Sell',
    axes: '0B/00',
  },
  {
    id: 'b4',
    ticker: 'UST',
    issuer: 'US Treasury',
    cpn: 4.0,
    mat: '02/31',
    cusip: '912828CKR2',
    rtg: 'Aaa',
    rtgClass: 'aaa',
    sector: 'Government',
    seniority: 'Sovereign',
    bid: 98.587,
    ask: 98.712,
    ytm: 4.25,
    ytw: 4.25,
    oas: 0,
    gSpd: 22,
    dur: 6.21,
    dv01: 621,
    cvx: 0.42,
    face: '12MM',
    side: 'Buy',
    axes: '0B/00',
  },
  {
    id: 'b5',
    ticker: 'UST',
    issuer: 'US Treasury',
    cpn: 4.375,
    mat: '05/34',
    cusip: '912810TM0',
    rtg: 'Aaa',
    rtgClass: 'aaa',
    sector: 'Government',
    seniority: 'Sovereign',
    bid: 97.85,
    ask: 97.975,
    ytm: 4.6,
    ytw: 4.6,
    oas: 0,
    gSpd: 35,
    dur: 8.45,
    dv01: 845,
    cvx: 0.78,
    face: '5MM',
    side: 'Buy',
    axes: '0B/00',
  },
  {
    id: 'b6',
    ticker: 'UST',
    issuer: 'US Treasury',
    cpn: 4.75,
    mat: '02/54',
    cusip: '912810TV0',
    rtg: 'Aaa',
    rtgClass: 'aaa',
    sector: 'Government',
    seniority: 'Sovereign',
    bid: 96.799,
    ask: 97.049,
    ytm: 4.95,
    ytw: 4.95,
    oas: 0,
    gSpd: 42,
    dur: 17.2,
    dv01: 1720,
    cvx: 4.12,
    face: '3MM',
    side: 'Sell',
    axes: '0B/00',
  },
  {
    id: 'b7',
    ticker: 'AAPL',
    issuer: 'Apple Inc',
    cpn: 2.05,
    mat: '09/26',
    cusip: '037833AK6',
    rtg: 'Aa1',
    rtgClass: 'aa',
    sector: 'Technology',
    seniority: 'Sr Unsec',
    bid: 98.861,
    ask: 98.986,
    ytm: 2.35,
    ytw: 2.35,
    oas: 18,
    gSpd: 15,
    dur: 0.42,
    dv01: 42,
    cvx: 0.01,
    face: '5MM',
    side: 'Buy',
    axes: '5B/00',
  },
  {
    id: 'b8',
    ticker: 'AAPL',
    issuer: 'Apple Inc',
    cpn: 3.25,
    mat: '02/29',
    cusip: '037833DV8',
    rtg: 'Aa1',
    rtgClass: 'aa',
    sector: 'Technology',
    seniority: 'Sr Unsec',
    bid: 99.232,
    ask: 99.482,
    ytm: 3.42,
    ytw: 3.42,
    oas: 65,
    gSpd: 52,
    dur: 2.68,
    dv01: 268,
    cvx: 0.08,
    face: '8MM',
    side: 'Buy',
    axes: '8B/00',
  },
  {
    id: 'b9',
    ticker: 'AAPL',
    issuer: 'Apple Inc',
    cpn: 4.1,
    mat: '08/42',
    cusip: '037833EQ8',
    rtg: 'Aa1',
    rtgClass: 'aa',
    sector: 'Technology',
    seniority: 'Sr Unsec',
    bid: 93.933,
    ask: 94.183,
    ytm: 4.32,
    ytw: 4.32,
    oas: 132,
    gSpd: 118,
    dur: 12.5,
    dv01: 1250,
    cvx: 2.15,
    face: '3MM',
    side: 'Sell',
    axes: '00/3S',
  },
  {
    id: 'b10',
    ticker: 'JPM',
    issuer: 'JPMorgan Chase',
    cpn: 4.5,
    mat: '01/27',
    cusip: '46647PBY1',
    rtg: 'A2',
    rtgClass: 'a',
    sector: 'Financials',
    seniority: 'Sr Unsec',
    bid: 101.315,
    ask: 101.565,
    ytm: 3.85,
    ytw: 3.85,
    oas: 58,
    gSpd: 45,
    dur: 0.78,
    dv01: 78,
    cvx: 0.01,
    face: '10MM',
    side: 'Buy',
    axes: '10B/00',
  },
  {
    id: 'b11',
    ticker: 'JPM',
    issuer: 'JPMorgan Chase',
    cpn: 5.04,
    mat: '01/31',
    cusip: '46647PCR5',
    rtg: 'A2',
    rtgClass: 'a',
    sector: 'Financials',
    seniority: 'Sr Unsec',
    bid: 102.32,
    ask: 102.57,
    ytm: 4.65,
    ytw: 4.65,
    oas: 98,
    gSpd: 82,
    dur: 4.12,
    dv01: 412,
    cvx: 0.19,
    face: '6MM',
    side: 'Buy',
    axes: '6B/6S',
  },
  {
    id: 'b12',
    ticker: 'JPM',
    issuer: 'JPMorgan Chase',
    cpn: 5.35,
    mat: '06/35',
    cusip: '46647PCX2',
    rtg: 'A2',
    rtgClass: 'a',
    sector: 'Financials',
    seniority: 'Sr Unsec',
    bid: 99.574,
    ask: 99.824,
    ytm: 5.12,
    ytw: 5.12,
    oas: 125,
    gSpd: 108,
    dur: 7.85,
    dv01: 785,
    cvx: 0.72,
    face: '4MM',
    side: 'Sell',
    axes: '00/4S',
  },
  {
    id: 'b13',
    ticker: 'MSFT',
    issuer: 'Microsoft Corp',
    cpn: 2.4,
    mat: '08/27',
    cusip: '594918CE2',
    rtg: 'Aaa',
    rtgClass: 'aaa',
    sector: 'Technology',
    seniority: 'Sr Unsec',
    bid: 99.159,
    ask: 99.284,
    ytm: 2.78,
    ytw: 2.78,
    oas: 22,
    gSpd: 18,
    dur: 1.28,
    dv01: 128,
    cvx: 0.02,
    face: '7MM',
    side: 'Buy',
    axes: '7B/00',
  },
  {
    id: 'b14',
    ticker: 'MSFT',
    issuer: 'Microsoft Corp',
    cpn: 3.45,
    mat: '08/36',
    cusip: '594918BX1',
    rtg: 'Aaa',
    rtgClass: 'aaa',
    sector: 'Technology',
    seniority: 'Sr Unsec',
    bid: 96.433,
    ask: 96.683,
    ytm: 3.82,
    ytw: 3.82,
    oas: 85,
    gSpd: 72,
    dur: 8.92,
    dv01: 892,
    cvx: 0.92,
    face: '4MM',
    side: 'Sell',
    axes: '00/4S',
  },
  {
    id: 'b15',
    ticker: 'JNJ',
    issuer: 'Johnson & Johnson',
    cpn: 3.4,
    mat: '01/29',
    cusip: '478160BW5',
    rtg: 'Aa3',
    rtgClass: 'aa',
    sector: 'Healthcare',
    seniority: 'Sr Unsec',
    bid: 99.892,
    ask: 100.142,
    ytm: 3.62,
    ytw: 3.62,
    oas: 48,
    gSpd: 38,
    dur: 2.55,
    dv01: 255,
    cvx: 0.07,
    face: '6MM',
    side: 'Buy',
    axes: '6B/00',
  },
  {
    id: 'b16',
    ticker: 'PG',
    issuer: 'Procter & Gamble',
    cpn: 3.0,
    mat: '03/30',
    cusip: '742718GG2',
    rtg: 'Aa3',
    rtgClass: 'aa',
    sector: 'Consumer',
    seniority: 'Sr Unsec',
    bid: 98.036,
    ask: 98.286,
    ytm: 3.45,
    ytw: 3.45,
    oas: 52,
    gSpd: 42,
    dur: 3.82,
    dv01: 382,
    cvx: 0.16,
    face: '5MM',
    side: 'Sell',
    axes: '00/5S',
  },
  {
    id: 'b17',
    ticker: 'BAC',
    issuer: 'Bank of America',
    cpn: 5.2,
    mat: '04/29',
    cusip: '060505HN5',
    rtg: 'A2',
    rtgClass: 'a',
    sector: 'Financials',
    seniority: 'Sr Unsec',
    bid: 101.445,
    ask: 101.695,
    ytm: 4.82,
    ytw: 4.82,
    oas: 108,
    gSpd: 95,
    dur: 3.95,
    dv01: 395,
    cvx: 0.18,
    face: '8MM',
    side: 'Buy',
    axes: '8B/4S',
  },
  {
    id: 'b18',
    ticker: 'GS',
    issuer: 'Goldman Sachs',
    cpn: 5.8,
    mat: '03/32',
    cusip: '38141GZD1',
    rtg: 'Baa1',
    rtgClass: 'bbb',
    sector: 'Financials',
    seniority: 'Sr Unsec',
    bid: 103.22,
    ask: 103.47,
    ytm: 5.34,
    ytw: 5.34,
    oas: 155,
    gSpd: 138,
    dur: 5.82,
    dv01: 582,
    cvx: 0.38,
    face: '5MM',
    side: 'Sell',
    axes: '00/5S',
  },
  {
    id: 'b19',
    ticker: 'T',
    issuer: 'AT&T Inc',
    cpn: 4.35,
    mat: '06/29',
    cusip: '00206RDM4',
    rtg: 'Baa2',
    rtgClass: 'bbb',
    sector: 'Telecom',
    seniority: 'Sr Unsec',
    bid: 99.182,
    ask: 99.432,
    ytm: 4.48,
    ytw: 4.48,
    oas: 118,
    gSpd: 104,
    dur: 4.28,
    dv01: 428,
    cvx: 0.22,
    face: '4MM',
    side: 'Buy',
    axes: '4B/00',
  },
  {
    id: 'b20',
    ticker: 'F',
    issuer: 'Ford Motor Credit',
    cpn: 6.125,
    mat: '03/29',
    cusip: '345397BE1',
    rtg: 'Ba2',
    rtgClass: 'hy',
    sector: 'Consumer',
    seniority: 'Sr Unsec',
    bid: 98.05,
    ask: 98.8,
    ytm: 6.44,
    ytw: 6.44,
    oas: 298,
    gSpd: 285,
    dur: 3.92,
    dv01: 392,
    cvx: 0.19,
    face: '3MM',
    side: 'Buy',
    axes: '3B/3S',
  },
];

export const UST_LADDER: LadderRung[] = [
  {
    cpn: 4.625,
    maturity: '06/30/2026',
    bid: 100.072,
    ask: 100.197,
    ytm: 4.52,
    spread: 0,
    amtOut: '45.0B',
    axes: '0B/00',
    pct: 90,
  },
  {
    cpn: 4.5,
    maturity: '09/30/2027',
    bid: 99.933,
    ask: 100.058,
    ytm: 4.55,
    spread: 0,
    amtOut: '42.0B',
    axes: '0B/00',
    pct: 84,
  },
  {
    cpn: 4.25,
    maturity: '03/31/2029',
    bid: 99.241,
    ask: 99.366,
    ytm: 4.38,
    spread: 0,
    amtOut: '40.0B',
    axes: '0B/00',
    pct: 80,
  },
  {
    cpn: 4.0,
    maturity: '02/15/2031',
    bid: 98.587,
    ask: 98.712,
    ytm: 4.25,
    spread: 0,
    amtOut: '38.0B',
    axes: '0B/00',
    pct: 76,
  },
  {
    cpn: 4.375,
    maturity: '05/15/2034',
    bid: 97.85,
    ask: 97.975,
    ytm: 4.6,
    spread: 0,
    amtOut: '25.0B',
    axes: '0B/00',
    pct: 50,
  },
  {
    cpn: 4.75,
    maturity: '02/15/2054',
    bid: 96.799,
    ask: 97.049,
    ytm: 4.95,
    spread: 0,
    amtOut: '22.0B',
    axes: '0B/00',
    pct: 44,
  },
];

export const YC_TENORS = ['1M', '3M', '6M', '1Y', '2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y'];
export const YC_TODAY = [5.32, 5.28, 5.2, 5.05, 4.68, 4.59, 4.29, 4.36, 4.27, 4.35, 4.41];
export const YC_WEEK = [5.3, 5.25, 5.18, 5.02, 4.72, 4.64, 4.4, 4.45, 4.38, 4.43, 4.5];
export const YC_MONTH = [5.25, 5.22, 5.15, 4.98, 4.8, 4.72, 4.48, 4.52, 4.44, 4.5, 4.56];
export const YC_CHART_DATA = YC_TENORS.map((t, i) => ({
  tenor: t,
  today: YC_TODAY[i],
  week: YC_WEEK[i],
  month: YC_MONTH[i],
}));

export const INITIAL_TRADES: Trade[] = [
  {
    id: 't1',
    time: '14:32',
    bond: 'JPM 5.04 01/31',
    side: 'B',
    size: '$5MM',
    price: 102.32,
    ytm: 4.65,
    status: 'Filled',
  },
  {
    id: 't2',
    time: '14:28',
    bond: 'AAPL 3.25 02/29',
    side: 'S',
    size: '$3MM',
    price: 99.241,
    ytm: 3.42,
    status: 'Filled',
  },
  {
    id: 't3',
    time: '14:21',
    bond: 'UST 4.375 05/34',
    side: 'B',
    size: '$10MM',
    price: 97.85,
    ytm: 4.6,
    status: 'Filled',
  },
  {
    id: 't4',
    time: '14:15',
    bond: 'MSFT 2.40 08/27',
    side: 'B',
    size: '$2MM',
    price: 99.159,
    ytm: 2.78,
    status: 'Partial',
  },
  {
    id: 't5',
    time: '13:58',
    bond: 'JNJ 3.40 01/29',
    side: 'S',
    size: '$4MM',
    price: 99.892,
    ytm: 3.62,
    status: 'Filled',
  },
  {
    id: 't6',
    time: '13:44',
    bond: 'UST 4.50 09/27',
    side: 'B',
    size: '$15MM',
    price: 99.933,
    ytm: 4.55,
    status: 'Filled',
  },
];

export const WATCHLIST: WatchItem[] = [
  { label: 'T 4.625 06/26', ytm: 4.52, change: +0.03, alert: false },
  { label: 'AAPL 3.25 02/29', ytm: 3.42, change: -0.05, alert: true },
  { label: 'JPM 5.04 01/31', ytm: 4.65, change: +0.12, alert: false },
  { label: 'UST 10Y Bench', ytm: 4.27, change: -0.08, alert: true },
  { label: 'CDX IG S43 5Y', ytm: 52.9, change: +0.2, alert: false },
  { label: 'MSFT 3.45 08/36', ytm: 3.82, change: +0.09, alert: true },
];

export const OAS_DATA = [
  { name: 'UST 4.625', oas: 0, color: '#3b82f6' },
  { name: 'MSFT 2.40', oas: 22, color: '#3b82f6' },
  { name: 'AAPL 2.05', oas: 18, color: '#3b82f6' },
  { name: 'JNJ 3.40', oas: 48, color: '#22d3ee' },
  { name: 'PG 3.00', oas: 52, color: '#22d3ee' },
  { name: 'JPM 4.50', oas: 58, color: '#22d3ee' },
  { name: 'MSFT 3.45', oas: 85, color: '#ff8c42' },
  { name: 'AAPL 4.10', oas: 132, color: '#ff8c42' },
  { name: 'JPM 5.04', oas: 98, color: '#ff8c42' },
  { name: 'JPM 5.35', oas: 125, color: '#ff4d6d' },
];
export const SPREADS = [
  { label: '2s5s', value: '-39 bp', change: '+4', up: true },
  { label: '2s10s', value: '-41 bp', change: '+3', up: true },
  { label: '5s30s', value: '+12 bp', change: '-2', up: false },
  { label: 'IG CDX', value: '52.9 bp', change: '+0.20', up: true },
  { label: 'HY CDX', value: '339.6 bp', change: '-4.81', up: false },
  { label: 'MOVE', value: '97.4', change: '-1.2', up: false },
];
export const SENSITIVITY = [
  { label: '-100bp', value: '+$18,420', pct: 100, positive: true },
  { label: '-50bp', value: '+$9,210', pct: 50, positive: true },
  { label: '-25bp', value: '+$4,605', pct: 25, positive: true },
  { label: '+25bp', value: '-$4,551', pct: 25, positive: false },
  { label: '+50bp', value: '-$9,022', pct: 49, positive: false },
  { label: '+100bp', value: '-$17,890', pct: 97, positive: false },
  { label: '+200bp', value: '-$34,920', pct: 100, positive: false },
];
export const TICKER_STRIP: TickerItem[] = [
  { label: 'UST 2Y', value: '4.68', change: '-0.01', up: false },
  { label: 'UST 3Y', value: '4.59', change: '+0.05', up: true },
  { label: 'UST 5Y', value: '4.29', change: '-0.11', up: false },
  { label: 'UST 7Y', value: '4.36', change: '+0.05', up: true },
  { label: 'UST 10Y', value: '4.27', change: '+0.07', up: true },
  { label: 'UST 20Y', value: '4.35', change: '-0.08', up: false },
  { label: 'UST 30Y', value: '4.41', change: '-0.09', up: false },
  { label: 'CDX IG', value: '52.90', change: '+0.20', up: true },
  { label: 'CDX HY', value: '339.59', change: '-4.81', up: false },
  { label: 'SOFR', value: '5.33', change: '0.00', up: true },
  { label: 'MOVE', value: '97.4', change: '-1.2', up: false },
];
export const DEALERS = ['GS', 'MS', 'JPM', 'BAML', 'CITI', 'DB', 'BARC', 'UBS'];
export const RISK_POSITIONS: RiskPosition[] = [
  { book: 'CREDIT-IG', bonds: 8, mv: 18.4, dv01: 6240, oas: 68, pnl: +142 },
  { book: 'CREDIT-HY', bonds: 4, mv: 7.2, dv01: 2180, oas: 315, pnl: -38 },
  { book: 'RATES-UST', bonds: 6, mv: 14.8, dv01: 7420, oas: 0, pnl: +88 },
  { book: 'RATES-TIPS', bonds: 3, mv: 5.6, dv01: 1920, oas: 12, pnl: +22 },
  { book: 'MUNI', bonds: 5, mv: 8.2, dv01: 2460, oas: 42, pnl: +30 },
];
export const MARKET_INDICES: MarketIndex[] = [
  { name: 'Bloomberg US Agg', val: 95.82, chg: +0.14, ytd: '+2.1%' },
  { name: 'Bloomberg Corp IG', val: 112.44, chg: +0.22, ytd: '+3.4%' },
  { name: 'Bloomberg HY', val: 98.65, chg: -0.18, ytd: '+5.2%' },
  { name: 'Bloomberg Muni', val: 103.21, chg: +0.08, ytd: '+1.8%' },
  { name: 'Bloomberg MBS', val: 97.34, chg: +0.12, ytd: '+2.6%' },
  { name: 'ICE BofA MOVE Index', val: 97.4, chg: -1.2, ytd: '-8.3%' },
  { name: 'CDX IG S43 5Y', val: 52.9, chg: +0.2, ytd: '+2.4bp' },
  { name: 'CDX HY S43 5Y', val: 339.59, chg: -4.81, ytd: '-18bp' },
];
export const RESEARCH_NOTES: ResearchNote[] = [
  {
    id: 'r1',
    date: 'Apr 4',
    author: 'Credit Strategy',
    ticker: 'JPM',
    title: 'JPM Q1 Earnings Preview - Spread Tightening Expected',
    body: 'We expect JPM credit spreads to tighten 8-12bp post-earnings on strong NII guidance. Overweight 5Y senior bonds.',
    rating: 'Overweight',
    target: 92,
    prev: 100,
    sector: 'Financials',
  },
  {
    id: 'r2',
    date: 'Apr 3',
    author: 'Rates Research',
    ticker: 'UST',
    title: 'Fed Dot Plot Divergence - Duration Positioning',
    body: 'The 2s10s inversion at -41bp signals a rates regime shift. Reduce duration in 5-10Y sector, rotate to front-end.',
    rating: 'Underweight',
    target: null,
    prev: null,
    sector: 'Government',
  },
  {
    id: 'r3',
    date: 'Apr 2',
    author: 'IG Credit',
    ticker: 'AAPL',
    title: 'Apple Inc - Initiating at Overweight',
    body: 'AAPL balance sheet strength supports tight spread regime. OAS at 132bp on the 2042 represents value vs. sector.',
    rating: 'Overweight',
    target: 118,
    prev: 132,
    sector: 'Technology',
  },
  {
    id: 'r4',
    date: 'Apr 1',
    author: 'HY Strategy',
    ticker: 'F',
    title: 'Ford Motor Credit - Risk-Reward Improving',
    body: 'Following the Ba2 upgrade cycle, FCR spreads lagged broader HY tightening. Target OAS 275bp in 12M.',
    rating: 'Market Weight',
    target: 275,
    prev: 298,
    sector: 'Consumer',
  },
  {
    id: 'r5',
    date: 'Mar 31',
    author: 'Macro',
    ticker: 'ALL',
    title: 'Q2 2026 FI Outlook - Carry Dominant Theme',
    body: 'With rate vol subsiding (MOVE <100), carry strategies in IG and selective HY offer best risk-adjusted returns.',
    rating: 'Overweight',
    target: null,
    prev: null,
    sector: 'Cross-Asset',
  },
];
export const INITIAL_ORDERS: Order[] = [
  {
    id: 'o1',
    time: '14:35',
    bond: 'JPM 5.04 01/31',
    side: 'Buy',
    qty: '$6MM',
    type: 'RFQ',
    px: 102.32,
    ytm: 4.65,
    status: 'Filled',
    filled: '$6MM',
  },
  {
    id: 'o2',
    time: '14:28',
    bond: 'AAPL 3.25 02/29',
    side: 'Sell',
    qty: '$3MM',
    type: 'RFQ',
    px: 99.241,
    ytm: 3.42,
    status: 'Filled',
    filled: '$3MM',
  },
  {
    id: 'o3',
    time: '14:15',
    bond: 'UST 4.375 05/34',
    side: 'Buy',
    qty: '$10MM',
    type: 'RFQ',
    px: 97.85,
    ytm: 4.6,
    status: 'Filled',
    filled: '$10MM',
  },
  {
    id: 'o4',
    time: '14:02',
    bond: 'MSFT 2.40 08/27',
    side: 'Buy',
    qty: '$7MM',
    type: 'Limit',
    px: 99.15,
    ytm: 2.79,
    status: 'Partial',
    filled: '$2MM',
  },
  {
    id: 'o5',
    time: '13:58',
    bond: 'JNJ 3.40 01/29',
    side: 'Sell',
    qty: '$4MM',
    type: 'RFQ',
    px: 99.892,
    ytm: 3.62,
    status: 'Filled',
    filled: '$4MM',
  },
  {
    id: 'o6',
    time: '13:44',
    bond: 'UST 4.50 09/27',
    side: 'Buy',
    qty: '$15MM',
    type: 'RFQ',
    px: 99.933,
    ytm: 4.55,
    status: 'Filled',
    filled: '$15MM',
  },
  {
    id: 'o7',
    time: '13:30',
    bond: 'GS 5.80 03/32',
    side: 'Sell',
    qty: '$5MM',
    type: 'Limit',
    px: 103.2,
    ytm: 5.34,
    status: 'Pending',
    filled: '$0',
  },
  {
    id: 'o8',
    time: '13:15',
    bond: 'BAC 5.20 04/29',
    side: 'Buy',
    qty: '$8MM',
    type: 'RFQ',
    px: 0,
    ytm: 0,
    status: 'Cancelled',
    filled: '$0',
  },
];

// ── Economic Calendar ──
export const ECON_EVENTS = [
  {
    time: '08:30',
    event: 'Initial Jobless Claims',
    actual: '212K',
    prev: '215K',
    exp: '214K',
    impact: 'Low',
  },
  {
    time: '10:00',
    event: 'ISM Services PMI',
    actual: '---',
    prev: '53.5',
    exp: '53.2',
    impact: 'Med',
  },
  { time: '14:00', event: 'FOMC Minutes', actual: '---', prev: '---', exp: '---', impact: 'High' },
  {
    time: 'Tmrw',
    event: 'Non-Farm Payrolls',
    actual: '---',
    prev: '275K',
    exp: '240K',
    impact: 'High',
  },
];

// ── Scenario data ──
export const SCENARIO_DATA = [
  { scenario: '-100bp', credit: +284, rates: +742, total: +1026 },
  { scenario: '-50bp', credit: +142, rates: +371, total: +513 },
  { scenario: '-25bp', credit: +71, rates: +185, total: +256 },
  { scenario: 'Base', credit: 0, rates: 0, total: 0 },
  { scenario: '+25bp', credit: -70, rates: -183, total: -253 },
  { scenario: '+50bp', credit: -138, rates: -364, total: -502 },
  { scenario: '+100bp', credit: -272, rates: -720, total: -992 },
];

// ── VaR trend ──
export const VAR_DATA = Array.from({ length: 30 }, (_, i) => ({
  day: `D-${30 - i}`,
  var: -(Math.random() * 180 + 120),
}));

// ── PnL Attribution ──
export const PNL_DATA = [
  { attr: 'Carry', pnl: +188, cum: 188 },
  { attr: 'Spread', pnl: +142, cum: 330 },
  { attr: 'Rates', pnl: +88, cum: 418 },
  { attr: 'FX', pnl: -22, cum: 396 },
  { attr: 'Costs', pnl: -34, cum: 362 },
];

// ── Duration Buckets ──
export const DURATION_BUCKETS = [
  { label: '0-1Y', count: 3, dv01: 305, pct: 6 },
  { label: '1-3Y', count: 4, dv01: 1010, pct: 19 },
  { label: '3-5Y', count: 5, dv01: 2180, pct: 41 },
  { label: '5-7Y', count: 3, dv01: 1890, pct: 36 },
  { label: '7-10Y', count: 2, dv01: 2040, pct: 38 },
  { label: '10Y+', count: 3, dv01: 2995, pct: 56 },
];
export const BUCKET_RANGES: [number, number][] = [
  [0, 1],
  [1, 3],
  [3, 5],
  [5, 7],
  [7, 10],
  [10, 50],
];

// ── Sector Allocation ──
export const SECTOR_ALLOC = [
  { sector: 'Government', pct: 27.3, mv: 14.8, bonds: 6 },
  { sector: 'Technology', pct: 22.1, mv: 12.0, bonds: 4 },
  { sector: 'Financials', pct: 21.7, mv: 11.8, bonds: 5 },
  { sector: 'Healthcare', pct: 10.3, mv: 5.6, bonds: 1 },
  { sector: 'Consumer', pct: 9.8, mv: 5.3, bonds: 2 },
  { sector: 'Telecom', pct: 8.8, mv: 4.7, bonds: 1 },
];
export const SECTOR_COLORS = [
  '#3b82f6',
  '#22d3ee',
  '#a855f7',
  'var(--ds-accent-positive)',
  '#ff8c42',
  '#e86a1c',
];

// ── Historical OAS ──
export const HIST_OAS = Array.from({ length: 60 }, (_, i) => {
  const d = new Date(2026, 3, 4);
  d.setDate(d.getDate() - 59 + i);
  return {
    date: `${d.getMonth() + 1}/${d.getDate()}`,
    ig: +(52 + Math.sin(i / 8) * 8 + (Math.random() - 0.5) * 3).toFixed(1),
    hy: +(340 + Math.sin(i / 6) * 25 + (Math.random() - 0.5) * 8).toFixed(1),
  };
});

// ── Intraday data generator ──
function makeIntraday(base: number, n = 80) {
  let v = base;
  return Array.from({ length: n }, (_, i) => ({
    t: `${9 + Math.floor((i * 6.5) / n)}:${String(Math.floor((((i * 6.5) / n) % 1) * 60)).padStart(2, '0')}`,
    v: +((v += (Math.random() - 0.5) * 0.08), v).toFixed(3),
  }));
}
export const INTRADAY: Record<string, { t: string; v: number }[]> = {
  'UST 10Y': makeIntraday(4.27),
  'CDX IG': makeIntraday(52.9),
  'CDX HY': makeIntraday(339.6),
  SOFR: makeIntraday(5.33),
};

@Injectable({ providedIn: 'root' })
export class TradingDataService {
  getBonds(): Bond[] {
    return BONDS;
  }
  getOrders(): Order[] {
    return INITIAL_ORDERS;
  }
  getTickerStrip(): TickerItem[] {
    return TICKER_STRIP;
  }
}
