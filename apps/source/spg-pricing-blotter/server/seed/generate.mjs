/**
 * Deterministic SPG position seed — writes `spg-positions.json` next to
 * this script. Run `node server/seed/generate.mjs` to regenerate; the
 * output is COMMITTED so the server seeds identically on every machine
 * (the repo rule: reproducibility rests on pinned inputs, not on
 * whatever Math.random did at install time).
 *
 * The book is structured products: CLO / CMBS / RMBS / ABS / CDO deals,
 * each with a tranche stack, priced in points (per-100). `price` and
 * `priorPrice` are the trader-owned marks the demo edits; `marketValue`
 * and `priceChangePct` are SERVER-derived from them (see db.mjs), so the
 * seed stores the inputs and the derivations are computed on load.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROWS = 2500;
const SEED = 0x5b0715;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (lo, hi) => lo + rnd() * (hi - lo);
const round = (n, dp) => Number(n.toFixed(dp));

const ASSET_CLASSES = [
  { assetClass: 'CLO', deals: ['MAGNE', 'OCTAG', 'DRSLF', 'BALLY', 'VOYA', 'CGMS', 'OAKC', 'ARES'], tranches: ['A1', 'A2', 'B', 'C', 'D', 'E'], coupon: [4.8, 9.5], px: [88, 101.5] },
  { assetClass: 'CMBS', deals: ['BANK', 'BMARK', 'WFCM', 'JPMCC', 'CSMC', 'GSMS'], tranches: ['A4', 'A5', 'AS', 'B', 'C', 'XA'], coupon: [3.0, 6.5], px: [78, 103] },
  { assetClass: 'RMBS', deals: ['CAS', 'STACR', 'JPMMT', 'GCAT', 'NRZT', 'TOWD'], tranches: ['M1', 'M2', 'B1', 'B2', 'A1'], coupon: [3.5, 8.0], px: [82, 102.5] },
  { assetClass: 'ABS', deals: ['SDART', 'AMXCA', 'DEFT', 'VZOT', 'CARMX', 'AESOP'], tranches: ['A2', 'A3', 'B', 'C', 'D'], coupon: [3.2, 7.2], px: [90, 101.8] },
  { assetClass: 'CDO', deals: ['TRAPZ', 'ANCHC', 'MERID'], tranches: ['A', 'B', 'C'], coupon: [5.5, 11.0], px: [70, 99] },
];
const RATINGS = ['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+', 'BBB', 'BBB-', 'BB+', 'BB', 'B+', 'NR'];
const TRADERS = ['A. Okafor', 'M. Reyes', 'S. Lindqvist', 'D. Chen', 'P. Novak', 'R. Whitfield', 'K. Tanaka', 'J. Marsh'];
const DESKS = ['SPG-CLO', 'SPG-CMBS', 'SPG-RMBS', 'SPG-ABS'];

const CUSIP_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
const seen = new Set();
function cusip() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 8; i++) c += CUSIP_CHARS[Math.floor(rnd() * CUSIP_CHARS.length)];
    c += Math.floor(rnd() * 10);
    if (!seen.has(c)) { seen.add(c); return c; }
  }
}

function isoDate(daysFromNow) {
  const d = new Date(Date.UTC(2026, 8, 12) + daysFromNow * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const rows = [];
for (let i = 0; i < ROWS; i++) {
  const ac = pick(ASSET_CLASSES);
  const deal = pick(ac.deals);
  const vintage = 2017 + Math.floor(rnd() * 9);
  const series = 1 + Math.floor(rnd() * 24);
  const tranche = pick(ac.tranches);
  const price = round(between(ac.px[0], ac.px[1]), 3);
  const originalFace = (1 + Math.floor(rnd() * 40)) * 250_000;
  const factor = round(between(0.35, 1.0), 6);
  rows.push({
    cusip: cusip(),
    dealName: `${deal} ${vintage}-${series}${ac.assetClass === 'CLO' ? 'A' : ''}`,
    assetClass: ac.assetClass,
    tranche,
    rating: pick(RATINGS),
    coupon: round(between(ac.coupon[0], ac.coupon[1]), 3),
    spreadDm: Math.round(between(85, 950)),
    yieldToMaturity: round(between(4.2, 12.5), 3),
    walYears: round(between(0.8, 9.5), 2),
    factor,
    originalFace,
    price,
    priorPrice: round(price + between(-1.6, 1.6), 3),
    pnl: Math.round(between(-450_000, 650_000)),
    maturityDate: isoDate(Math.floor(between(200, 365 * 12))),
    trader: pick(TRADERS),
    desk: DESKS.includes(`SPG-${ac.assetClass}`) ? `SPG-${ac.assetClass}` : 'SPG-CLO',
    lastUpdate: new Date(Date.UTC(2026, 8, 12, 11, 30)).toISOString(),
  });
}

const out = join(dirname(fileURLToPath(import.meta.url)), 'spg-positions.json');
writeFileSync(out, JSON.stringify(rows));
console.log(`wrote ${rows.length} positions -> ${out}`);
