/**
 * The numerical primitives the factor model needs.
 *
 * Accuracy is chosen deliberately, not by default. `inverseNormalCdf` is
 * Wichura's AS241 rather than a compact approximation because it feeds the
 * Merton threshold model for rating migration: a threshold that is off in the
 * seventh digit shifts a downgrade by a day, which is invisible, but the same
 * error in the far tail shifts default probabilities by percent, which is not.
 */

/** Standard normal CDF, Hart's rational approximation. Accurate to ~1e-15. */
export function normalCdf(x: number): number {
  const abs = Math.abs(x);
  if (abs > 37) return x > 0 ? 1 : 0;
  const e = Math.exp((-abs * abs) / 2);
  let value: number;
  if (abs < 7.07106781186547) {
    let build = 3.52624965998911e-2 * abs + 0.700383064443688;
    build = build * abs + 6.37396220353165;
    build = build * abs + 33.912866078383;
    build = build * abs + 112.079291497871;
    build = build * abs + 221.213596169931;
    build = build * abs + 220.206867912376;
    value = e * build;
    build = 8.83883476483184e-2 * abs + 1.75566716318264;
    build = build * abs + 16.064177579207;
    build = build * abs + 86.7807322029461;
    build = build * abs + 296.564248779674;
    build = build * abs + 637.333633378831;
    build = build * abs + 793.826512519948;
    build = build * abs + 440.413735824752;
    value /= build;
  } else {
    let build = abs + 0.65;
    build = abs + 4 / build;
    build = abs + 3 / build;
    build = abs + 2 / build;
    build = abs + 1 / build;
    value = e / build / 2.506628274631;
  }
  return x > 0 ? 1 - value : value;
}

/** Standard normal density. */
export function normalPdf(x: number): number {
  return Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
}

const A = [
  3.3871328727963666080, 133.14166789178437745, 1971.5909503065514427,
  13731.693765509461125, 45921.953931549871457, 67265.770927008700853,
  33430.575583588128105, 2509.0809287301226727,
];
const B = [
  1, 42.313330701600911252, 687.1870074920579083, 5394.1960214247511077,
  21213.794301586595867, 39307.89580009271061, 28729.085735721942674,
  5226.495278852545925,
];
const C = [
  1.42343711074968357734, 4.6303378461565452959, 5.7694972214606914055,
  3.64784832476320460504, 1.27045825245236838258, 0.24178072517745061177,
  0.0227238449892691845833, 7.7454501427834140764e-4,
];
const D = [
  1, 2.05319162663775882187, 1.6763848301838038494, 0.68976733498510000455,
  0.14810397642748007459, 0.0151986665636164571966, 5.475938084995344946e-4,
  1.05075007164441684324e-9,
];
const E = [
  6.6579046435011037772, 5.4637849111641143699, 1.7848265399172913358,
  0.29656057182850489123, 0.026532189526576123093, 0.0012426609473880784386,
  2.71155556874348757815e-5, 2.01033439929228813265e-7,
];
const F = [
  1, 0.59983220655588793769, 0.13692988092273580531, 0.0148753612908506148525,
  7.868691311456132591e-4, 1.8463183175100546818e-5, 1.4215117583164458887e-7,
  2.04426310338993978564e-15,
];

/** Horner evaluation, highest-order coefficient last. */
function poly(coefficients: readonly number[], x: number): number {
  let result = coefficients[coefficients.length - 1] as number;
  for (let i = coefficients.length - 2; i >= 0; i--) {
    result = result * x + (coefficients[i] as number);
  }
  return result;
}

/** Inverse standard normal CDF (Wichura AS241 / PPND16). Accurate to ~1e-16. */
export function inverseNormalCdf(p: number): number {
  if (!(p > 0 && p < 1)) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    return Number.NaN;
  }
  const q = p - 0.5;
  if (Math.abs(q) <= 0.425) {
    const r = 0.180625 - q * q;
    return (q * poly(A, r)) / poly(B, r);
  }
  let r = q < 0 ? p : 1 - p;
  r = Math.sqrt(-Math.log(r));
  let value: number;
  if (r <= 5) {
    r -= 1.6;
    value = poly(C, r) / poly(D, r);
  } else {
    r -= 5;
    value = poly(E, r) / poly(F, r);
  }
  return q < 0 ? -value : value;
}

/**
 * Lower-triangular Cholesky factor of a symmetric positive-definite matrix.
 *
 * Throws rather than returning a NaN-filled factor: a correlation matrix that
 * is not positive definite is a modelling error, and it must surface where it
 * was written, not as quiet NaNs in a price three layers away.
 */
export function cholesky(matrix: readonly (readonly number[])[]): number[][] {
  const n = matrix.length;
  const lower: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = (matrix[i]?.[j] ?? 0) as number;
      for (let k = 0; k < j; k++) {
        sum -= (lower[i]?.[k] ?? 0) * (lower[j]?.[k] ?? 0);
      }
      if (i === j) {
        if (sum <= 0) {
          throw new Error(
            `Matrix is not positive definite: leading minor ${i + 1} has pivot ${sum}`,
          );
        }
        (lower[i] as number[])[j] = Math.sqrt(sum);
      } else {
        (lower[i] as number[])[j] = sum / ((lower[j]?.[j] ?? 1) as number);
      }
    }
  }
  return lower;
}

/**
 * Turn independent standard normals into correlated ones.
 *
 * Writes into `out` rather than allocating, because this runs once per factor
 * step for every day of the build.
 */
export function applyCholesky(
  factor: readonly (readonly number[])[],
  independent: readonly number[],
  out: number[],
): number[] {
  const n = factor.length;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const row = factor[i] as readonly number[];
    for (let j = 0; j <= i; j++) sum += (row[j] as number) * (independent[j] as number);
    out[i] = sum;
  }
  return out;
}

export function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

/** Round to `dp` decimals, avoiding the usual float-repr surprises. */
export function round(value: number, dp: number): number {
  const factor = 10 ** dp;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
