/**
 * Ornstein-Uhlenbeck mean reversion.
 *
 *   dx = kappa * (theta - x) dt + sigma dW
 *
 * Every factor in the model is one of these. Mean reversion is what makes the
 * simulated market behave like a market rather than a random walk: spreads
 * that widen come back, curves that steepen re-flatten, and nothing drifts to
 * an absurd level over a 252-day run the way a driftless random walk will.
 *
 * The step is the EXACT transition density, not an Euler discretisation:
 *
 *   x(t+dt) = theta + (x(t) - theta) * exp(-kappa*dt)
 *             + sigma * sqrt((1 - exp(-2*kappa*dt)) / (2*kappa)) * Z
 *
 * Over a single day with kappa <= 4 the two agree to five figures, so this
 * looks like fussiness — but the opening-lot backfill runs the same processes
 * backwards over five years at weekly steps, where Euler visibly understates
 * mean reversion and leaves cost bases too far from par.
 */

export interface OuSpec {
  /** Mean-reversion speed, per year. Half-life is ln(2)/kappa. */
  kappa: number;
  /** Long-run level. */
  theta: number;
  /** Instantaneous volatility, per square-root year. */
  sigma: number;
}

/** How long it takes a displacement to decay by half, in years. */
export function halfLife(spec: OuSpec): number {
  if (spec.kappa <= 0) return Infinity;
  return Math.LN2 / spec.kappa;
}

/** Standard deviation of the stationary distribution: sigma / sqrt(2*kappa). */
export function stationarySd(spec: OuSpec): number {
  if (spec.kappa <= 0) return Infinity;
  return spec.sigma / Math.sqrt(2 * spec.kappa);
}

/** Standard deviation of a step of length `dt`. */
export function stepSd(spec: OuSpec, dt: number): number {
  if (spec.kappa <= 0) return spec.sigma * Math.sqrt(dt);
  return spec.sigma * Math.sqrt((1 - Math.exp(-2 * spec.kappa * dt)) / (2 * spec.kappa));
}

/** One exact step. `z` is a standard normal draw. */
export function ouStep(x: number, spec: OuSpec, dt: number, z: number): number {
  const decay = Math.exp(-spec.kappa * dt);
  return spec.theta + (x - spec.theta) * decay + stepSd(spec, dt) * z;
}

/** The deterministic part of a step — the expected value at `t + dt`. */
export function ouMean(x: number, spec: OuSpec, dt: number): number {
  return spec.theta + (x - spec.theta) * Math.exp(-spec.kappa * dt);
}

/**
 * A Brownian bridge between two known endpoints.
 *
 * Intraday replay must be stochastic but must still land exactly on the close
 * that was persisted, or querying the corpus for a date would disagree with
 * what the live feed converged to. Over a single day kappa*dt <= 0.016, so the
 * OU bridge collapses to the Brownian one to well inside a basis point.
 *
 * `fraction` runs 0 (open) to 1 (close); both ends are pinned exactly.
 */
export function bridge(
  open: number,
  close: number,
  fraction: number,
  sigma: number,
  horizonYears: number,
  z: number,
): number {
  if (fraction <= 0) return open;
  if (fraction >= 1) return close;
  const mean = open + (close - open) * fraction;
  const variance = sigma * sigma * horizonYears * fraction * (1 - fraction);
  return mean + Math.sqrt(variance) * z;
}
