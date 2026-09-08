/**
 * Fit the factor model to the real curve history, and report the difference.
 *
 * Prints only — it does not write the constants. A calibration that silently
 * rewrote the model would make every earlier scenario number irreproducible,
 * and the point of reading it is to decide, not to be overwritten.
 *
 *   node scripts/calibrateCurve.mjs
 */
import { readFileSync } from 'node:fs';

const L1 = 1.8, L2 = 11.0;                       // frozen, so the fit is linear
const TRADING_DAYS = 252, DT = 1 / TRADING_DAYS;

function loadings(tau) {
  const a = tau / L1, b = tau / L2;
  const ea = Math.exp(-a), eb = Math.exp(-b);
  const s1 = a === 0 ? 1 : (1 - ea) / a;
  const s2 = b === 0 ? 1 : (1 - eb) / b;
  return [1, s1, s1 - ea, s2 - eb];
}

/** Solve a small symmetric system by Gaussian elimination with partial pivoting. */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c || M[c][c] === 0) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i][i] ?? 0).map((v, i) => M[i][n] / M[i][i]);
}

const ref = JSON.parse(readFileSync('reference/curveHistory.json', 'utf8'));
const X = ref.tenors.map(loadings);                      // one row per tenor

// Ordinary least squares per day: beta = (X'X)^-1 X'y, with X fixed.
const XtX = Array.from({ length: 4 }, (_, i) =>
  Array.from({ length: 4 }, (_, j) => X.reduce((s, row) => s + row[i] * row[j], 0)));
const betas = ref.observations.map(({ yields }) => {
  const Xty = Array.from({ length: 4 }, (_, i) =>
    X.reduce((s, row, t) => s + row[i] * yields[t], 0));
  return solve(XtX.map((r) => [...r]), Xty);
});

// Fit quality: how far the fitted curve sits from the published one.
let worst = 0, sse = 0, n = 0;
for (const [d, { yields }] of ref.observations.entries()) {
  for (const [t, y] of yields.entries()) {
    const fit = X[t].reduce((s, l, i) => s + l * betas[d][i], 0);
    const err = Math.abs(fit - y);
    worst = Math.max(worst, err); sse += err * err; n++;
  }
}
console.log(`NSS fit over ${ref.observations.length} curves x ${ref.tenors.length} tenors`);
console.log(`  RMS error ${(Math.sqrt(sse / n) * 100).toFixed(2)} bp, worst ${(worst * 100).toFixed(1)} bp\n`);

/**
 * Ornstein-Uhlenbeck by regression on the exact transition.
 *
 *   x[t+1] = x[t] e^-k.dt + theta (1 - e^-k.dt) + noise
 *
 * so an OLS of x[t+1] on x[t] gives the slope `a = e^-k.dt` and intercept
 * `b = theta(1-a)`, and the residual standard deviation gives sigma. Fitting
 * the Euler approximation instead biases kappa upward at daily frequency.
 */
function fitOu(series) {
  const N = series.length - 1;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < N; i++) { const x = series[i], y = series[i + 1]; sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const a = (N * sxy - sx * sy) / (N * sxx - sx * sx);
  const b = (sy - a * sx) / N;
  let sse2 = 0;
  for (let i = 0; i < N; i++) sse2 += (series[i + 1] - (a * series[i] + b)) ** 2;
  const residSd = Math.sqrt(sse2 / (N - 2));
  const kappa = -Math.log(Math.max(1e-9, Math.min(0.999999, a))) / DT;
  const theta = b / (1 - a);
  // residual sd = sigma sqrt((1 - e^-2k.dt)/(2k))
  const sigma = residSd / Math.sqrt((1 - a * a) / (2 * kappa));
  return { kappa, theta, sigma, dailySd: residSd };
}

const CURRENT = [
  { kappa: 0.15, theta: 4.95, sigma: 0.9 }, { kappa: 0.6, theta: -0.85, sigma: 1.1 },
  { kappa: 1.2, theta: -1.6, sigma: 1.8 }, { kappa: 1.6, theta: 1.4, sigma: 2.2 },
];
const NAMES = ['level', 'slope', 'curvature', 'hump'];
const fits = [0, 1, 2, 3].map((i) => fitOu(betas.map((b) => b[i])));

console.log('factor      kappa (fitted / current)   theta (fitted / current)   sigma (fitted / current)   half-life');
for (const [i, f] of fits.entries()) {
  const c = CURRENT[i];
  console.log(
    `  ${NAMES[i].padEnd(10)} ${f.kappa.toFixed(2).padStart(6)} / ${String(c.kappa).padStart(5)}` +
    `        ${f.theta.toFixed(2).padStart(6)} / ${String(c.theta).padStart(5)}` +
    `        ${f.sigma.toFixed(2).padStart(6)} / ${String(c.sigma).padStart(5)}` +
    `      ${(Math.log(2) / f.kappa).toFixed(2)}y`);
}

// Correlation of the daily innovations, which is what the model draws.
const innov = [0, 1, 2, 3].map((i) => {
  const s = betas.map((b) => b[i]);
  return s.slice(1).map((v, t) => v - s[t]);
});
const corr = (a, b) => {
  const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  return num / Math.sqrt(da * db);
};
const CURRENT_CORR = [[1, -0.25, -0.2, -0.1], [-0.25, 1, 0.55, 0.15], [-0.2, 0.55, 1, -0.35], [-0.1, 0.15, -0.35, 1]];
console.log('\ninnovation correlation (fitted, current below):');
for (let i = 0; i < 4; i++) {
  console.log(`  ${NAMES[i].padEnd(10)} ` + [0, 1, 2, 3].map((j) =>
    `${corr(innov[i], innov[j]).toFixed(2).padStart(6)}`).join(' ') +
    '   |  ' + CURRENT_CORR[i].map((v) => String(v).padStart(5)).join(' '));
}

// What a trader would actually notice.
const tenYear = ref.observations.map(({ yields }) => yields[ref.tenors.indexOf(10)]);
const twoYear = ref.observations.map(({ yields }) => yields[ref.tenors.indexOf(2)]);
const d10 = tenYear.slice(1).map((v, i) => (v - tenYear[i]) * 100);
const d2 = twoYear.slice(1).map((v, i) => (v - twoYear[i]) * 100);
const sd = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
console.log(`\nobserved: 10Y daily sd ${sd(d10).toFixed(1)} bp, 2Y ${sd(d2).toFixed(1)} bp, corr(d2,d10) ${corr(d2, d10).toFixed(3)}`);
