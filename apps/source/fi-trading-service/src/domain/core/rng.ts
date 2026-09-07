/**
 * Deterministic random numbers.
 *
 * Two requirements shape this. The corpus must be reproducible — the same seed
 * must yield the same 70,000 positions and 450,000 trades, on any machine, in
 * any order the work was scheduled. And the generator is on the hot path of a
 * 30-million-row build, so it must be fast and allocation-free.
 *
 * xoshiro128** rather than a linear congruential generator: an LCG's low bits
 * are famously weak, and `Math.floor(rng() * n)` for small `n` leans on
 * exactly those bits. That shows up as visible banding in categorical draws —
 * every eighth security getting the same sector — which is precisely the kind
 * of artefact this corpus exists to avoid.
 */

export interface Rng {
  /** Uniform in [0, 1). */
  (): number;
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/**
 * Mix a seed into four well-separated words. Seeding xoshiro's state directly
 * from a small integer leaves it correlated for the first few outputs.
 */
function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = (Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0) >>> 0;
    z = (Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0) >>> 0;
    return (z ^ (z >>> 15)) >>> 0;
  };
}

/** A xoshiro128** stream. */
export function createRng(seed: number): Rng {
  const mix = splitmix32(seed === 0 ? 0x9e3779b9 : seed);
  let s0 = mix();
  let s1 = mix();
  let s2 = mix();
  let s3 = mix();
  return () => {
    const result = (Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0) >>> 0;
    const t = (s1 << 9) >>> 0;
    s2 = (s2 ^ s0) >>> 0;
    s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0;
    s0 = (s0 ^ s3) >>> 0;
    s2 = (s2 ^ t) >>> 0;
    s3 = rotl(s3, 11);
    return result / 4294967296;
  };
}

/**
 * Derive an independent stream seed from a global seed and a label.
 *
 * This is what makes the corpus build order-independent: every partition
 * derives its own seed from `(globalSeed, partitionKey)` rather than drawing
 * from a shared stream, so eight workers produce byte-identical output to one.
 */
export function deriveSeed(globalSeed: number, ...labels: (string | number)[]): number {
  let h = globalSeed >>> 0;
  for (const label of labels) {
    const text = String(label);
    for (let i = 0; i < text.length; i++) {
      h = (Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0) >>> 0;
    }
    h = (Math.imul(h ^ 0x2545f491, 0x9e3779b1) >>> 0) >>> 0;
  }
  return h === 0 ? 0x9e3779b9 : h;
}

/** Uniform in [min, max). */
export function uniform(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Uniform integer in [min, max], inclusive. */
export function uniformInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** One element, uniformly. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick from an empty list');
  return items[Math.floor(rng() * items.length)] as T;
}

/**
 * One element, by weight. Weights need not sum to 1; non-positive weights are
 * skipped so a zero-weight option is genuinely unreachable.
 */
export function pickWeighted<T>(rng: Rng, items: readonly T[], weights: readonly number[]): T {
  if (items.length === 0) throw new Error('pick from an empty list');
  let total = 0;
  for (const w of weights) if (w > 0) total += w;
  if (total <= 0) return items[0] as T;
  let target = rng() * total;
  for (let i = 0; i < items.length; i++) {
    const w = weights[i] ?? 0;
    if (w <= 0) continue;
    target -= w;
    if (target <= 0) return items[i] as T;
  }
  return items[items.length - 1] as T;
}

/**
 * Standard normal, by Marsaglia polar. Draws come in pairs, so the spare is
 * cached — halving the transcendental cost on a path that runs tens of
 * millions of times during a corpus build.
 */
export function createNormalDraw(rng: Rng): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = rng() * 2 - 1;
      v = rng() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const scale = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * scale;
    return u * scale;
  };
}

/** Exponential with the given rate. */
export function exponential(rng: Rng, rate: number): number {
  if (rate <= 0) throw new Error(`exponential rate must be positive, got ${rate}`);
  // 1 - rng() keeps the argument off zero, where log diverges.
  return -Math.log(1 - rng()) / rate;
}

/**
 * Poisson count. Knuth's product method below 30, where it is fastest; a
 * normal approximation above, where Knuth would need ~lambda iterations and
 * the approximation is already within a fraction of a count.
 */
export function poisson(rng: Rng, lambda: number, normalDraw?: () => number): number {
  if (lambda <= 0) return 0;
  if (lambda < 30) {
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k += 1;
      p *= rng();
    } while (p > limit);
    return k - 1;
  }
  const draw = normalDraw ?? createNormalDraw(rng);
  return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * draw()));
}

/** Shuffle in place, Fisher-Yates. */
export function shuffle<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = items[i] as T;
    items[i] = items[j] as T;
    items[j] = a;
  }
  return items;
}
