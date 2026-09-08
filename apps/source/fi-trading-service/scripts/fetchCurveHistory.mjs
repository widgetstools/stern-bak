/**
 * Snapshot the real Treasury constant-maturity curve from FRED.
 *
 * The factor model's Nelson-Siegel-Svensson volatilities and mean-reversion
 * speeds were chosen to be defensible — a 90 bp level vol, a two-year level
 * half-life — but chosen is not measured. This pulls the actual daily curve so
 * they can be FITTED, and so the fit can be checked against the properties a
 * rates trader would notice: how much the ten-year moves in a day, how
 * strongly 2s and 10s co-move, how fast the curve mean-reverts.
 *
 * Writes `reference/curveHistory.json`. The service never fetches.
 * Source: FRED (Federal Reserve Bank of St. Louis), H.15 constant maturities.
 */
import { writeFileSync } from 'node:fs';

// The eleven constant maturities H.15 publishes, and the tenor each is.
const SERIES = [
  ['DGS1MO', 1 / 12], ['DGS3MO', 0.25], ['DGS6MO', 0.5], ['DGS1', 1], ['DGS2', 2],
  ['DGS3', 3], ['DGS5', 5], ['DGS7', 7], ['DGS10', 10], ['DGS20', 20], ['DGS30', 30],
];
const FROM = '2016-01-01';

async function series(id) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${FROM}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED ${res.status} for ${id}`);
  const text = await res.text();
  const out = new Map();
  for (const line of text.trim().split('\n').slice(1)) {
    const [date, value] = line.split(',');
    // FRED writes "." for a day the series did not publish — a holiday, or a
    // tenor that was not being issued. Not zero, and not carried forward.
    const parsed = Number(value);
    if (value !== '.' && Number.isFinite(parsed)) out.set(date, parsed);
  }
  return out;
}

const loaded = [];
for (const [id, tenor] of SERIES) {
  loaded.push({ id, tenor, points: await series(id) });
  process.stdout.write(`\r${loaded.length}/${SERIES.length} series`);
}
console.log();

// Only dates where EVERY tenor published: fitting a curve to a partial cross
// section would silently reshape it on the days a tenor was missing.
//
// And drop the days where every tenor reads exactly zero. FRED writes "." for
// most non-publications but ZERO for some holidays — Columbus Day 2023,
// Christmas 2024 — and a flat zero curve is not an observation. It read as a
// 478 bp round trip in the ten-year and pushed the fitted level volatility to
// 22% with a half-life of zero.
//
// A SINGLE tenor at zero is kept, because it happened: one-month bills printed
// 0.00% in March 2020 and again in April 2021.
const dates = [...(loaded[0]?.points.keys() ?? [])]
  .filter((d) => loaded.every((s) => s.points.has(d)))
  .filter((d) => loaded.some((s) => s.points.get(d) !== 0))
  .sort();

const observations = dates.map((date) => ({
  date,
  yields: loaded.map((s) => s.points.get(date)),
}));

writeFileSync('reference/curveHistory.json', JSON.stringify({
  source: 'https://fred.stlouisfed.org/ H.15 Treasury constant maturities',
  licence: 'Public domain (US Federal Reserve)',
  fetchedAt: new Date().toISOString(),
  tenors: SERIES.map(([, t]) => t),
  seriesIds: SERIES.map(([id]) => id),
  observations,
}, null, 1));

const last = observations[observations.length - 1];
console.log(`${observations.length} complete curves, ${dates[0]} to ${last.date}`);
console.log(`  latest: ${SERIES.map(([id], i) => `${id.replace('DGS', '')}=${last.yields[i]}`).join(' ')}`);
